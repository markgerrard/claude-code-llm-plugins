"""Job record CRUD with atomic writes and file locking."""
from __future__ import annotations

import fcntl
import json
import os
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from .schemas import JobRecord, JobStatus, SCHEMA_VERSION
from . import JOBS_DIR


def now_iso() -> str:
    """Return current UTC time as ISO 8601 string."""
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"


def generate_job_id() -> str:
    """Generate a unique job ID: gem-YYYYMMDD-HHMMSS-xxxx."""
    ts = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    rand = os.urandom(2).hex()  # 4 hex chars
    return f"gem-{ts}-{rand}"


def job_dir(job_id: str) -> Path:
    """Return the directory path for a given job ID."""
    return JOBS_DIR / job_id


def ensure_job_dir(job_id: str) -> Path:
    """Create the job directory if needed and return its path."""
    d = job_dir(job_id)
    d.mkdir(parents=True, exist_ok=True)
    return d


@contextmanager
def _job_lock(job_id: str):
    """Exclusive file lock for a job using fcntl.flock."""
    lock_path = job_dir(job_id) / "job.lock"
    lock_path.parent.mkdir(parents=True, exist_ok=True)
    with open(lock_path, "w") as fh:
        fcntl.flock(fh, fcntl.LOCK_EX)
        try:
            yield fh
        finally:
            fcntl.flock(fh, fcntl.LOCK_UN)


def _write_job_atomic(job_id: str, record: JobRecord) -> None:
    """Write a JobRecord atomically using a .tmp file + os.replace()."""
    d = ensure_job_dir(job_id)
    target = d / "job.json"
    tmp = d / "job.json.tmp"
    tmp.write_text(json.dumps(record.to_dict(), indent=2))
    os.replace(tmp, target)


def create_job(record: JobRecord) -> JobRecord:
    """Set timestamps and persist the job record atomically."""
    now = now_iso()
    record.created_at = now
    record.last_updated_at = now
    ensure_job_dir(record.job_id)
    with _job_lock(record.job_id):
        _write_job_atomic(record.job_id, record)
    return record


def read_job(job_id: str) -> Optional[JobRecord]:
    """Read a JobRecord from disk. Returns None if not found."""
    path = job_dir(job_id) / "job.json"
    if not path.exists():
        return None
    try:
        data = json.loads(path.read_text())
    except (json.JSONDecodeError, OSError):
        return None
    data.pop("schema_version", None)
    return JobRecord(**{k: v for k, v in data.items() if k in JobRecord.__dataclass_fields__})


def update_job(job_id: str, **updates) -> Optional[JobRecord]:
    """Atomically update fields on an existing job record."""
    with _job_lock(job_id):
        record = read_job(job_id)
        if record is None:
            return None
        for key, value in updates.items():
            if hasattr(record, key):
                setattr(record, key, value)
        record.last_updated_at = now_iso()
        _write_job_atomic(job_id, record)
    return record


def write_result(job_id: str, envelope_json: str) -> None:
    """Write result.json for a terminal job state (atomic)."""
    d = ensure_job_dir(job_id)
    target = d / "result.json"
    tmp = d / "result.json.tmp"
    tmp.write_text(envelope_json)
    os.replace(tmp, target)


def read_result(job_id: str) -> Optional[dict]:
    """Read result.json. Returns None if not found or invalid."""
    path = job_dir(job_id) / "result.json"
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text())
    except (json.JSONDecodeError, OSError):
        return None


def list_jobs_for_cwd(cwd: str) -> list[JobRecord]:
    """Return all jobs matching the given cwd, sorted newest first."""
    if not JOBS_DIR.exists():
        return []
    results: list[JobRecord] = []
    for entry in JOBS_DIR.iterdir():
        if not entry.is_dir():
            continue
        record = read_job(entry.name)
        if record is not None and record.cwd == cwd:
            results.append(record)
    results.sort(key=lambda r: r.created_at or "", reverse=True)
    return results


def reconcile_stale(job: JobRecord) -> JobRecord:
    """If job is running/cancelling but its PID is dead, mark it stale."""
    if job.status not in (JobStatus.RUNNING.value, JobStatus.CANCELLING.value):
        return job
    if job.pid is None:
        return job
    pid_alive = True
    try:
        os.kill(job.pid, 0)
    except (ProcessLookupError, PermissionError):
        pid_alive = False
    if not pid_alive:
        updated = update_job(job.job_id, status=JobStatus.STALE.value, ended_at=now_iso())
        return updated if updated is not None else job
    return job
