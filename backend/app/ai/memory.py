"""Conversation memory for the AI engine.

In-process, bounded-per-session history keyed by ``session_id``. Production
would back this with Redis; the sync interface keeps the API layer simple.
"""

from __future__ import annotations

import time
from collections import deque
from dataclasses import asdict, dataclass
from threading import Lock

MAX_TURNS = 12


@dataclass
class MemoryMessage:
    role: str
    content: str
    ts: float


class ConversationMemory:
    """Thread-safe per-session history buffer."""

    def __init__(self, max_turns: int = MAX_TURNS) -> None:
        self._sessions: dict[str, deque[MemoryMessage]] = {}
        self._lock = Lock()
        self._max_turns = max_turns

    def _buffer(self, session: str) -> deque[MemoryMessage]:
        with self._lock:
            buf = self._sessions.get(session)
            if buf is None:
                buf = deque(maxlen=self._max_turns * 2)
                self._sessions[session] = buf
            return buf

    def append(self, session: str, role: str, content: str) -> None:
        self._buffer(session).append(MemoryMessage(role=role, content=content, ts=time.time()))

    def history(self, session: str, limit: int = MAX_TURNS) -> list[dict]:
        with self._lock:
            buf = self._sessions.get(session)
            if not buf:
                return []
            items = [asdict(m) for m in list(buf)[-limit * 2 :]]
        return items

    def clear(self, session: str) -> None:
        with self._lock:
            self._sessions.pop(session, None)

    def sessions(self) -> list[str]:
        with self._lock:
            return list(self._sessions.keys())


_active_memory: ConversationMemory | None = None


def get_memory() -> ConversationMemory:
    global _active_memory
    if _active_memory is None:
        _active_memory = ConversationMemory()
    return _active_memory