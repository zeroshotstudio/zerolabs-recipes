import { test } from "node:test";
import * as assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { TextEditorBackend, TextEditorError } from "../src/index";

function fixture() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "editor-security-"));
  const root = path.join(base, "workspace"), outside = path.join(base, "workspace-other");
  fs.mkdirSync(root, { mode: 0o700 });
  fs.mkdirSync(outside, { mode: 0o700 });
  const marker = path.join(outside, "private.txt");
  fs.writeFileSync(marker, "outside secret\n", { mode: 0o600 });
  const editor = new TextEditorBackend(root);
  const blocked = (fn: () => unknown) => {
    assert.throws(fn, TextEditorError);
    assert.equal(fs.readFileSync(marker, "utf8"), "outside secret\n");
  };
  const allBlocked = (target: string) => {
    blocked(() => editor.view(target));
    blocked(() => editor.create(target, "overwrite"));
    blocked(() => editor.strReplace(target, "secret", "overwrite"));
    blocked(() => editor.insert(target, 0, "overwrite"));
    blocked(() => editor.undoEdit(target));
  };
  return { root, outside, marker, editor, blocked, allBlocked,
    close: () => { editor.close(); fs.rmSync(base, { recursive: true, force: true }); } };
}

test("reject sibling-prefix and traversal for every operation", () => {
  const f = fixture();
  try {
    for (const target of [f.marker, "../workspace-other/private.txt", "child/../../workspace-other/private.txt"]) f.allBlocked(target);
    f.blocked(() => f.editor.create("../workspace-other/new/deep.txt", "overwrite"));
    assert.equal(fs.existsSync(path.join(f.outside, "new")), false);
  } finally { f.close(); }
});

test("reject external, internal, dangling and create-parent symlinks", () => {
  const f = fixture();
  try {
    fs.symlinkSync(f.outside, path.join(f.root, "external"));
    fs.symlinkSync(f.marker, path.join(f.root, "file-link"));
    fs.symlinkSync(path.join(f.outside, "new.txt"), path.join(f.root, "dangling"));
    f.editor.create("local.txt", "local");
    fs.symlinkSync(path.join(f.root, "local.txt"), path.join(f.root, "internal"));
    for (const target of ["external/private.txt", "file-link", "dangling", "internal"]) f.allBlocked(target);
    f.blocked(() => f.editor.create("external/new/deep.txt", "overwrite"));
    assert.equal(fs.existsSync(path.join(f.outside, "new")), false);
    assert.equal(fs.existsSync(path.join(f.outside, "new.txt")), false);
    assert.equal(fs.readFileSync(path.join(f.root, "local.txt"), "utf8"), "local");
  } finally { f.close(); }
});

test("reject final symlink substituted after canonical preflight", () => {
  const f = fixture();
  try {
    f.editor.create("target.txt", "local");
    const original = (f.editor as any).resolveSafePath.bind(f.editor);
    (f.editor as any).resolveSafePath = (target: string) => {
      const resolved = original(target);
      fs.renameSync(path.join(f.root, "target.txt"), path.join(f.root, "saved.txt"));
      fs.symlinkSync(f.marker, path.join(f.root, "target.txt"));
      return resolved;
    };
    f.blocked(() => f.editor.strReplace("target.txt", "secret", "overwrite"));
    assert.equal(fs.readFileSync(path.join(f.root, "saved.txt"), "utf8"), "local");
  } finally { f.close(); }
});

test("reject parent symlink substituted after canonical preflight", () => {
  const f = fixture();
  try {
    fs.mkdirSync(path.join(f.root, "parent"));
    const original = (f.editor as any).resolveSafePath.bind(f.editor);
    (f.editor as any).resolveSafePath = (target: string) => {
      const resolved = original(target);
      fs.renameSync(path.join(f.root, "parent"), path.join(f.root, "saved-parent"));
      fs.symlinkSync(f.outside, path.join(f.root, "parent"));
      return resolved;
    };
    f.blocked(() => f.editor.create("parent/new.txt", "overwrite"));
    assert.equal(fs.existsSync(path.join(f.outside, "new.txt")), false);
  } finally { f.close(); }
});

test("reject hardlinks and shared writable directories", () => {
  const f = fixture();
  try {
    fs.linkSync(f.marker, path.join(f.root, "hardlink"));
    f.allBlocked("hardlink");
    fs.mkdirSync(path.join(f.root, "shared"));
    fs.chmodSync(path.join(f.root, "shared"), 0o777);
    f.blocked(() => f.editor.create("shared/new.txt", "overwrite"));
    assert.equal(fs.existsSync(path.join(f.root, "shared", "new.txt")), false);
  } finally { f.close(); }
});

