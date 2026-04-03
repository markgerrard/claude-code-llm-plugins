---
description: Send an email via Postmark
argument-hint: '--to <email> --subject <text> --body <text> [--html <html>] [--attach <file>] [--tag <tag>]'
disable-model-invocation: true
allowed-tools: Bash(node:*)
---

Send an email via the Postmark API.

Required: `--to`, `--subject`, `--body`
Optional: `--html` (HTML body), `--from` (override sender), `--attach` (file path), `--tag`

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/postmark-companion.mjs" send $ARGUMENTS
```
