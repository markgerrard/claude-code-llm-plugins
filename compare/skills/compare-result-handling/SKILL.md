---
name: compare-result-handling
description: Use when the user wants to compare responses from multiple AI models, get a second opinion from multiple models, or build consensus across models. Triggers on "compare models", "ask all models", "what do the other models think", "get consensus", "multi-model", "second opinions".
user-invocable: false
---

# Multi-Model Compare & Consensus

Route multi-model requests to the compare plugin.

## When to use

- User wants the same question answered by multiple models
- User asks for a "second opinion" or "what do other models think"
- User wants consensus on a technical decision
- User explicitly asks to compare model outputs

## Routing

| User intent | Command |
|-------------|---------|
| Compare responses side-by-side | `/compare:compare <prompt>` |
| Synthesise consensus | `/compare:consensus <prompt>` |
| See available models | `/compare:models` |
| Compare with specific models | `/compare:compare --models gemini,grok <prompt>` |

## When to use compare vs consensus

- **Compare**: when the user wants to see raw differences — "how does each model approach this?"
- **Consensus**: when the user wants a decision — "is this migration safe?" "is this approach correct?"

## After receiving results

For `/compare:compare`: present the side-by-side output directly. Add your own brief assessment of the key differences.

For `/compare:consensus`: read all model responses and the synthesis framework, then provide your own synthesis covering:
1. **Strong agreement** — points where all models converge
2. **Divergence** — where they disagree and which position is stronger
3. **Unique insights** — valuable points only one model raised
4. **Recommendation** — your overall assessment incorporating all inputs
