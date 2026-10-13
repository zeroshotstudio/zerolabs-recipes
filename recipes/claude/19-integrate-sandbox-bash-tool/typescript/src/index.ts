import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { randomUUID } from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";

const BASH_TOOL_DEFINITION = { type: "bash_20250124" as const, name: "bash" as const };
export const DEFAULT_IMAGE = "zerolabs-bash-sandbox:1.0.0";
// Verify actual kernel controls before executing model-provided text.
const SANDBOX_PREFLIGHT = `set -eu
if [ "$(id -u)" = 0 ] ||
   [ "$(cat /sys/fs/cgroup/memory.max)" != 134217728 ] ||
   [ "$(cat /sys/fs/cgroup/memory.swap.max)" != 0 ] ||
   [ "$(cat /sys/fs/cgroup/pids.max)" != 64 ] ||
   [ "$(cat /sys/fs/cgroup/cpu.max)" != "50000 100000" ] ||
   [ "$(ls /sys/class/net)" != lo ]; then
  printf '%s\\n' 'Sandbox unavailable: required UID, cgroup v2 or network isolation is not enforced.' >&2
  exit 126
fi
exec bash --noprofile --norc -c "$1"
`;

export interface ExecutionResult {
  exitCode: number;
  output: string;
  isError: boolean;
}

/** One command per disposable container. /inputs is read-only; scratch is ephemeral. */
export class SandboxedBashRunner {
  private readonly workingDirectory?: string;
  private readonly timeoutMs: number;
  private readonly maxOutputBytes: number;
  private readonly containerImage: string;
  private readonly dockerCommand: string[];
  private readonly uid: number;
  private readonly gid: number;

  constructor(options: {
    workingDirectory?: string;
    timeoutMs?: number;
    maxOutputBytes?: number;
    useDocker?: boolean;
    containerImage?: string;
    dockerSocket?: string;
  } = {}) {
    if (options.useDocker === false) {
      throw new Error("Host shell execution is disabled; Docker isolation is required.");
    }
    this.timeoutMs = options.timeoutMs ?? 20000;
    this.maxOutputBytes = options.maxOutputBytes ?? 65536;
    if (!Number.isFinite(this.timeoutMs) || this.timeoutMs <= 0 || this.timeoutMs > 120000) {
      throw new Error("timeoutMs must be between 0 and 120000.");
    }
    if (!Number.isInteger(this.maxOutputBytes) || this.maxOutputBytes < 256 || this.maxOutputBytes > 1048576) {
      throw new Error("maxOutputBytes must be between 256 and 1048576.");
    }
    this.containerImage = options.containerImage ?? DEFAULT_IMAGE;
    if (!this.containerImage || this.containerImage.startsWith("-")) {
      throw new Error("A trusted, pre-built container image is required.");
    }
    const dockerSocket = options.dockerSocket ?? "/var/run/docker.sock";
    if (!path.isAbsolute(dockerSocket)) throw new Error("dockerSocket must be an absolute local Unix socket path.");
    this.dockerCommand = ["--host=unix://" + dockerSocket];
    this.uid = process.getuid?.() || 65534;
    this.gid = process.getgid?.() || 65534;
    if (options.workingDirectory !== undefined) {
      const workspace = fs.realpathSync(options.workingDirectory);
      if (!fs.statSync(workspace).isDirectory() || workspace === path.parse(workspace).root || workspace.includes(",")) {
        throw new Error("workingDirectory must be a dedicated existing input directory without commas.");
      }
      this.workingDirectory = workspace;
    }
  }

