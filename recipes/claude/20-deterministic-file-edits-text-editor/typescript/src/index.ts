import * as fs from "fs";
import * as path from "path";
import Anthropic from "@anthropic-ai/sdk";

export class TextEditorError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TextEditorError";
  }
}

export interface TextEditorCommandInput {
  command: "view" | "create" | "str_replace" | "insert" | "undo_edit";
  path: string;
  file_text?: string;
  old_str?: string;
  new_str?: string;
  insert_line?: number;
  view_range?: [number, number];
}

export class TextEditorBackend {
  private workspaceRoot: string;
  private history: Map<string, string[]>;

  constructor(workspaceRoot: string) {
    this.workspaceRoot = path.resolve(workspaceRoot);
    this.history = new Map();
  }

  private resolveSafePath(targetPath: string): string {
    const resolved = path.isAbsolute(targetPath)
      ? path.resolve(targetPath)
      : path.resolve(this.workspaceRoot, targetPath);

    if (!resolved.startsWith(this.workspaceRoot)) {
      throw new TextEditorError(
        `Path traversal detected: Path '${targetPath}' resolves outside workspace root '${this.workspaceRoot}'.`
      );
    }
    return resolved;
  }

  private pushHistory(filePath: string, content: string): void {
    if (!this.history.has(filePath)) {
      this.history.set(filePath, []);
    }
    this.history.get(filePath)!.push(content);
  }

  public view(targetPath: string, viewRange?: [number, number]): string {
    const fullPath = this.resolveSafePath(targetPath);

    if (!fs.existsSync(fullPath)) {
      throw new TextEditorError(`Target path does not exist: ${targetPath}`);
    }

    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      const entries = fs.readdirSync(fullPath).sort();
      const lines = [`Directory listing of ${targetPath}:`];
      for (const entry of entries) {
        const isDir = fs.statSync(path.join(fullPath, entry)).isDirectory();
        lines.push(isDir ? `${entry}/` : entry);
      }
      return lines.join("\n");
    }

    const content = fs.readFileSync(fullPath, "utf-8");
    const lines = content.split("\n");
    const totalLines = lines.length;

    if (totalLines === 0 || (totalLines === 1 && lines[0] === "")) {
      return `File '${targetPath}' is empty.`;
    }

    let startLine = 1;
    let endLine = totalLines;

    if (viewRange) {
      if (viewRange.length !== 2) {
        throw new TextEditorError("view_range must contain exactly two integers: [start_line, end_line].");
      }
      startLine = Math.max(1, viewRange[0]);
      endLine = viewRange[1] === -1 ? totalLines : Math.min(totalLines, viewRange[1]);
      if (startLine > endLine) {
        throw new TextEditorError(
          `Invalid view_range [${startLine}, ${endLine}]: start line cannot exceed end line.`
        );
      }
    }

    const output: string[] = [];
    for (let i = startLine; i <= endLine; i++) {
      const lineText = lines[i - 1];
      output.push(`${i.toString().padStart(6, " ")}\t${lineText}`);
    }

