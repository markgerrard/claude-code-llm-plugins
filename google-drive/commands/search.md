---
description: Search Google Drive files by name or content
argument-hint: '<query>'
disable-model-invocation: true
allowed-tools: Bash(node:*)
---

Search files by name or content.

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/gdrive-companion.mjs" search $ARGUMENTS
```
