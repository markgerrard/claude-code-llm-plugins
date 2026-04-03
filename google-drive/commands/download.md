---
description: Download a file from Google Drive
argument-hint: '<file-id> <save-path>'
disable-model-invocation: true
allowed-tools: Bash(node:*)
---

Download a Drive file to local disk. Google Workspace files are exported (Docs to PDF, Sheets to CSV).

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/gdrive-companion.mjs" download $ARGUMENTS
```
