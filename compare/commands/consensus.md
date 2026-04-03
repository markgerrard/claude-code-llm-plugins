---
description: Send a prompt to multiple LLMs and synthesise where they agree and diverge
argument-hint: '<prompt> [--models gemini,grok,glm,minimax]'
disable-model-invocation: true
allowed-tools: Bash(node:*)
---

Fan out a prompt to multiple models, then present responses with a synthesis framework highlighting agreement, divergence, and unique insights.

Default models: gemini, grok, glm, minimax. Override with `--models`.

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/compare-companion.mjs" consensus $ARGUMENTS
```
