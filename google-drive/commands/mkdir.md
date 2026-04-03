---
description: Create a folder in Google Drive
argument-hint: '<name> [--parent <id>]'
disable-model-invocation: true
allowed-tools: Bash(node:*)
---

Create a new folder in Drive root or inside a parent folder.

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/gdrive-companion.mjs" mkdir $ARGUMENTS
```
