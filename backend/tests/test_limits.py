from fastapi import FastAPI, Request
from fastapi.testclient import TestClient

from body_limit import BodySizeLimitMiddleware
from rate_limit import client_ip


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
