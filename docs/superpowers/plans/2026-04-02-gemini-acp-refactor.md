# Gemini ACP Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the Gemini Claude Code plugin from CLI-wrapper to ACP-based transport using `gemini --acp` and the Python ACP SDK.

**Architecture:** Node plugin stays as thin command adapter. New Python ACP runtime (`gemini-acp.py`) owns all ACP transport, session lifecycle, job persistence, and supervised execution. Clean CLI boundary — Node calls Python, reads JSON from stdout.

**Tech Stack:** Python 3.12+ (ACP SDK from Vibe's uv venv), Node.js (existing plugin surface), Gemini CLI with `--acp` flag.

**Spec:** `docs/superpowers/specs/2026-04-02-gemini-acp-refactor-design.md`

**Working directory:** `/home/mark/claude-code-llm-plugins/gemini`

---

## File Structure

### New Python files (create)

| File | Responsibility |
|------|---------------|
| `scripts/gemini-acp.py` | Python entry point — CLI arg parsing, subcommand dispatch |
| `scripts/py/__init__.py` | Package init, ACP SDK path setup |
| `scripts/py/schemas.py` | Envelopes, enums, status constants, typed models |
| `scripts/py/preflight.py` | Auth/env checks with caching |
| `scripts/py/transport.py` | `AgentTransport` ABC |
| `scripts/py/acp_runtime.py` | `GeminiAcpTransport` — SDK-backed implementation |
| `scripts/py/job_model.py` | Job record CRUD, persistence, file locking |
| `scripts/py/events.py` | Event normalization, JSONL append |
| `scripts/py/supervisor.py` | Foreground/background orchestration, cancel, stale detection |

### New Node files (create)

| File | Responsibility |
|------|---------------|
| `scripts/node/args.mjs` | CLI arg parsing (moved from `scripts/lib/args.mjs`) |
| `scripts/node/render.mjs` | Format Python JSON output for Claude (moved + simplified) |
| `scripts/node/job-control.mjs` | Thin wrapper calling Python `status`/`result`/`cancel` |
| `scripts/node/workspace.mjs` | cwd resolution (moved from `scripts/lib/workspace.mjs`) |
| `scripts/node/gemini-acp-bridge.mjs` | `callGeminiAcp()` and `streamGeminiAcp()` — the Node-Python boundary |

### Files to modify

| File | Change |
|------|--------|
| `scripts/gemini-companion.mjs` | Gut and rewrite — remove all direct Gemini CLI spawning, route through Python |

### Files to delete

| File | Reason |
|------|--------|
| `scripts/lib/gemini.mjs` | Replaced by Python ACP runtime |
| `scripts/lib/context.mjs` | Git diff/stdin logic stays in Node prompt builders |
| `scripts/lib/process.mjs` | Process management moves to Python supervisor |
| `scripts/lib/state.mjs` | Job persistence moves to Python `job_model.py` |
| `scripts/lib/tracked-jobs.mjs` | Job tracking moves to Python |
| `scripts/lib/job-control.mjs` | Replaced by `scripts/node/job-control.mjs` |
| `scripts/lib/render.mjs` | Replaced by `scripts/node/render.mjs` |
| `scripts/lib/args.mjs` | Replaced by `scripts/node/args.mjs` |
| `scripts/lib/workspace.mjs` | Replaced by `scripts/node/workspace.mjs` |
| `scripts/session-lifecycle-hook.mjs` | Session lifecycle moves to Python |

---

## Task 1: Python package init and schemas

**Files:**
- Create: `scripts/py/__init__.py`
- Create: `scripts/py/schemas.py`

- [ ] **Step 1: Create the py package with ACP SDK path setup**

```python
# scripts/py/__init__.py
"""Gemini ACP runtime package."""
from __future__ import annotations

import sys
from pathlib import Path

VERSION = "1.0.0"

# The ACP SDK is vendored in Vibe's uv tool environment.
# Add it to sys.path so we can import acp.
_ACP_SITE_PACKAGES = Path.home() / ".local/share/uv/tools/mistral-vibe/lib/python3.12/site-packages"
if _ACP_SITE_PACKAGES.is_dir() and str(_ACP_SITE_PACKAGES) not in sys.path:
    sys.path.insert(0, str(_ACP_SITE_PACKAGES))

JOBS_DIR = Path.home() / ".gemini-acp" / "jobs"
```

- [ ] **Step 2: Create schemas module with all envelopes, enums, and constants**

```python
# scripts/py/schemas.py
"""Envelopes, enums, status constants, typed models."""
from __future__ import annotations

import json
from dataclasses import dataclass, field, asdict
from enum import Enum
from typing import Optional

SCHEMA_VERSION = 1


class JobStatus(str, Enum):
    QUEUED = "queued"
    RUNNING = "running"
    CANCELLING = "cancelling"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"
    STALE = "stale"

    @property
    def is_terminal(self) -> bool:
        return self in (
            JobStatus.COMPLETED,
            JobStatus.FAILED,
            JobStatus.CANCELLED,
            JobStatus.STALE,
        )


class ErrorCode(str, Enum):
    PREFLIGHT_NOT_FOUND = "preflight_not_found"
    PREFLIGHT_VERSION = "preflight_version"
    PREFLIGHT_AUTH = "preflight_auth"
    PREFLIGHT_JOBS_DIR = "preflight_jobs_dir"
    PREFLIGHT_CWD = "preflight_cwd"
    WORKER_SPAWN_FAILED = "worker_spawn_failed"
    HANDSHAKE_TIMEOUT = "handshake_timeout"
    SESSION_LOAD_FAILED = "session_load_failed"
    PROMPT_SEND_FAILED = "prompt_send_failed"
    RUNTIME_EXCEPTION = "runtime_exception"
    CANCEL_TIMEOUT = "cancel_timeout"


class EventSource(str, Enum):
    AGENT = "agent"
    TOOL = "tool"
    RUNTIME = "runtime"
    SUPERVISOR = "supervisor"


MODEL_ALIASES = {
    "pro": "gemini-3.1-pro-preview",
    "flash": "gemini-3-flash-preview",
    "25pro": "gemini-2.5-pro",
    "25flash": "gemini-2.5-flash",
    "lite": "gemini-2.5-flash-lite",
}

# Commands that support --resume
RESUMABLE_COMMANDS = {"ask", "task"}


def resolve_model_alias(model: Optional[str]) -> Optional[str]:
    if not model:
        return None
    return MODEL_ALIASES.get(model.lower(), model)


@dataclass
class SuccessEnvelope:
    command: str
    job_id: str
    session_id: Optional[str] = None
    cwd: Optional[str] = None
    model: Optional[str] = None
    status: str = "completed"
    text: str = ""
    tokens: Optional[dict] = None
    files_changed: Optional[list] = None
    duration_ms: int = 0
    started_at: Optional[str] = None
    ended_at: Optional[str] = None
    warnings: list = field(default_factory=list)
    result_available: bool = True
    exit_code: int = 0

    def to_json(self) -> str:
        d = {"schema_version": SCHEMA_VERSION, "ok": True}
        d.update({k: v for k, v in asdict(self).items()})
        return json.dumps(d)


@dataclass
class ErrorEnvelope:
    command: str
    error: str
    error_code: str
    exit_code: int = 1

    def to_json(self) -> str:
        d = {"schema_version": SCHEMA_VERSION, "ok": False}
        d.update({k: v for k, v in asdict(self).items()})
        return json.dumps(d)


@dataclass
class EventRecord:
    event: str
    source: str
    job_id: str
    session_id: Optional[str] = None
    timestamp: Optional[str] = None
    data: Optional[dict] = None
    raw_event_type: Optional[str] = None

    def to_json(self) -> str:
        d = {
            "schema_version": SCHEMA_VERSION,
            "type": "event",
        }
        d.update({k: v for k, v in asdict(self).items() if v is not None})
        return json.dumps(d)


@dataclass
class JobRecord:
    job_id: str
    command: str
    prompt: str
    cwd: str
    model: Optional[str] = None
    parent_job_id: Optional[str] = None
    session_id: Optional[str] = None
    status: str = JobStatus.QUEUED.value
    error_code: Optional[str] = None
    error: Optional[str] = None
    pid: Optional[int] = None
    pgid: Optional[int] = None
    mode: str = "foreground"
    output_mode: str = "json"
    env_fingerprint: Optional[str] = None
    created_at: Optional[str] = None
    started_at: Optional[str] = None
    last_updated_at: Optional[str] = None
    ended_at: Optional[str] = None
    result_available: bool = False
    exit_code: Optional[int] = None

    def to_dict(self) -> dict:
        d = {"schema_version": SCHEMA_VERSION}
        d.update(asdict(self))
        return d
```

- [ ] **Step 3: Verify the module imports work**

Run: `cd /home/mark/claude-code-llm-plugins/gemini && python3 -c "from scripts.py.schemas import JobStatus, SuccessEnvelope, ErrorEnvelope; print('schemas OK')"`

Expected: `schemas OK`

- [ ] **Step 4: Commit**

```bash
cd /home/mark/claude-code-llm-plugins
git add gemini/scripts/py/__init__.py gemini/scripts/py/schemas.py
git commit -m "feat(gemini): add Python package init and schema definitions"
```

---

## Task 2: Transport abstraction and ACP runtime

**Files:**
- Create: `scripts/py/transport.py`
- Create: `scripts/py/acp_runtime.py`

- [ ] **Step 1: Create the AgentTransport ABC**

```python
# scripts/py/transport.py
"""AgentTransport ABC — narrow interface for agent communication."""
from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import AsyncIterator, Optional


@dataclass
class InitResult:
    """Result of ACP initialize handshake."""
    protocol_version: int = 0
    capabilities: dict = field(default_factory=dict)
    agent_info: Optional[dict] = None


class AgentTransport(ABC):
    """Narrow interface for agent communication."""

    @abstractmethod
    async def spawn(self, cwd: str, env: dict) -> None:
        """Spawn the agent subprocess."""
        ...

    @abstractmethod
    async def initialize(self, timeout_s: float = 10.0) -> InitResult:
        """Send ACP initialize and validate handshake."""
        ...

    @abstractmethod
    async def new_session(self) -> str:
        """Create a new ACP session. Returns session_id."""
        ...

    @abstractmethod
    async def load_session(self, session_id: str) -> str:
        """Load an existing ACP session. Returns session_id."""
        ...

    @abstractmethod
    async def send_prompt(self, text: str, session_id: str) -> None:
        """Send a prompt to the agent."""
        ...

    @abstractmethod
    async def stream_events(self) -> AsyncIterator[dict]:
        """Yield normalized event dicts from ACP notifications."""
        ...

    @abstractmethod
    async def cancel(self, session_id: str) -> None:
        """Send ACP cancel request (best effort)."""
        ...

    @abstractmethod
    async def close(self) -> None:
        """Graceful shutdown: ACP close, then teardown, then kill."""
        ...

    @abstractmethod
    def is_alive(self) -> bool:
        """Check if the agent subprocess is still running."""
        ...
```

- [ ] **Step 2: Create the GeminiAcpTransport implementation**

Create `scripts/py/acp_runtime.py` with the SDK-backed transport. Key patterns ported from the Vibe reference:

- `spawn_stdio_transport("gemini", "--acp", env=env, cwd=cwd)` to launch Gemini
- `connect_to_agent(client, writer, reader, use_unstable_protocol=True)` for JSON-RPC
- Client class implements `session_update` for streaming events, `request_permission` for auto-approve
- Event normalization maps ACP event types (`agent_message_chunk` -> `text_delta`, `tool_call_start` -> `tool_use_start`)
- `close()` implements three-phase shutdown: ACP session close -> transport teardown -> SIGTERM/SIGKILL

The full implementation is ~200 lines. See the spec for the complete GeminiAcpClient and GeminiAcpTransport classes.

- [ ] **Step 3: Verify ACP imports work**

Run: `cd /home/mark/claude-code-llm-plugins/gemini && python3 -c "from scripts.py.acp_runtime import GeminiAcpTransport; print('acp_runtime OK')"`

Expected: `acp_runtime OK`

- [ ] **Step 4: Commit**

```bash
cd /home/mark/claude-code-llm-plugins
git add gemini/scripts/py/transport.py gemini/scripts/py/acp_runtime.py
git commit -m "feat(gemini): add AgentTransport ABC and GeminiAcpTransport"
```

---

## Task 3: Preflight checks

**Files:**
- Create: `scripts/py/preflight.py`

- [ ] **Step 1: Write preflight module**

Implements five checks in order:
1. `gemini` found in PATH (via `shutil.which`)
2. `--acp` flag supported (parse `gemini --help` output)
3. Jobs directory writable (test write + unlink)
4. cwd exists and accessible
5. Non-interactive auth — spawn `gemini --acp`, send ACP `initialize`, verify handshake completes within configurable timeout without login prompt. Kill subprocess after check.

Cache successful results per `cwd+env_fingerprint` for 60 seconds.

`PreflightResult` dataclass with `ok` property and `first_error_code` for structured error reporting.

Error codes: `preflight_not_found`, `preflight_version`, `preflight_auth`, `preflight_jobs_dir`, `preflight_cwd`.

- [ ] **Step 2: Verify preflight imports**

Run: `cd /home/mark/claude-code-llm-plugins/gemini && python3 -c "from scripts.py.preflight import run_preflight, PreflightResult; print('preflight OK')"`

Expected: `preflight OK`

- [ ] **Step 3: Commit**

```bash
cd /home/mark/claude-code-llm-plugins
git add gemini/scripts/py/preflight.py
git commit -m "feat(gemini): add preflight checks with auth validation and caching"
```

---

## Task 4: Job model and persistence

**Files:**
- Create: `scripts/py/job_model.py`
- Create: `scripts/py/events.py`

- [ ] **Step 1: Write job model with atomic writes and file locking**

Key functions:
- `generate_job_id()` -> `gem-YYYYMMDD-HHMMSS-xxxx`
- `create_job(record)` -> sets `created_at`, `last_updated_at`, writes to `~/.gemini-acp/jobs/<id>/job.json`
- `read_job(job_id)` -> deserialize JobRecord
- `update_job(job_id, **updates)` -> atomic update under advisory file lock (`fcntl.flock`)
- `write_result(job_id, envelope_json)` -> write `result.json` (any terminal transition)
- `read_result(job_id)` -> read `result.json`
- `list_jobs_for_cwd(cwd)` -> all jobs matching cwd, sorted newest first
- `reconcile_stale(job)` -> if running/cancelling but pid dead, mark stale

Atomic writes: write to `.tmp`, then `os.replace()`.
File locking: `fcntl.flock(LOCK_EX)` per-job lock file.

- [ ] **Step 2: Write events module**

- `append_event(job_id, record)` -> append JSONL to `events.jsonl` (single writer)
- `read_events(job_id)` -> read persisted events (for `logs` command)

- [ ] **Step 3: Verify modules work**

Run: `cd /home/mark/claude-code-llm-plugins/gemini && python3 -c "from scripts.py.job_model import create_job, generate_job_id; from scripts.py.events import append_event; print('job_model + events OK')"`

Expected: `job_model + events OK`

- [ ] **Step 4: Commit**

```bash
cd /home/mark/claude-code-llm-plugins
git add gemini/scripts/py/job_model.py gemini/scripts/py/events.py
git commit -m "feat(gemini): add job model with atomic writes, locking, and event log"
```

---

## Task 5: Supervisor — foreground and background orchestration

**Files:**
- Create: `scripts/py/supervisor.py`

- [ ] **Step 1: Write supervisor module**

Three main functions:

**`run_foreground(command, prompt, cwd, ...)`**
1. Run preflight (exit 2 on failure)
2. Create job record (queued)
3. Spawn `gemini --acp` via transport
4. ACP handshake -> update to running
5. Session create/load
6. Set model (non-fatal)
7. Send prompt
8. Stream events to `events.jsonl` (and stdout if `--stream`)
9. On completion -> write `result.json`, print terminal envelope
10. On failure -> write error `result.json`, print error envelope

**`launch_background(command, prompt, cwd, ...)`**
1. Create job record (queued)
2. Spawn detached worker: `python3 gemini-acp.py worker-run --job <id>`
3. Print background envelope to stdout
4. Exit immediately

**`run_worker(job_id)`** — internal, called by detached background process
1. Read job record
2. Run preflight (update to failed if fails)
3. Execute foreground logic with stdout redirected to devnull

**`cancel_job(job_id)`**
1. Set status to cancelling
2. Send SIGTERM to process group
3. Wait up to 10s, then SIGKILL
4. Update to cancelled, write result.json

- [ ] **Step 2: Verify supervisor imports**

Run: `cd /home/mark/claude-code-llm-plugins/gemini && python3 -c "from scripts.py.supervisor import run_foreground, launch_background, cancel_job; print('supervisor OK')"`

Expected: `supervisor OK`

- [ ] **Step 3: Commit**

```bash
cd /home/mark/claude-code-llm-plugins
git add gemini/scripts/py/supervisor.py
git commit -m "feat(gemini): add supervisor with foreground, background, and cancel"
```

---

## Task 6: Python CLI entry point

**Files:**
- Create: `scripts/gemini-acp.py`

- [ ] **Step 1: Write the Python entry point with all subcommands**

Uses `argparse` with subparsers for: `setup`, `ask`, `task`, `review`, `ui-review`, `ui-design`, `status`, `result`, `cancel`, `logs`, `worker-run`.

Key dispatch logic:
- `setup` -> runs full preflight, prints JSON diagnostic report
- Prompt commands (`ask`, `task`, etc.) -> validates flags (`--resume` only for ask/task, `--background --stream` invalid), calls `launch_background()` or `run_foreground()`
- `status` -> `read_job` (single) or `list_jobs_for_cwd` (list), with stale reconciliation
- `result` -> `read_result`, with cwd-scoped lookup if no `--job`
- `cancel` -> `cancel_job`, with cwd-scoped active job lookup if no `--job`
- `logs` -> `read_events`, supports `--text` for human-readable output
- `worker-run` -> `run_worker(job_id)` (internal)

All output is JSON to stdout. stderr for diagnostics only.

- [ ] **Step 2: Make it executable**

Run: `chmod +x /home/mark/claude-code-llm-plugins/gemini/scripts/gemini-acp.py`

- [ ] **Step 3: Verify the CLI parses without error**

Run: `cd /home/mark/claude-code-llm-plugins/gemini && python3 scripts/gemini-acp.py --help`

Expected: Usage text showing all subcommands.

- [ ] **Step 4: Commit**

```bash
cd /home/mark/claude-code-llm-plugins
git add gemini/scripts/gemini-acp.py
git commit -m "feat(gemini): add Python ACP CLI entry point with all subcommands"
```

---

## Task 7: Node bridge module

**Files:**
- Create: `scripts/node/gemini-acp-bridge.mjs`

- [ ] **Step 1: Write the Node-Python bridge**

Two functions sharing one JSON parser path:

**`callGeminiAcp(subcommand, args, options)`**
- Spawns `python3 gemini-acp.py <subcommand> [...args]`
- Collects stdout, parses single JSON envelope
- Returns `{ok, data, exitCode, stderr}`

**`streamGeminiAcp(subcommand, args, options)`** (async generator)
- Spawns `python3 gemini-acp.py <subcommand> --stream [...args]`
- Reads stdout line by line, parses JSONL
- Yields events until terminal envelope (`{terminal: true}`)

Both use the same `tryParseJson()` helper. Both use `child_process.spawn` (not `exec`) to avoid shell injection.

- [ ] **Step 2: Commit**

```bash
cd /home/mark/claude-code-llm-plugins
mkdir -p gemini/scripts/node
git add gemini/scripts/node/gemini-acp-bridge.mjs
git commit -m "feat(gemini): add Node-to-Python ACP bridge module"
```

---

## Task 8: Move and simplify Node modules

**Files:**
- Create: `scripts/node/args.mjs` (copy from `scripts/lib/args.mjs`)
- Create: `scripts/node/workspace.mjs` (copy from `scripts/lib/workspace.mjs`)
- Create: `scripts/node/render.mjs` (rewrite — reads Python JSON, formats for Claude)
- Create: `scripts/node/job-control.mjs` (rewrite — thin wrapper calling Python)

- [ ] **Step 1: Copy args.mjs and workspace.mjs**

```bash
mkdir -p /home/mark/claude-code-llm-plugins/gemini/scripts/node
cp /home/mark/claude-code-llm-plugins/gemini/scripts/lib/args.mjs /home/mark/claude-code-llm-plugins/gemini/scripts/node/args.mjs
cp /home/mark/claude-code-llm-plugins/gemini/scripts/lib/workspace.mjs /home/mark/claude-code-llm-plugins/gemini/scripts/node/workspace.mjs
```

- [ ] **Step 2: Write new render.mjs**

Renders Python JSON envelopes for Claude:
- `renderResult(data)` -> text + optional token/duration metadata
- `renderError(data)` -> bold error + error code
- `renderBackgroundLaunch(data)` -> job ID, PID, commands to check status/result/cancel
- `renderStatusList(data)` -> bullet list of jobs
- `renderSingleJobStatus(data)` -> detailed single job view
- `renderSetup(data)` -> CLI version + available commands, or error with install instructions

- [ ] **Step 3: Write new job-control.mjs**

Four thin functions calling Python via the bridge:
- `getJobStatus(jobId)` -> `callGeminiAcp("status", [...])`
- `getJobResult(jobId)` -> `callGeminiAcp("result", [...])`
- `cancelJob(jobId)` -> `callGeminiAcp("cancel", [...])`
- `getJobLogs(jobId, options)` -> `callGeminiAcp("logs", [...])`

- [ ] **Step 4: Commit**

```bash
cd /home/mark/claude-code-llm-plugins
git add gemini/scripts/node/
git commit -m "feat(gemini): add Node bridge, render, args, workspace, and job-control modules"
```

---

## Task 9: Rewrite gemini-companion.mjs

**Files:**
- Modify: `scripts/gemini-companion.mjs`

- [ ] **Step 1: Rewrite the Node entry point**

Replace the entire file. The new version:

- Imports from `./node/` modules only (args, bridge, render, workspace)
- No direct Gemini CLI spawning
- No `state.mjs`, `tracked-jobs.mjs`, `process.mjs` imports
- Prompt builders stay in Node (git diff via `child_process.spawnSync`, stdin via `fs.readFileSync(0)`, file context via `fs.readFileSync`)
- All prompt commands route through `callGeminiAcp()` or `streamGeminiAcp()`
- Status/result/cancel/logs route through `callGeminiAcp()` directly
- Rendering handled by `render.mjs`

Main switch: `setup`, `ask`, `review`, `ui-review`, `ui-design`, `task`, `adversarial-review`, `status`, `result`, `cancel`, `logs`.

Note: Use `child_process.spawnSync` (not `execSync`) for git diff to avoid shell injection.

- [ ] **Step 2: Commit**

```bash
cd /home/mark/claude-code-llm-plugins
git add gemini/scripts/gemini-companion.mjs
git commit -m "feat(gemini): rewrite Node entry point to route through Python ACP runtime"
```

---

## Task 10: Add logs command

**Files:**
- Create: `commands/logs.md`

- [ ] **Step 1: Create the logs command file**

```markdown
---
description: View Gemini job event log
argument-hint: '[--job <job_id>] [--text]'
disable-model-invocation: true
allowed-tools: Bash(node:*)
---

Show the event log for a Gemini job.

` ` `bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/gemini-companion.mjs" logs $ARGUMENTS
` ` `
```

(Remove spaces from backtick fences when creating file.)

- [ ] **Step 2: Commit**

```bash
cd /home/mark/claude-code-llm-plugins
git add gemini/commands/logs.md
git commit -m "feat(gemini): add /gemini:logs command"
```

---

## Task 11: Delete old files

**Files:**
- Delete: `scripts/lib/` (entire directory)
- Delete: `scripts/session-lifecycle-hook.mjs`

- [ ] **Step 1: Remove old lib directory and session hook**

```bash
cd /home/mark/claude-code-llm-plugins
rm -rf gemini/scripts/lib
rm gemini/scripts/session-lifecycle-hook.mjs
```

- [ ] **Step 2: Verify no broken imports**

Run: `cd /home/mark/claude-code-llm-plugins/gemini && node scripts/gemini-companion.mjs 2>&1 | head -5`

Expected: Usage output or subcommand list, no import errors.

- [ ] **Step 3: Commit**

```bash
cd /home/mark/claude-code-llm-plugins
git add -A gemini/scripts/lib gemini/scripts/session-lifecycle-hook.mjs
git commit -m "chore(gemini): remove old CLI-wrapper modules replaced by ACP runtime"
```

---

## Task 12: Smoke test — setup, ask, task, cancel, logs

- [ ] **Step 1: Test setup**

Run: `cd /home/mark/claude-code-llm-plugins/gemini && node scripts/gemini-companion.mjs setup`

Expected: Output showing Gemini CLI version and ACP readiness, or clear error about auth.

- [ ] **Step 2: Test ask (foreground)**

Run: `cd /home/mark/claude-code-llm-plugins/gemini && node scripts/gemini-companion.mjs ask "What is 2+2? Answer in one word."`

Expected: Result with text containing "Four" or similar.

- [ ] **Step 3: Test task (background + status + result)**

Run: `cd /home/mark/claude-code-llm-plugins/gemini && node scripts/gemini-companion.mjs task --background "Write hello world to /tmp/gemini-acp-test.txt"`

Expected: Background launch message with job ID.

Wait 30s, then: `node scripts/gemini-companion.mjs status`

Expected: Job listed.

Then: `node scripts/gemini-companion.mjs result`

Expected: Result text. Verify: `cat /tmp/gemini-acp-test.txt` shows content.

- [ ] **Step 4: Test cancel**

```bash
cd /home/mark/claude-code-llm-plugins/gemini
node scripts/gemini-companion.mjs task --background "Count from 1 to 1000 slowly"
sleep 5
node scripts/gemini-companion.mjs cancel
```

Expected: Cancel confirmation.

- [ ] **Step 5: Test logs**

Run: `node scripts/gemini-companion.mjs logs --text`

Expected: Human-readable event log entries.

- [ ] **Step 6: Commit any test-driven fixes**

```bash
cd /home/mark/claude-code-llm-plugins
git add -A gemini/
git commit -m "fix(gemini): smoke test fixes for ACP integration"
```

---

## Task 13: Sync to plugin cache and verify in Claude Code

- [ ] **Step 1: Sync updated plugin to cache**

```bash
rsync -a --delete \
  /home/mark/claude-code-llm-plugins/gemini/ \
  /home/mark/.claude/plugins/cache/google-gemini/gemini/1.0.0/
```

- [ ] **Step 2: Sync to marketplace**

```bash
rsync -a --delete \
  /home/mark/claude-code-llm-plugins/gemini/ \
  /home/mark/.claude/plugins/marketplaces/google-gemini/plugins/gemini/
```

- [ ] **Step 3: Reload plugins in Claude Code**

Run `/reload-plugins` in Claude Code.

Expected: Plugins reload with no errors. Gemini commands available.

- [ ] **Step 4: Test via slash commands**

Run: `/gemini:setup`

Expected: ACP readiness report.

Run: `/gemini:ask "What model are you?"`

Expected: Gemini responds with its model name.

- [ ] **Step 5: Final commit and push**

```bash
cd /home/mark/claude-code-llm-plugins
git add -A
git commit -m "feat(gemini): complete ACP refactor — all smoke tests passing"
git push origin main
```
