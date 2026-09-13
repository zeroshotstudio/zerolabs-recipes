#!/usr/bin/env python3
"""
MLX Sentinel: On-Demand Process-Group Supervisor for Apple Silicon MLX
Eliminates idle RAM waste by dynamically spawning mlx_lm.server and
reclaiming Metal unified memory after inactivity periods.
"""

import http.server
import json
import os
import signal
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request

# Configuration Constants
GATEWAY_HOST = os.getenv("GATEWAY_HOST", "127.0.0.1")
GATEWAY_PORT = int(os.getenv("GATEWAY_PORT", "8080"))
BACKEND_HOST = os.getenv("BACKEND_HOST", "127.0.0.1")
BACKEND_PORT = int(os.getenv("BACKEND_PORT", "8081"))
IDLE_TIMEOUT_SECONDS = int(os.getenv("IDLE_TIMEOUT_SECONDS", "600"))  # 10 minutes
MODEL_PATH = os.getenv("MODEL_PATH", "mlx-community/Llama-3.2-3B-Instruct-4bit")


class ProcessGroupSupervisor:
    """Manages backend lifecycle using POSIX process groups."""

    def __init__(self, model_path: str, backend_port: int, idle_timeout: int):
        self.model_path = model_path
        self.backend_port = backend_port
        self.idle_timeout = idle_timeout
        self.process: subprocess.Popen | None = None
        self.pgid: int | None = None
        self.last_active_time = 0.0
        self.lock = threading.Lock()
        self.is_shutting_down = False

        # Start background inactivity monitor thread
        self.reaper_thread = threading.Thread(target=self._inactivity_loop, daemon=True)
        self.reaper_thread.start()

    def touch(self):
        """Record activity timestamp to reset the idle timer."""
        self.last_active_time = time.time()

    def is_healthy(self) -> bool:
        """Poll the backend healthcheck endpoint."""
        if not self.process or self.process.poll() is not None:
            return False
        url = f"http://{BACKEND_HOST}:{self.backend_port}/v1/models"
        try:
            req = urllib.request.Request(url, method="GET")
            with urllib.request.urlopen(req, timeout=0.5) as resp:
                return resp.status == 200
        except Exception:
            return False

    def ensure_backend(self):
        """Cold-start the backend process tree if offline."""
        with self.lock:
            if self.is_healthy():
                self.touch()
                return

            # Clean any stale dead process references
            self._terminate_tree_locked()

            cmd = [
                sys.executable,
                "-m",
                "mlx_lm.server",
                "--model",
                self.model_path,
                "--port",
                str(self.backend_port),
                "--host",
                BACKEND_HOST,
            ]

            # Critical macOS Darwin primitive: start_new_session=True sets a new POSIX PGID
            # equivalent to preexec_fn=os.setsid, ensuring child forks are tracked
            self.process = subprocess.Popen(
                cmd,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                start_new_session=True,
            )
            self.pgid = os.getpgid(self.process.pid)
            self.touch()

            # Poll for cold start readiness
            start_wait = time.perf_counter()
            max_wait_seconds = 30.0
            ready = False

            while (time.perf_counter() - start_wait) < max_wait_seconds:
                if self.process.poll() is not None:
                    raise RuntimeError(
                        f"Backend died on startup with exit code {self.process.returncode}"
                    )
                if self.is_healthy():
                    ready = True
                    break
                time.sleep(0.1)

            if not ready:
                self._terminate_tree_locked()
                raise TimeoutError("mlx_lm.server failed to initialize within timeout.")

    def _terminate_tree_locked(self):
        """Atomically kill the entire process group."""
        if self.pgid is not None:
            try:
                # Deliver SIGTERM to entire process group
                os.killpg(self.pgid, signal.SIGTERM)
            except ProcessLookupError:
                pass
            except Exception as e:
                print(f"[Sentinel] Error signaling process group {self.pgid}: {e}", file=sys.stderr)

        if self.process:
            try:
                self.process.wait(timeout=3.0)
            except subprocess.TimeoutExpired:
                try:
                    os.killpg(self.pgid, signal.SIGKILL)
                except Exception:
                    pass

        self.process = None
        self.pgid = None

    def _inactivity_loop(self):
        """Reclaim memory when idle timer expires."""
        while not self.is_shutting_down:
            time.sleep(5)
            with self.lock:
                if self.process and self.process.poll() is None:
                    idle_duration = time.time() - self.last_active_time
                    if idle_duration >= self.idle_timeout:
                        print(
                            f"[Sentinel] Inactivity limit ({self.idle_timeout}s) reached. Evicting backend."
                        )
                        self._terminate_tree_locked()

    def shutdown(self):
        """Clean shutdown of supervisor and child processes."""
        self.is_shutting_down = True
        with self.lock:
            self._terminate_tree_locked()


