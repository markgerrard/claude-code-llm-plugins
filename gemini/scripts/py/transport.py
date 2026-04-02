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
    async def spawn(self, cwd: str, env: dict) -> None: ...

    @abstractmethod
    async def initialize(self, timeout_s: float = 10.0) -> InitResult: ...

    @abstractmethod
    async def new_session(self) -> str: ...

    @abstractmethod
    async def load_session(self, session_id: str) -> str: ...

    @abstractmethod
    async def send_prompt(self, text: str, session_id: str) -> None: ...

    @abstractmethod
    async def stream_events(self) -> AsyncIterator[dict]: ...

    @abstractmethod
    async def cancel(self, session_id: str) -> None: ...

    @abstractmethod
    async def close(self) -> None: ...

    @abstractmethod
    def is_alive(self) -> bool: ...
