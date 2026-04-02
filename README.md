# Claude Code LLM Plugins

Multi-model plugins for [Claude Code](https://claude.ai/claude-code) — use OpenAI Codex, Google Gemini, xAI Grok, Zhipu GLM, MiniMax, and Gemini Image Generation as second opinions, code reviewers, design advisors, social signal scanners, and image generators without leaving your terminal.

## Plugins

| Plugin | Purpose | Key Commands |
|--------|---------|--------------|
| **Codex** | Code review, task delegation | `/codex:review`, `/codex:task` |
| **Gemini** | UI/UX review, design, code review | `/gemini:ui-review`, `/gemini:ui-design`, `/gemini:review`, `/gemini:ask` |
| **Grok** | X/Twitter sentiment, social signals | `/grok:sentiment`, `/grok:pulse`, `/grok:compare` |
| **GLM** | Code review, reasoning, task delegation | `/glm:review`, `/glm:ask`, `/glm:task` |
| **MiniMax** | Code review, reasoning, task delegation | `/minimax:review`, `/minimax:ask`, `/minimax:task` |
| **Nano Banana** | Image generation via Gemini | `/banana:generate`, `/banana:edit`, `/banana:variations` |

All plugins support background jobs (`--background`) with `/status`, `/result`, `/cancel`.

## Prerequisites

- [Claude Code](https://claude.ai/claude-code)
- Node.js 18+
- `rsync` and `jq` (for the install script)

Per-plugin requirements:

| Plugin | Dependency | Env Variable |
|--------|-----------|--------------|
| Codex | [Codex CLI](https://github.com/openai/codex) | *(uses Codex auth)* |
| Gemini | [Gemini CLI](https://github.com/google-gemini/gemini-cli) | *(uses Gemini auth)* |
| Grok | xAI API key from [console.x.ai](https://console.x.ai) | `XAI_API_KEY` |
| GLM | Zhipu API key from [open.bigmodel.cn](https://open.bigmodel.cn) | `ZHIPU_API_KEY` |
| MiniMax | MiniMax API key from [platform.minimaxi.com](https://platform.minimaxi.com) | `MINIMAX_API_KEY` |
| Nano Banana | Google API key from [aistudio.google.com](https://aistudio.google.com) | `GOOGLE_API_KEY` |

## Install

```bash
git clone https://github.com/markgerrard/claude-code-llm-plugins.git
cd claude-code-llm-plugins
./install.sh
```

Install individual plugins:
```bash
./install.sh codex
./install.sh gemini
./install.sh grok
./install.sh glm
./install.sh minimax
./install.sh banana
```

Restart Claude Code after installing.

## Uninstall

```bash
./install.sh uninstall
```

## Updating

Pull the latest and reinstall:
```bash
git pull
./install.sh
```

### Syncing subtrees

```bash
git subtree pull --prefix=codex git@github.com:markgerrard/codex-plugin-cc.git main --squash
git subtree pull --prefix=gemini git@github.com:markgerrard/gemini-plugin-cc.git main --squash
git subtree pull --prefix=grok git@github.com:markgerrard/grok-plugin-cc.git main --squash
git subtree pull --prefix=glm git@github.com:markgerrard/glm-plugin-cc.git main --squash
git subtree pull --prefix=minimax git@github.com:markgerrard/minimax-plugin-cc.git main --squash
git subtree pull --prefix=nano-banana git@github.com:markgerrard/nano-banana-plugin-cc.git main --squash
```

### Syncing Codex upstream

```bash
cd /tmp && git clone git@github.com:markgerrard/codex-plugin-cc.git && cd codex-plugin-cc
git remote add upstream https://github.com/openai/codex-plugin-cc.git
git fetch upstream && git merge upstream/main && git push origin main
```

## Architecture

```
claude-code-llm-plugins/
├── codex/              ← OpenAI Codex (fork of openai/codex-plugin-cc)
├── gemini/             ← Google Gemini CLI wrapper
├── grok/               ← xAI Grok API (X/Twitter sentiment)
├── glm/                ← Zhipu GLM API (reasoning, code review)
├── minimax/            ← MiniMax API (reasoning, code review)
├── nano-banana/        ← Google Gemini Image Generation API
└── install.sh          ← installs plugins into ~/.claude/plugins/
```

Each plugin follows the same pattern:
- `scripts/lib/<name>.mjs` — API client with model aliases
- `scripts/<name>-companion.mjs` — command router
- `commands/*.md` — slash command definitions
- `prompts/*.md` — prompt templates
- `hooks/hooks.json` — session lifecycle
- Background job system with detached workers

## License

Gemini, Grok, GLM, MiniMax, Nano Banana plugins: MIT
Codex plugin: See `codex/LICENSE`