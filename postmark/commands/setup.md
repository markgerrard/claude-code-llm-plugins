---
description: Check Postmark configuration and connectivity
argument-hint: ''
disable-model-invocation: true
allowed-tools: Bash(node:*)
---

Check Postmark API key, sender email, and server connectivity.

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/postmark-companion.mjs" setup
```
