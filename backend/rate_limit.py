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
        cutoff = now - self.window
        with self._lock:
            # Evict keys whose newest hit is outside the window before looking
            # up this key, so the deque we append to is the one in the dict.
            if len(self._hits) > 10_000:
                for k in [k for k, v in self._hits.items() if not v or v[-1] <= cutoff]:
                    del self._hits[k]
            hits = self._hits[key]
            while hits and hits[0] <= cutoff:
                hits.popleft()
            if len(hits) >= self.limit:
                raise HTTPException(status_code=429, detail=self.detail)
            hits.append(now)


class DailyQuota:
    """Per-key and app-wide counters for paid calls, reset when `today()` changes.

    `per_key` and `total` are read on every call, so they can be changed at
    runtime (tests do).
    """

    def __init__(
        self,
        per_key: int,
        total: int,
        today,
        key_detail: str = "You've hit today's limit. It resets at midnight.",
        total_detail: str = "This is paused for today. Try again tomorrow.",
    ):
        self.per_key = per_key
        self.total = total
        self._today = today
        self.key_detail = key_detail
        self.total_detail = total_detail
        self.day = ""
        self.used = 0
        self.by_key: dict[str, int] = {}
        self._lock = Lock()

    def take(self, key: str) -> None:
        today = self._today()
        with self._lock:
            if today != self.day:
                self.day, self.used, self.by_key = today, 0, {}
            if self.by_key.get(key, 0) >= self.per_key:
                raise HTTPException(status_code=429, detail=self.key_detail)
            if self.used >= self.total:
                raise HTTPException(status_code=503, detail=self.total_detail)
            self.by_key[key] = self.by_key.get(key, 0) + 1
            self.used += 1
