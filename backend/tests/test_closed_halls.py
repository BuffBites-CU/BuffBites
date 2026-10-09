import base64

from fastapi import FastAPI
from fastapi.testclient import TestClient

from menu_store import CLOSED_HALLS
from routers import combos, vision


def _client():
    app = FastAPI()
    app.include_router(combos.router)
    app.include_router(vision.router)
    return TestClient(app)


def test_alley_is_marked_closed():
    assert "alley" in CLOSED_HALLS


def test_menu_for_closed_hall_explains_why():
    r = _client().get("/api/menu", params={"dining": "alley"})
    assert r.status_code == 404
    assert r.json()["detail"] == CLOSED_HALLS["alley"]


def test_plate_scan_for_closed_hall_explains_why_before_calling_model(monkeypatch):
    async def boom(*_a, **_k):
        raise AssertionError("model must not be called for a closed hall")
    monkeypatch.setattr(vision, "_call_model", boom)
    vision._limiter._hits.clear()
    img = base64.b64encode(b"\xff\xd8\xff").decode()
    r = _client().post("/api/vision/plate", json={"image_base64": img, "dining": "alley"})
    assert r.status_code == 404
    assert r.json()["detail"] == CLOSED_HALLS["alley"]
