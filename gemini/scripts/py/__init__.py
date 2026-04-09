"""Gemini ACP runtime package."""
from __future__ import annotations

import sys
from pathlib import Path

VERSION = "1.0.0"

# The ACP SDK is vendored in Vibe's uv tool environment.
# Add it to sys.path so we can import acp. Version-agnostic so it works
# whichever python3.x mistral-vibe happens to be installed under.
_VIBE_LIB = Path.home() / ".local/share/uv/tools/mistral-vibe/lib"
if _VIBE_LIB.is_dir():
    for _py_dir in sorted(_VIBE_LIB.glob("python3.*"), reverse=True):
        _site_packages = _py_dir / "site-packages"
        if _site_packages.is_dir():
            if str(_site_packages) not in sys.path:
                sys.path.insert(0, str(_site_packages))
            break

JOBS_DIR = Path.home() / ".gemini-acp" / "jobs"
