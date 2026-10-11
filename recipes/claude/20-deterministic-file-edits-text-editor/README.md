# Recipe 20: How to Execute Deterministic File Edits with Text Editor Tool

Execute deterministic, idempotent file edits with Claude using Anthropic's native text editor tool (`type: "text_editor_20250124"`). Implement the five core editing primitives (`view`, `create`, `str_replace`, `insert`, and `undo_edit`), enforce strict unique substring matching, maintain bounded undo stacks, and handle client execution loops in Python and TypeScript.

## Architecture Overview

```
User Edit Goal ---> Claude Messages API ---> stop_reason: "tool_use"
                                                     |
                                         [Text Editor Dispatch]
                                         /         |          \
                                  (view)     (str_replace)    (insert/create/undo)
                                    |              |                   |
                           Read Range &      Verify Unique        Mutate File &
                           Format Lines      Exact Match          Push Undo Stack
                                    \              |                  /
                                     \             |                 /
                                    Return tool_result ({ is_error })
                                                   |
                                     Claude Evaluates Outcome
                                                   |
                                    [Edits Complete / Verified?]
                                      /                        \
                                    (No)                      (Yes)
                                     |                          |
                             Iterate Next Turn            stop_reason: "end_turn"
```

## Directory Structure

```
.
├── .env.example              # Environment variables template
├── README.md                 # Recipe documentation and execution guide
├── blog-post.md              # Complete engineering article
├── curl_probe.sh             # Executable shell script probing text editor tool turns
├── metadata.json             # Post metadata and CMS configuration
├── python/
│   ├── requirements.txt      # Python dependencies
│   ├── text_editor_backend.py# Full text editor backend with history stack
│   └── main.py               # Agent loop and simulation driver
└── typescript/
    ├── package.json          # Node.js project manifest
    ├── tsconfig.json         # TypeScript compiler configuration
    └── src/
        └── index.ts          # TypeScript text editor backend and agent loop
```

## Prerequisites

- Python 3.10+ on POSIX with descriptor-relative/no-follow operations, or Node.js 18+ on Linux with `/proc/self/fd`
- A private workspace owned by the current user, with no group/world writable entries
- Active Anthropic API key (optional for offline test simulation)

```bash
cp .env.example .env
export ANTHROPIC_API_KEY="sk-ant-api03-..."
```

## Quickstart

### cURL Probe

Probe the raw Messages API with text editor tool definitions and multi-turn exchanges:

```bash
chmod +x curl_probe.sh
./curl_probe.sh
```

### Python Implementation

Run the deterministic text editor backend and multi-turn simulation:

```bash
cd python
python3 text_editor_backend.py
python3 main.py
```

### TypeScript Implementation

Run the TypeScript editor implementation:

```bash
cd typescript
npm ci
npm test
npm run build
npm run start
```

## Workspace security and lifecycle

The backend checks canonical directory ancestry, including existing parents of
new paths. It then opens each component relative to a held directory descriptor
with `O_NOFOLLOW`, rather than opening the checked path again. Every symlink is
rejected, including symlinks pointing inside the workspace. Exclusive creation
prevents overwriting an existing file or a late symlink. Regular files with
multiple hard links, special files, and entries owned by another user or writable
by a group/others are rejected. Directory listings do not follow entry symlinks.
Unsupported filesystem capabilities fail closed.

Use one backend instance per workspace. A reserved `.text-editor.lock` is created
exclusively; a second backend cannot acquire the workspace. Python serializes
operations with a lock, and TypeScript operations are synchronous. Call `close()`
when finished (Python also supports `with TextEditorBackend(...) as editor`). If
the process crashes, verify that no editor is running before manually removing a
stale lock file. The lock is cooperative; it cannot prevent another process with
the same user identity from changing the filesystem.

This recipe supports a private, single-writer workspace. It is **not a host
filesystem sandbox**. Hostile concurrent writers that can rename an already-open
directory, create a hard link after validation, change mounts, or modify files
while an edit is running are outside its supported boundary. For that threat
model, run the editor as a separate unprivileged user in a container with only a
dedicated private workspace volume; do not share that mount with a host writer.
Never put credentials or unrelated confidential files in the workspace: the
model can read and edit all permitted workspace files. These operations retain
up to 50 successful replacement/insertion snapshots per file in memory; they do
not provide crash-safe or cross-process undo. `create` is exclusive and has no
undo snapshot.

Run the offline containment regressions without a model key:

```bash
python3 -m unittest discover -s python -p 'test_*.py'
cd typescript
npm ci
npm test
npm run build
```

The regressions cover sibling-prefix paths, traversal, external/internal/dangling
symlinks, substitutions after canonical checks, hard links, shared writable
entries, workspace locking, and normal edit/undo behavior.
