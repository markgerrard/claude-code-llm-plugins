# Compare Plugin for Claude Code

Fan out prompts to multiple LLM models in parallel. Compare responses side-by-side or synthesise consensus.

## Commands

| Command | Description |
|---------|-------------|
| `/compare:compare` | Send prompt to all models, show responses side-by-side |
| `/compare:consensus` | Send prompt to all models, synthesise agreement/divergence |
| `/compare:models` | List available models |

## Usage

```
/compare:compare "Review this function for edge cases"
/compare:consensus "Is this SQL migration safe?"
/compare:compare --models gemini,grok "What are the tradeoffs of this approach?"
```

### Natural language

- "What do the other models think about this?"
- "Get me a consensus on whether this migration is safe"
- "Compare model opinions on this architecture"

## Default Models

Gemini, Grok, GLM, MiniMax — all queried in parallel.

Override with `--models gemini,grok` to use a subset.

## How it works

1. Fans out the prompt to each model's companion script in parallel
2. Collects responses (latency = slowest model, not sum)
3. Presents results side-by-side (compare) or with synthesis framework (consensus)

## Prerequisites

Requires the target model plugins to be installed and configured with API keys. The compare plugin itself needs no credentials — it calls the other plugins.

## Part of [cc-plugins](https://github.com/markgerrard/cc-plugins)

Install with all other plugins: `./install.sh` or standalone: `./install.sh compare`
