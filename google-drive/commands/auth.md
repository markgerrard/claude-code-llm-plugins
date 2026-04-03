---
description: Authenticate with Google Drive (OAuth flow)
argument-hint: '[--manual]'
disable-model-invocation: true
allowed-tools: Bash(node:*)
---

Run the Google OAuth flow. Use `--manual` on headless servers.

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/gdrive-companion.mjs" auth $ARGUMENTS
```
