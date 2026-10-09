"""In-memory per-key sliding-window rate limiter.

Sufficient for a single Fly instance; swap for Redis if you scale horizontally.
"""

import time
from collections import defaultdict, deque
from threading import Lock

from fastapi import HTTPException, Request


def client_ip(request: Request) -> str:
    """The student's IP, not the proxy's.

    On Fly.io every request reaches uvicorn from the Fly proxy, so
    request.client.host is the same address for everyone and a per-IP limit
    becomes one global bucket. Fly sets Fly-Client-IP to the real client; we
    trust only that header (X-Forwarded-For's first hop is client-controlled).
    """
    fly = request.headers.get("fly-client-ip", "").strip()
    if fly:
        return fly
    return request.client.host if request.client else "unknown"


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
