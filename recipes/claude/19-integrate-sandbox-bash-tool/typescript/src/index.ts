import { exec, spawn } from "child_process";
import * as fs from "fs";
import * as path from "path";
import Anthropic from "@anthropic-ai/sdk";

// Anthropic built-in bash tool definition
const BASH_TOOL_DEFINITION: Anthropic.Tool = {
  type: "bash_20250124",
  name: "bash"
};

interface ExecutionResult {
  exitCode: number;
  output: string;
  isError: boolean;
}

export class SandboxedBashRunner {
  private workingDirectory: string;
  private timeoutMs: number;
  private maxOutputBytes: number;
  private useDocker: boolean;
  private containerImage: string;

  constructor(options?: {
    workingDirectory?: string;
    timeoutMs?: number;
    maxOutputBytes?: number;
    useDocker?: boolean;
    containerImage?: string;
  }) {
    this.workingDirectory = options?.workingDirectory || "/tmp/claude_sandbox_ts";
    this.timeoutMs = options?.timeoutMs || 25000;
    this.maxOutputBytes = options?.maxOutputBytes || 65536;
    this.useDocker = options?.useDocker || false;
    this.containerImage = options?.containerImage || "alpine:3.20";

    if (!fs.existsSync(this.workingDirectory)) {
      fs.mkdirSync(this.workingDirectory, { recursive: true });
    }
  }

  public async execute(command: string, restart?: boolean): Promise<ExecutionResult> {
    if (restart) {
      if (fs.existsSync(this.workingDirectory)) {
        fs.rmSync(this.workingDirectory, { recursive: true, force: true });
      }
      fs.mkdirSync(this.workingDirectory, { recursive: true });
      return {
        exitCode: 0,
        output: "Bash session restarted. Working directory initialized.",
        isError: false
      };
    }

    if (!command || !command.trim()) {
      return {
        exitCode: 1,
        output: "Execution failed: Empty command provided.",
        isError: true
      };
    }

    // Heuristic guard: Block privilege escalations
    const dangerousTokens = ["sudo", "su -", "mkfs", "dd if=", ":(){ :|:& };:"];
    for (const token of dangerousTokens) {
      if (command.includes(token)) {
        return {
          exitCode: 1,
          output: `Security Violation: Execution of prohibited token '${token}' is blocked.`,
          isError: true
        };
      }
    }

    if (this.useDocker) {
      return this.executeInDocker(command);
    } else {
      return this.executeInSubprocess(command);
    }
  }

  private executeInSubprocess(command: string): Promise<ExecutionResult> {
    return new Promise((resolve) => {
      const child = spawn("bash", ["-c", command], {
        cwd: this.workingDirectory,
        env: {
          PATH: "/usr/local/bin:/usr/bin:/bin",
          HOME: this.workingDirectory,
          LANG: "en_US.UTF-8"
        }
      });

      let stdout = "";
      let stderr = "";
      let timedOut = false;

      const timer = setTimeout(() => {
        timedOut = true;
        child.kill("SIGKILL");
      }, this.timeoutMs);

      child.stdout.on("data", (chunk: Buffer) => {
        stdout += chunk.toString("utf-8");
      });

      child.stderr.on("data", (chunk: Buffer) => {
        stderr += chunk.toString("utf-8");
      });

      child.on("close", (code) => {
        clearTimeout(timer);

        if (timedOut) {
          resolve({
            exitCode: 124,
            output: `ExecutionError: Command exceeded timeout threshold of ${this.timeoutMs / 1000}s.`,
            isError: true
          });
          return;
        }

        let combined = (stdout + (stderr ? `\nSTDERR:\n${stderr}` : "")).trim();
        if (Buffer.byteLength(combined, "utf-8") > this.maxOutputBytes) {
          combined = combined.slice(0, this.maxOutputBytes) + "\n[Warning: Output truncated]";
        }

        const exitCode = code ?? 1;
        resolve({
          exitCode,
          output: combined || `(Command executed with exit code ${exitCode}, no output)`,
          isError: exitCode !== 0
        });
      });

      child.on("error", (err) => {
        clearTimeout(timer);
        resolve({
          exitCode: 1,
          output: `SubprocessSpawnError: ${err.message}`,
          isError: true
        });
      });
    });
  }

  private executeInDocker(command: string): Promise<ExecutionResult> {
    return new Promise((resolve) => {
      const args = [
        "run", "--rm",
        "--network", "none",
        "--memory", "256m",
        "--cpus", "1.0",
        "--read-only",
        "--cap-drop", "ALL",
        "--security-opt", "no-new-privileges",
        "-v", `${this.workingDirectory}:/workspace:rw`,
        "-w", "/workspace",
        this.containerImage,
        "sh", "-c", command
      ];

      const child = spawn("docker", args);
      let stdout = "";
      let stderr = "";
      let timedOut = false;

      const timer = setTimeout(() => {
        timedOut = true;
        child.kill("SIGKILL");
      }, this.timeoutMs);

      child.stdout.on("data", (chunk: Buffer) => {
        stdout += chunk.toString("utf-8");
      });

      child.stderr.on("data", (chunk: Buffer) => {
        stderr += chunk.toString("utf-8");
      });

      child.on("close", (code) => {
        clearTimeout(timer);
        if (timedOut) {
          resolve({
            exitCode: 124,
            output: `DockerTimeoutError: Container execution timed out after ${this.timeoutMs / 1000}s.`,
            isError: true
          });
          return;
        }

        const combined = (stdout + (stderr ? `\nSTDERR:\n${stderr}` : "")).trim();
        const exitCode = code ?? 1;
        resolve({
          exitCode,
          output: combined || "(No output)",
          isError: exitCode !== 0
        });
      });

      child.on("error", (err) => {
        clearTimeout(timer);
        resolve({
          exitCode: 1,
          output: `DockerSpawnError: ${err.message}`,
          isError: true
        });
      });
    });
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
