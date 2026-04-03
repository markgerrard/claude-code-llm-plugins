---
description: List files in Google Drive
argument-hint: '[--folder <id>] [--limit <n>]'
disable-model-invocation: true
allowed-tools: Bash(node:*)
---

List files in root or a specific folder.

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/gdrive-companion.mjs" list $ARGUMENTS
```