test("exclusive workspace lock remains held when another backend fails", () => {
  const f = fixture();
  try {
    f.blocked(() => new TextEditorBackend(f.root));
    assert.equal(fs.existsSync(path.join(f.root, ".text-editor.lock")), true);
    f.blocked(() => f.editor.view(".text-editor.lock"));
    assert.equal(f.editor.view(".").includes(".text-editor.lock"), false);
    f.editor.close();
    const second = new TextEditorBackend(f.root);
    try { second.create("second.txt", "ok"); } finally { second.close(); }
    f.blocked(() => f.editor.view("."));
  } finally { f.close(); }
});

test("preserve create, numbered view, unique replace, insert, undo and literal replacement", () => {
  const f = fixture();
  try {
    const target = "nested/deep/script.ts";
    f.editor.create(target, "one\ntwo\n");
    assert.equal(f.editor.view(target, [2, -1]), "     2\ttwo");
    f.editor.strReplace(target, "one", "$&");
    assert.equal(fs.readFileSync(path.join(f.root, target), "utf8"), "$&\ntwo\n");
    f.editor.insert(target, 1, "middle");
    assert.equal(fs.readFileSync(path.join(f.root, target), "utf8"), "$&\nmiddle\ntwo\n");
    f.editor.undoEdit(target);
    f.editor.undoEdit(target);
    assert.equal(fs.readFileSync(path.join(f.root, target), "utf8"), "one\ntwo\n");
    f.blocked(() => f.editor.undoEdit(target));
    f.blocked(() => f.editor.create(target, "clobber"));
    f.blocked(() => f.editor.insert(target, 500, "invalid"));
    f.blocked(() => f.editor.strReplace(target, "", "invalid"));
    f.blocked(() => f.editor.strReplace(target, "o", "ambiguous"));
    f.blocked(() => f.editor.undoEdit(target));
    assert.equal(fs.readFileSync(path.join(f.root, target), "utf8"), "one\ntwo\n");
  } finally { f.close(); }
});

test("binary and invalid path errors are returned to tools", () => {
  const f = fixture();
  try {
    fs.writeFileSync(path.join(f.root, "binary"), Buffer.from([0xff, 0xfe]));
    for (const target of ["binary", "bad\0path"]) assert.equal(f.editor.executeCommand({ command: "view", path: target }).is_error, true);
  } finally { f.close(); }
});


test("opened parent stays anchored after its name is replaced", () => {
  const f = fixture();
  const mutableFs = require("fs");
  const originalOpen = mutableFs.openSync;
  try {
    fs.mkdirSync(path.join(f.root, "parent"));
    mutableFs.openSync = (target: any, flags: any, mode: any) => {
      const fd = originalOpen(target, flags, mode);
      if (typeof target === "string" && target.endsWith("/parent") && (flags & fs.constants.O_DIRECTORY)) {
        fs.renameSync(path.join(f.root, "parent"), path.join(f.root, "saved-parent"));
        fs.symlinkSync(f.outside, path.join(f.root, "parent"));
      }
      return fd;
    };
    f.editor.create("parent/new.txt", "local");
    assert.equal(fs.readFileSync(path.join(f.root, "saved-parent", "new.txt"), "utf8"), "local");
    assert.equal(fs.existsSync(path.join(f.outside, "new.txt")), false);
  } finally { mutableFs.openSync = originalOpen; f.close(); }
});

test("rejected undo keeps history and insert follows an unterminated line", () => {
  const f = fixture();
  try {
    f.editor.create("target.txt", "one");
    f.editor.insert("target.txt", 1, "two");
    assert.equal(fs.readFileSync(path.join(f.root, "target.txt"), "utf8"), "one\ntwo\n");
    fs.renameSync(path.join(f.root, "target.txt"), path.join(f.root, "saved.txt"));
    fs.symlinkSync(f.marker, path.join(f.root, "target.txt"));
    f.blocked(() => f.editor.undoEdit("target.txt"));
    fs.unlinkSync(path.join(f.root, "target.txt"));
    fs.renameSync(path.join(f.root, "saved.txt"), path.join(f.root, "target.txt"));
    f.editor.undoEdit("target.txt");
    assert.equal(fs.readFileSync(path.join(f.root, "target.txt"), "utf8"), "one");
  } finally { f.close(); }
});
