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

/** Single-writer editor for a private Linux workspace.
 * /proc/self/fd anchors each open to held descriptors. O_NOFOLLOW rejects
 * symlink substitutions. This is not isolation from hostile processes with the
 * same uid or permission to move directories; use a private container mount.
 */
export class TextEditorBackend {
  private readonly workspaceRoot: string;
  private readonly history = new Map<string, string[]>();
  private rootFd: number | undefined;
  private lockOwned = false;
  private static readonly lockName = ".text-editor.lock";

  constructor(workspaceRoot: string) {
    if (process.platform !== "linux" || !process.getuid || !fs.constants.O_NOFOLLOW) {
      throw new TextEditorError("This backend requires Linux with /proc/self/fd and O_NOFOLLOW.");
    }
    this.workspaceRoot = fs.realpathSync(workspaceRoot);
    try {
      this.rootFd = fs.openSync(this.workspaceRoot, fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW);
      this.checkPrivate(fs.fstatSync(this.rootFd), true);
      // Fail closed when procfs descriptor paths are unavailable.
      const anchor = fs.statSync(this.fdPath(this.rootFd));
      const root = fs.fstatSync(this.rootFd);
      if (anchor.ino !== root.ino || anchor.dev !== root.dev) {
        throw new TextEditorError("Descriptor-relative procfs paths are unavailable.");
      }
      const lockFd = fs.openSync(this.fdPath(this.rootFd, TextEditorBackend.lockName),
        fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY | fs.constants.O_NOFOLLOW, 0o600);
      this.lockOwned = true;
      try { fs.writeFileSync(lockFd, `${process.pid}\n`); } finally { fs.closeSync(lockFd); }
    } catch (err: any) {
      this.close();
      throw new TextEditorError(`Cannot acquire private workspace: ${err.message}`);
    }
  }

  public close(): void {
    if (this.rootFd === undefined) return;
    try {
      if (this.lockOwned) fs.unlinkSync(this.fdPath(this.rootFd, TextEditorBackend.lockName));
    } finally {
      this.lockOwned = false;
      fs.closeSync(this.rootFd);
      this.rootFd = undefined;
    }
  }

  private fdPath(fd: number, entry?: string): string {
    return `/proc/self/fd/${fd}${entry === undefined ? "" : `/${entry}`}`;
  }

  private checkPrivate(info: fs.Stats, directory = false): void {
    if (info.uid !== process.getuid!() || (info.mode & 0o022) !== 0) {
      throw new TextEditorError("Workspace entries must be owned by the editor user and not group/world writable.");
    }
    if (directory ? !info.isDirectory() : (!info.isFile() || info.nlink !== 1)) {
      throw new TextEditorError(directory ? "Expected a workspace directory." : "Only regular files with one hard link can be edited or viewed.");
    }
  }

  private withinRoot(target: string): boolean {
    const relative = path.relative(this.workspaceRoot, target);
    return relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
  }

  private canonicalWithMissingParents(target: string): string {
    const missing: string[] = [];
    let existing = target;
    while (true) {
      try {
        fs.lstatSync(existing); // Dangling symlinks must fail realpath, not count as missing.
        return path.join(fs.realpathSync(existing), ...missing.reverse());
      } catch (err: any) {
        if (err.code !== "ENOENT") throw err;
        // A dangling symlink was present, so do not fall back to its parent.
        try {
          if (fs.lstatSync(existing).isSymbolicLink()) throw new TextEditorError("Dangling symlinks are not supported.");
        } catch (check: any) { if (check.code !== "ENOENT") throw check; }
        const parent = path.dirname(existing);
        if (parent === existing) throw err;
        missing.push(path.basename(existing));
        existing = parent;
      }
    }
  }

  private resolveSafePath(targetPath: string): string {
    if (typeof targetPath !== "string" || !targetPath || targetPath.includes("\0")) {
      throw new TextEditorError("Path must be a nonempty string without NUL characters.");
    }
    const resolved = path.resolve(this.workspaceRoot, targetPath);
    if (!this.withinRoot(resolved) || !this.withinRoot(this.canonicalWithMissingParents(resolved))) {
      throw new TextEditorError(`Path traversal detected: '${targetPath}' resolves outside workspace root.`);
    }
    if (path.relative(this.workspaceRoot, resolved).split(path.sep).includes(TextEditorBackend.lockName)) {
      throw new TextEditorError("The workspace lock is reserved for the backend.");
    }
    return resolved;
  }

  private withTarget<T>(targetPath: string, flags: number, createParents: boolean,
    operation: (fullPath: string, fd: number) => T): T {
    if (this.rootFd === undefined) throw new TextEditorError("The editor is closed.");
    const fullPath = this.resolveSafePath(targetPath);
    const relative = path.relative(this.workspaceRoot, fullPath);
    const parts = relative ? relative.split(path.sep) : [];
    const opened: number[] = [];
    let parentFd = this.rootFd;
    try {
      for (const part of parts.slice(0, -1)) {
        if (createParents) {
          try { fs.mkdirSync(this.fdPath(parentFd, part), { mode: 0o700 }); }
          catch (err: any) { if (err.code !== "EEXIST") throw err; }
        }
        parentFd = fs.openSync(this.fdPath(parentFd, part),
          fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW);
        opened.push(parentFd);
        this.checkPrivate(fs.fstatSync(parentFd), true);
      }
      if (!parts.length && flags !== fs.constants.O_RDONLY) {
        throw new TextEditorError("Cannot modify the workspace directory.");
      }
      const fd = parts.length ? fs.openSync(this.fdPath(parentFd, parts[parts.length - 1]),
        flags | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK, 0o600) : parentFd;
      if (parts.length) opened.push(fd);
      const info = fs.fstatSync(fd);
      this.checkPrivate(info, info.isDirectory() && flags === fs.constants.O_RDONLY);
      return operation(fullPath, fd);
    } catch (err: any) {
      if (err instanceof TextEditorError) throw err;
      throw new TextEditorError(`Unsafe or unavailable workspace path '${targetPath}': ${err.message}`);
    } finally {
      for (const fd of opened.reverse()) fs.closeSync(fd);
    }
  }

