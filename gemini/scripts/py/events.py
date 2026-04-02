"""Event normalization and JSONL persistence."""
from __future__ import annotations

import json
from pathlib import Path

from .schemas import EventRecord
from .job_model import job_dir


def events_path(job_id: str) -> Path:
    """Return the path to the events.jsonl file for a job."""
    return job_dir(job_id) / "events.jsonl"


def append_event(job_id: str, record: EventRecord) -> None:
    """Append a single EventRecord as a JSONL line."""
    path = events_path(job_id)
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "a") as fh:
        fh.write(record.to_json() + "\n")


def read_events(job_id: str) -> list[dict]:
    """Read all events from events.jsonl, skipping invalid lines."""
    path = events_path(job_id)
    if not path.exists():
        return []
    events: list[dict] = []
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            events.append(json.loads(line))
        except json.JSONDecodeError:
            continue
    return events
