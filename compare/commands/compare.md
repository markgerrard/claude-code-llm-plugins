---
description: Send a prompt to multiple LLM models in parallel and show responses side-by-side
argument-hint: '<prompt> [--models gemini,grok,glm,minimax]'
disable-model-invocation: true
allowed-tools: Bash(node:*)
---

Fan out a prompt to multiple models in parallel. Returns all responses side-by-side.

Default models: gemini, grok, glm, minimax. Override with `--models`.

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/compare-companion.mjs" compare $ARGUMENTS
```
