---
description: Fan out a code review of the current repo to multiple models in parallel
argument-hint: '[--models codex,gemini,glm] [--base <ref>] [--scope auto|working-tree|branch] [focus]'
disable-model-invocation: true
allowed-tools: Bash(node:*)
---

Send the current git diff to multiple models for code review in parallel. Returns all reviews side-by-side plus a consensus synthesis.

Default models: codex, gemini, glm. Override with `--models`.

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/compare-companion.mjs" review $ARGUMENTS
```
