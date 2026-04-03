---
description: Send an email using a Postmark template
argument-hint: '--to <email> --template <id-or-alias> [--var key=value]'
disable-model-invocation: true
allowed-tools: Bash(node:*)
---

Send a templated email via Postmark. Use template ID (numeric) or alias (string).

Pass template variables with `--var key=value` (repeat for multiple).

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/postmark-companion.mjs" template-send $ARGUMENTS
```
