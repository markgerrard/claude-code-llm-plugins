---
description: Upload a file to Google Drive
argument-hint: '<local-path> [--folder <id>] [--name <name>]'
disable-model-invocation: true
allowed-tools: Bash(node:*)
---

Upload a local file to Drive. Optionally specify a target folder and override the filename.

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/gdrive-companion.mjs" upload $ARGUMENTS
```