supervisor = ProcessGroupSupervisor(
    model_path=MODEL_PATH,
    backend_port=BACKEND_PORT,
    idle_timeout=IDLE_TIMEOUT_SECONDS,
)


class SentinelProxyHandler(http.server.BaseHTTPRequestHandler):
    """Transparent reverse proxy forwarding requests to the MLX backend."""

    def log_message(self, format, *args):
        # Silence default stderr request logging
        pass

    def do_POST(self):
        # Route check
        if self.path not in ["/v1/chat/completions", "/v1/completions"]:
            self.send_error(404, "Endpoint not supported by Sentinel proxy.")
            return

        content_length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(content_length)

        try:
            supervisor.ensure_backend()
            supervisor.touch()
        except Exception as e:
            self.send_response(503)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            err_payload = json.dumps({"error": f"Failed to activate MLX backend: {str(e)}"})
            self.wfile.write(err_payload.encode("utf-8"))
            return

        # Forward request to backend
        target_url = f"http://{BACKEND_HOST}:{BACKEND_PORT}{self.path}"
        req = urllib.request.Request(
            target_url,
            data=body,
            headers={k: v for k, v in self.headers.items() if k.lower() != "host"},
            method="POST",
        )

        try:
            with urllib.request.urlopen(req, timeout=120) as resp:
                self.send_response(resp.status)
                for header, val in resp.headers.items():
                    if header.lower() not in ["content-length", "transfer-encoding"]:
                        self.send_header(header, val)
                response_data = resp.read()
                self.send_header("Content-Length", str(len(response_data)))
                self.end_headers()
                self.wfile.write(response_data)
                supervisor.touch()
        except urllib.error.HTTPError as he:
            self.send_response(he.code)
            self.end_headers()
            self.wfile.write(he.read())
        except Exception as err:
            self.send_error(502, f"Proxy forward failure: {err}")

    def do_GET(self):
        if self.path == "/health":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            status = {
                "supervisor": "active",
                "backend_running": supervisor.is_healthy(),
                "idle_seconds": (
                    round(time.time() - supervisor.last_active_time, 1)
                    if supervisor.process
                    else None
                ),
            }
            self.wfile.write(json.dumps(status).encode("utf-8"))
            return

        self.send_error(404, "Route not found.")


def main():
    def handle_signal(sig, frame):
        print("\n[Sentinel] Signal received. Shutting down cleanly.")
        supervisor.shutdown()
        sys.exit(0)

    signal.signal(signal.SIGINT, handle_signal)
    signal.signal(signal.SIGTERM, handle_signal)

    server = http.server.ThreadingHTTPServer((GATEWAY_HOST, GATEWAY_PORT), SentinelProxyHandler)
    print(f"[Sentinel] Gateway listening on http://{GATEWAY_HOST}:{GATEWAY_PORT}")
    try:
        server.serve_forever()
    finally:
        supervisor.shutdown()


if __name__ == "__main__":
    main()
