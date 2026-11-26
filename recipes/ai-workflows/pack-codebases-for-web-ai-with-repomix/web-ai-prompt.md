# Web-Only AI Code Review & Architecture Prompt Template

Attach `repomix-output.xml` (or paste via `--copy`) in your frontier model's web interface and use the prompt below.

```text
The attached repomix-output.xml contains the source tree for [service/module].
Read the directory structure and entry points first.

Task: [Audit for security/reliability gaps | Plan the architecture for [feature] | Diagnose [bug]].
Constraints:
- Reference exact file paths and line numbers from the bundle.
- Do not invent files, symbols, or dependencies outside the bundle.
- Flag any missing context or files you need unpacked in full next.
- Output implementation steps or changes as unified diffs per file.
```
