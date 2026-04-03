---
description: Show Postmark email delivery statistics
argument-hint: '[--tag <tag>] [--from-date YYYY-MM-DD] [--to-date YYYY-MM-DD]'
disable-model-invocation: true
allowed-tools: Bash(node:*)
---

Show email delivery stats: sent, open rate, click rate, bounces, spam complaints.

Optional filters: `--tag`, `--from-date`, `--to-date`

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/postmark-companion.mjs" stats $ARGUMENTS
```