  private arguments(name: string, command: string): string[] {
    const args = [
      ...this.dockerCommand, "create", "--rm", "--name", name,
      "--pull", "never", "--stop-timeout", "1", "--log-driver", "none",
      "--network", "none", "--memory", "128m", "--memory-swap", "128m",
      "--cpus", "0.5", "--pids-limit", "64",
      "--ulimit", "nofile=256:256", "--ulimit", "fsize=16777216:16777216",
      "--read-only", "--cap-drop", "ALL", "--security-opt", "no-new-privileges",
      "--user", `${this.uid}:${this.gid}`,
      "--tmpfs", `/workspace:rw,nosuid,nodev,size=64m,uid=${this.uid},gid=${this.gid},mode=700`,
      "--tmpfs", "/tmp:rw,noexec,nosuid,nodev,size=16m,mode=1777",
      "--workdir", "/workspace", "--env", "HOME=/workspace", "--env", "LANG=C.UTF-8",
    ];
    for (const key of ["HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "NO_PROXY", "FTP_PROXY", "http_proxy", "https_proxy", "all_proxy", "no_proxy", "ftp_proxy"]) {
      args.push("--env", `${key}=`);
    }
    if (this.workingDirectory) args.push("--mount", `type=bind,src=${this.workingDirectory},dst=/inputs,readonly`);
    args.push("--entrypoint", "timeout", this.containerImage, "-s", "KILL", `${this.timeoutMs / 1000}`, "bash", "--noprofile", "--norc", "-c", SANDBOX_PREFLIGHT, "sandbox", command);
    return args;
  }

  private dockerControl(args: string[]): Promise<{ code: number | null; output: string }> {
    return new Promise((resolve) => {
      let output = "";
      const control = spawn("docker", [...this.dockerCommand, ...args], { stdio: ["ignore", "pipe", "ignore"] });
      control.stdout.on("data", (chunk: Buffer) => { if (output.length < 128) output += chunk.toString("utf8").slice(0, 128 - output.length); });
      const timer = setTimeout(() => { control.kill("SIGKILL"); resolve({ code: null, output }); }, 2000);
      control.once("error", () => { clearTimeout(timer); resolve({ code: null, output }); });
      control.once("close", (code) => { clearTimeout(timer); resolve({ code, output }); });
    });
  }

  private async removeContainer(name: string): Promise<boolean> {
    const deadline = Date.now() + 4500;
    await this.dockerControl(["rm", "--force", name]);
    while (Date.now() < deadline) {
      const inspected = await this.dockerControl(["inspect", "--type", "container", "--format", "{{.Id}}", name]);
      if (inspected.code === null) return false;
      if (inspected.code !== 0) {
        const remaining = await this.dockerControl(["ps", "--all", "--filter", `name=^/${name}$`, "--format", "{{.Names}}"]);
        return remaining.code === 0 && !remaining.output.trim();
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    return false;
  }

  private capture(args: string[], deadline: number): Promise<{ code: number; captured: Buffer; reason: string }> {
    return new Promise((resolve) => {
      const captured: Buffer[] = [];
      let bytes = 0;
      let reason = "";
      let forcedCode = 1;
      const child = spawn("docker", args, { stdio: ["ignore", "pipe", "pipe"] });
      const stop = (code: number, note: string) => {
        if (reason) return;
        reason = note;
        forcedCode = code;
        // Stop the client before cleanup so a full attach pipe cannot block removal.
        child.kill("SIGKILL");
      };
      const timer = setTimeout(() => stop(124, `Command timed out after ${this.timeoutMs / 1000}s.`), Math.max(1, deadline - Date.now()));
      const capture = (chunk: Buffer) => {
        if (reason) return;
        const available = this.maxOutputBytes - bytes;
        captured.push(Buffer.from(chunk.subarray(0, available)));
        bytes += Math.min(available, chunk.length);
        if (chunk.length > available) stop(125, "Output limit exceeded; container stopped.");
      };
      child.stdout.on("data", capture);
      child.stderr.on("data", capture);
      child.once("error", (error) => {
        clearTimeout(timer);
        reason = `Sandbox unavailable: ${error.message}. Host execution is disabled.`;
      });
      child.once("close", (code) => {
        clearTimeout(timer);
        resolve({ code: reason ? forcedCode : (code ?? 1), captured: Buffer.concat(captured, bytes), reason });
      });
    });
  }

  private format(captured: Buffer, reason: string): string {
    const note = (reason ? Buffer.from("\n" + reason) : Buffer.alloc(0)).subarray(0, this.maxOutputBytes);
    const budget = Math.max(0, this.maxOutputBytes - note.length);
    // Discard invalid UTF-8; replacement characters could exceed the byte budget.
    return captured.subarray(0, budget).toString("utf8").replace(/\uFFFD/g, "") + note.toString("utf8").replace(/\uFFFD/g, "");
  }

  public async execute(command: string, restart = false): Promise<ExecutionResult> {
    if (restart) return { exitCode: 0, output: "Session reset: every command uses fresh ephemeral scratch storage.", isError: false };
    if (typeof command !== "string" || !command.trim() || command.includes("\0")) return { exitCode: 1, output: "Execution failed: command must be nonempty text without NUL bytes.", isError: true };
    const name = "claude-bash-" + randomUUID().replaceAll("-", "");
    const deadline = Date.now() + this.timeoutMs;
    const created = await this.capture(this.arguments(name, command), deadline);
    if (created.code !== 0 || created.reason) {
      await this.removeContainer(name);
      // The daemon may finish an accepted create later. Never start or falsely confirm cleanup.
      created.reason += ` No command started. Creation cleanup cannot be confirmed; inspect ${name}.`;
      return { exitCode: created.code || 1, output: this.format(created.captured, created.reason), isError: true };
    }
    if (Date.now() >= deadline) {
      let reason = "Deadline reached before execution; no command started.";
      if (!await this.removeContainer(name)) reason += ` Cleanup could not be confirmed; inspect ${name}.`;
      return { exitCode: 124, output: this.format(Buffer.alloc(0), reason), isError: true };
    }
    const result = await this.capture([...this.dockerCommand, "start", "--attach", name], deadline);
    if (!await this.removeContainer(name)) {
      result.reason += ` Cleanup could not be confirmed; operator must inspect ${name}.`;
      result.code ||= 1;
    }
    return { exitCode: result.code, output: this.format(result.captured, result.reason) || `(Command exited ${result.code}, no output)`, isError: result.code !== 0 };
  }

}

export async function runSandboxedBashAgent(
  prompt: string,
  maxTurns: number = 5
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY environment variable is required.");
  }

  const client = new Anthropic({ apiKey });
  const model = process.env.ANTHROPIC_MODEL || "claude-3-7-sonnet-20250219";
  const runner = new SandboxedBashRunner();

  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: prompt }
  ];

