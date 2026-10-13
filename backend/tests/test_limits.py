import types

import pytest
from fastapi import FastAPI, HTTPException, Request
from fastapi.testclient import TestClient

import rate_limit
from body_limit import BodySizeLimitMiddleware
from rate_limit import SlidingWindowLimiter, client_ip


def _echo_app(max_bytes: int):
    app = FastAPI()

    @app.post("/echo")
    async def echo(request: Request):
        return {"n": len(await request.body()), "ip": client_ip(request)}

    app.add_middleware(BodySizeLimitMiddleware, max_bytes=max_bytes)
    return TestClient(app)


def test_body_under_limit_passes():
    assert _echo_app(100).post("/echo", content=b"x" * 100).json()["n"] == 100


def test_declared_oversize_rejected():
    assert _echo_app(100).post("/echo", content=b"x" * 101).status_code == 413


def test_streamed_oversize_without_length_rejected():
    def chunks():
        for _ in range(10):
            yield b"x" * 50
    r = _echo_app(100).post("/echo", content=chunks())  # chunked, no Content-Length
    assert r.status_code == 413


def test_client_ip_prefers_fly_header():
    c = _echo_app(1000)
    assert c.post("/echo", content=b"", headers={"Fly-Client-IP": "9.9.9.9"}).json()["ip"] == "9.9.9.9"
    assert c.post("/echo", content=b"").json()["ip"] == "testclient"


@pytest.fixture
def clock(monkeypatch):
    now = [1000.0]
    monkeypatch.setattr(rate_limit, "time", types.SimpleNamespace(monotonic=lambda: now[0]))
    return now


def _allowed(limiter: SlidingWindowLimiter, key: str, n: int) -> int:
    ok = 0
    for _ in range(n):
        try:
            limiter.check(key)
            ok += 1
        except HTTPException:
            pass
    return ok


def test_limiter_still_limits_new_keys_after_10k_keys(clock):
    limiter = SlidingWindowLimiter(limit=3, window_seconds=60)
    for i in range(10_001):
        limiter.check(f"ip-{i}")
    assert _allowed(limiter, "attacker", 50) == 3
    clock[0] += 61  # every earlier key is now stale
    assert _allowed(limiter, "attacker-2", 50) == 3


def test_limiter_evicts_stale_keys_once_large(clock):
    limiter = SlidingWindowLimiter(limit=3, window_seconds=60)
    for i in range(10_001):
        limiter.check(f"ip-{i}")
    clock[0] += 61
    limiter.check("ip-0")  # past 10k: stale keys go before the lookup
    limiter.check("new")
    assert set(limiter._hits) == {"ip-0", "new"}
