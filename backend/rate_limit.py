"""In-memory per-key sliding-window rate limiter.

Sufficient for a single Fly instance; swap for Redis if you scale horizontally.
"""

import time
from collections import defaultdict, deque
from threading import Lock

from fastapi import HTTPException


class SlidingWindowLimiter:
    def __init__(self, limit: int, window_seconds: float, detail: str | None = None):
        self.limit = limit
        self.window = window_seconds
        self.detail = detail or "Too many requests. Please wait a moment and try again."
        self._hits: dict[str, deque] = defaultdict(deque)
        self._lock = Lock()

    def check(self, key: str) -> None:
        now = time.monotonic()
        with self._lock:
            hits = self._hits[key]
            while hits and hits[0] <= now - self.window:
                hits.popleft()
            if len(hits) >= self.limit:
                raise HTTPException(status_code=429, detail=self.detail)
            hits.append(now)