  console.log(`[*] Starting Sandboxed Bash Agent Loop (Max Turns: ${maxTurns})...`);
  console.log(`[*] User Prompt: ${prompt}\n`);

  for (let turn = 1; turn <= maxTurns; turn++) {
    console.log(`--- Turn ${turn}/${maxTurns} ---`);

    const response = await client.messages.create({
      model,
      max_tokens: 2048,
      tools: [BASH_TOOL_DEFINITION],
      messages
    });

    messages.push({ role: "assistant", content: response.content });

    if (response.stop_reason === "end_turn") {
      console.log("[+] Claude completed the sequence without further tool invocations.");
      const textBlocks = response.content
        .filter((b) => b.type === "text")
        .map((b) => (b as Anthropic.TextBlock).text);
      return textBlocks.join("\n");
    }

    if (response.stop_reason === "tool_use") {
      const toolResultBlocks: Anthropic.ToolResultBlockParam[] = [];

      for (const block of response.content) {
        if (block.type === "tool_use") {
          console.log(`[Tool Call] ID: ${block.id}`);
          console.log(`[Tool Call] Tool: ${block.name}`);
          console.log(`[Tool Call] Input: ${JSON.stringify(block.input)}`);

          if (block.name === "bash") {
            const inputObj = block.input as { command?: string; restart?: boolean };
            const command = inputObj.command || "";
            const restart = Boolean(inputObj.restart);

            const result = await runner.execute(command, restart);
            console.log(`[Execution] Exit Code: ${result.exitCode}`);
            console.log(`[Execution] Output Preview: ${result.output.slice(0, 160)}...`);
            console.log(`[Execution] isError: ${result.isError}\n`);

            toolResultBlocks.push({
              type: "tool_result",
              tool_use_id: block.id,
              content: result.output,
              is_error: result.isError
            });
          } else {
            toolResultBlocks.push({
              type: "tool_result",
              tool_use_id: block.id,
              content: `Error: Unknown tool '${block.name}' requested.`,
              is_error: true
            });
          }
        }
      }

      messages.push({
        role: "user",
        content: toolResultBlocks
      });
    } else {
      console.log(`[!] Unexpected stop reason: ${response.stop_reason}`);
      break;
    }
  }

  return "Agent loop reached maximum turn budget without completion.";
}

if (require.main === module) {
  const prompt = "Inspect current memory statistics and available disk capacity.";
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log("[!] ANTHROPIC_API_KEY not configured. Running dry-run sandbox test...");
    const runner = new SandboxedBashRunner();
    runner.execute("uname -a && echo 'TypeScript Sandbox Verified'").then((res) => {
      console.log("Exit Code:", res.exitCode);
      console.log("Output:\n", res.output);
      console.log("isError:", res.isError);
    });
  } else {
    runSandboxedBashAgent(prompt)
      .then((res) => console.log("\nFinal Agent Response:\n", res))
      .catch((err) => console.error("Error executing agent:", err));
  }
}