  private read(fd: number): string {
    const length = fs.fstatSync(fd).size;
    const buffer = Buffer.alloc(length);
    let offset = 0;
    while (offset < length) {
      const read = fs.readSync(fd, buffer, offset, length - offset, offset);
      if (!read) break;
      offset += read;
    }
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer.subarray(0, offset));
  }

  private write(fd: number, content: string): void {
    const buffer = Buffer.from(content, "utf-8");
    let offset = 0;
    while (offset < buffer.length) offset += fs.writeSync(fd, buffer, offset, buffer.length - offset, offset);
    fs.ftruncateSync(fd, buffer.length);
  }

  private pushHistory(filePath: string, content: string): void {
    if (!this.history.has(filePath)) this.history.set(filePath, []);
    const snapshots = this.history.get(filePath)!;
    snapshots.push(content);
    if (snapshots.length > 50) snapshots.shift();
  }

  public view(targetPath: string, viewRange?: [number, number]): string {
    return this.withTarget(targetPath, fs.constants.O_RDONLY, false, (_, fd) => {
      if (fs.fstatSync(fd).isDirectory()) {
        const entries = fs.readdirSync(this.fdPath(fd), { withFileTypes: true });
        const labels = entries.filter(entry => entry.name !== TextEditorBackend.lockName)
          .map(entry => entry.isDirectory() ? `${entry.name}/` : entry.name).sort();
        return [`Directory listing of ${targetPath}:`, ...labels].join("\n");
      }
      const content = this.read(fd);
      if (!content) return `File '${targetPath}' is empty.`;
      const lines = content.split(/\r?\n/);
      if (lines[lines.length - 1] === "") lines.pop();
      const totalLines = lines.length;
      let startLine = 1, endLine = totalLines;
      if (viewRange !== undefined) {
        if (viewRange.length !== 2 || viewRange.some(line => !Number.isInteger(line))) {
          throw new TextEditorError("view_range must contain exactly two integers: [start_line, end_line].");
        }
        startLine = Math.max(1, viewRange[0]);
        endLine = viewRange[1] === -1 ? totalLines : Math.min(totalLines, viewRange[1]);
        if (startLine > endLine) throw new TextEditorError("Invalid view_range: start line cannot exceed end line.");
      }
      return lines.slice(startLine - 1, endLine).map((line, i) => `${(startLine + i).toString().padStart(6, " ")}\t${line}`).join("\n");
    });
  }

  public create(targetPath: string, fileText: string): string {
    if (typeof fileText !== "string") throw new TextEditorError("file_text must be a string.");
    this.withTarget(targetPath, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL, true,
      (_, fd) => this.write(fd, fileText));
    return `File '${targetPath}' created successfully (${fileText.length} characters).`;
  }

  public strReplace(targetPath: string, oldStr: string, newStr: string): string {
    if (typeof oldStr !== "string" || !oldStr || typeof newStr !== "string") {
      throw new TextEditorError("old_str must be nonempty and both replacement parameters must be strings.");
    }
    this.withTarget(targetPath, fs.constants.O_RDWR, false, (fullPath, fd) => {
      const content = this.read(fd);
      const occurrences = content.split(oldStr).length - 1;
      if (occurrences !== 1) throw new TextEditorError(`Target string found ${occurrences} times in '${targetPath}'; str_replace requires a unique match.`);
      // A function replacement preserves literal '$&', '$1', and '$`' text.
      this.write(fd, content.replace(oldStr, () => newStr));
      this.pushHistory(fullPath, content);
    });
    return `Successfully replaced 1 occurrence in '${targetPath}'.`;
  }

  public insert(targetPath: string, insertLine: number, newStr: string): string {
    if (typeof newStr !== "string") throw new TextEditorError("new_str must be a string.");
    this.withTarget(targetPath, fs.constants.O_RDWR, false, (fullPath, fd) => {
      const content = this.read(fd);
      const lines = content.match(/[^\n]*\n|[^\n]+$/g) || [];
      if (!Number.isInteger(insertLine) || insertLine < 0 || insertLine > lines.length) {
        throw new TextEditorError(`Invalid insert_line ${insertLine}; valid range is 0 to ${lines.length}.`);
      }
      const insertText = !newStr.endsWith("\n") && lines.length ? `${newStr}\n` : newStr;
      if (insertLine === lines.length && lines.length && !lines[lines.length - 1].endsWith("\n")) {
        lines[lines.length - 1] += "\n";
      }
      lines.splice(insertLine, 0, insertText);
      this.write(fd, lines.join(""));
      this.pushHistory(fullPath, content);
    });
    return `Successfully inserted text after line ${insertLine} in '${targetPath}'.`;
  }

  public undoEdit(targetPath: string): string {
    return this.withTarget(targetPath, fs.constants.O_RDWR, false, (fullPath, fd) => {
      const history = this.history.get(fullPath);
      if (!history?.length) throw new TextEditorError(`No edit history found to undo for '${targetPath}'.`);
      this.write(fd, history[history.length - 1]);
      history.pop();
      return `Reverted file '${targetPath}' to previous state (${history.length} undo snapshots remaining).`;
    });
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

  try {
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
  } finally { backend.close(); }
}

if (require.main === module) {
  main().catch(err => { console.error(err); process.exitCode = 1; });
}