    return output.join("\n");
  }

  public create(targetPath: string, fileText: string): string {
    const fullPath = this.resolveSafePath(targetPath);

    if (fs.existsSync(fullPath)) {
      throw new TextEditorError(
        `File already exists: ${targetPath}. Use str_replace or delete before recreating.`
      );
    }

    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, fileText, "utf-8");

    return `File '${targetPath}' created successfully (${fileText.length} characters).`;
  }

  public strReplace(targetPath: string, oldStr: string, newStr: string): string {
    const fullPath = this.resolveSafePath(targetPath);

    if (!fs.existsSync(fullPath)) {
      throw new TextEditorError(`File not found: ${targetPath}`);
    }

    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      throw new TextEditorError(`Cannot modify directory: ${targetPath}`);
    }

    const content = fs.readFileSync(fullPath, "utf-8");
    const occurrences = content.split(oldStr).length - 1;

    if (occurrences === 0) {
      throw new TextEditorError(
        `Target string not found in '${targetPath}'. Verify line numbers, indentation, and whitespace with 'view'.`
      );
    }
    if (occurrences > 1) {
      throw new TextEditorError(
        `Target string found ${occurrences} times in '${targetPath}'. str_replace requires a unique match. Include surrounding context lines.`
      );
    }

    this.pushHistory(fullPath, content);
    const updated = content.replace(oldStr, newStr);
    fs.writeFileSync(fullPath, updated, "utf-8");

    return `Successfully replaced 1 occurrence in '${targetPath}'.`;
  }

  public insert(targetPath: string, insertLine: number, newStr: string): string {
    const fullPath = this.resolveSafePath(targetPath);

    if (!fs.existsSync(fullPath)) {
      throw new TextEditorError(`File not found: ${targetPath}`);
    }

    const content = fs.readFileSync(fullPath, "utf-8");
    this.pushHistory(fullPath, content);

    const lines = content.split("\n");
    const totalLines = lines.length;

    if (insertLine < 0 || insertLine > totalLines) {
      throw new TextEditorError(
        `Invalid insert_line ${insertLine}. File has ${totalLines} lines (valid range: 0 to ${totalLines}).`
      );
    }

    lines.splice(insertLine, 0, newStr);
    fs.writeFileSync(fullPath, lines.join("\n"), "utf-8");

    return `Successfully inserted text after line ${insertLine} in '${targetPath}'.`;
  }

  public undoEdit(targetPath: string): string {
    const fullPath = this.resolveSafePath(targetPath);

    const historyStack = this.history.get(fullPath);
    if (!historyStack || historyStack.length === 0) {
      throw new TextEditorError(`No edit history found to undo for '${targetPath}'.`);
    }

    const previousContent = historyStack.pop()!;
    fs.writeFileSync(fullPath, previousContent, "utf-8");

    return `Reverted file '${targetPath}' to previous state (${historyStack.length} undo snapshots remaining).`;
  }

  public executeCommand(input: TextEditorCommandInput): { is_error: boolean; content: string } {
    try {
      switch (input.command) {
        case "view": {
          const res = this.view(input.path, input.view_range);
          return { is_error: false, content: res };
        }
        case "create": {
          if (typeof input.file_text !== "string") {
            return { is_error: true, content: "Missing 'file_text' for 'create' command." };
          }
          const res = this.create(input.path, input.file_text);
          return { is_error: false, content: res };
        }
        case "str_replace": {
          if (typeof input.old_str !== "string" || typeof input.new_str !== "string") {
            return { is_error: true, content: "Missing 'old_str' or 'new_str' for 'str_replace' command." };
          }
          const res = this.strReplace(input.path, input.old_str, input.new_str);
          return { is_error: false, content: res };
        }
        case "insert": {
          if (typeof input.insert_line !== "number" || typeof input.new_str !== "string") {
            return { is_error: true, content: "Missing 'insert_line' or 'new_str' for 'insert' command." };
          }
          const res = this.insert(input.path, input.insert_line, input.new_str);
          return { is_error: false, content: res };
        }
        case "undo_edit": {
          const res = this.undoEdit(input.path);
          return { is_error: false, content: res };
        }
        default:
          return { is_error: true, content: `Unsupported editor command: ${(input as any).command}` };
      }
    } catch (err: any) {
      return { is_error: true, content: `${err.name || "Error"}: ${err.message}` };
    }
  }
}

// Interactive agent loop runner
async function main() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const workspace = fs.mkdtempSync(path.join(require("os").tmpdir(), "editor-ts-"));
  const backend = new TextEditorBackend(workspace);

  console.log(`Initialized TypeScript text editor backend at: ${workspace}`);

  // Test local deterministic operations
  const c1 = backend.executeCommand({
    command: "create",
    path: "server.ts",
    file_text: 'export const PORT = 3000;\nconsole.log("Listening on", PORT);\n'
  });
  console.log("Create:", c1);

  const v1 = backend.executeCommand({
    command: "view",
    path: "server.ts"
  });
  console.log("View:\n" + v1.content);

  const r1 = backend.executeCommand({
    command: "str_replace",
    path: "server.ts",
    old_str: "export const PORT = 3000;",
    new_str: "export const PORT = 8080;"
  });
  console.log("Replace:", r1);

  if (!apiKey) {
    console.log("\nANTHROPIC_API_KEY not set. Offline demonstration complete.");
    return;
  }

  const client = new Anthropic({ apiKey });
  const model = process.env.ANTHROPIC_MODEL || "claude-3-7-sonnet-20250219";

  console.log("\nStarting Claude text editor session...");
  const response = await client.messages.create({
    model,
    max_tokens: 1024,
    tools: [
      {
        type: "text_editor_20250124",
        name: "str_replace_editor"
      }
    ],
    messages: [
      {
        role: "user",
        content: `Inspect server.ts in ${workspace} and add a shutdown listener.`
      }
    ]
  });

  console.log("Claude stop reason:", response.stop_reason);
  for (const block of response.content) {
    if (block.type === "tool_use") {
      console.log(`Tool use invoked: ${block.name}`, block.input);
    } else if (block.type === "text") {
      console.log(`Assistant: ${block.text}`);
    }
  }
}

if (require.main === module) {
  main().catch(console.error);
}
