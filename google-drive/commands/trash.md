---
description: Move a file or folder to Google Drive trash
argument-hint: '<file-id>'
disable-model-invocation: true
allowed-tools: Bash(node:*)
---

Move a file or folder to trash (recoverable from Drive).

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/gdrive-companion.mjs" trash $ARGUMENTS
```
