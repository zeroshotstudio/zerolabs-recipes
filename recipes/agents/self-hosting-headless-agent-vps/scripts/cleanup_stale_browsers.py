#!/usr/bin/env python3
"""Sweep and terminate stale or orphaned Chromium processes running longer than 15 minutes."""
import psutil
import time

def sweep_orphaned_browsers():
    current_time = time.time()
    for proc in psutil.process_iter(["pid", "name", "create_time"]):
        try:
            name = proc.info["name"].lower()
            if "chrome" in name or "chromium" in name:
                if current_time - proc.info["create_time"] > 900:
                    print(f"Sweeping stale browser PID: {proc.info['pid']}")
                    proc.terminate()
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            pass

if __name__ == "__main__":
    sweep_orphaned_browsers()
