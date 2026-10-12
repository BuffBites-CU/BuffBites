import base64

from fastapi import FastAPI
from fastapi.testclient import TestClient

from menu_store import CLOSED_HALLS
from routers import combos, vision


def _client():
    app = FastAPI()
    app.include_router(combos.router)
    app.include_router(vision.router)
    app.dependency_overrides[vision.get_current_user] = lambda: {"uid": "student-1"}
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


def test_combo_provider_errors_are_not_shown_to_students(monkeypatch):
    import anthropic
    import httpx
    from routers import combos as combos_mod

    async def no_cache(*_a, **_k):
        return None
    monkeypatch.setattr(combos_mod.combo_cache_collection, "find_one", no_cache)

    async def auth_fail(*_a, **_k):
        req = httpx.Request("POST", "https://api.anthropic.com/v1/messages")
        raise anthropic.AuthenticationError(
            "invalid x-api-key", response=httpx.Response(401, request=req), body=None)
    monkeypatch.setattr(combos_mod, "_generate_period_with_claude", auth_fail)
    combos_mod._combo_limiter._hits.clear()

    import menu_store
    from datetime import datetime
    from zoneinfo import ZoneInfo
    today = datetime.now(ZoneInfo("America/Denver")).date().isoformat()
    menu_store._cache["c4c"] = {"dining_location": "C4C", "menus": [{"date": today, "day_of_week": "Friday",
        "categories": {"Smoke n' Grill - Grill Menu": [{"name": "Burger", "calories": 500, "nutrition": {}}]}}]}

    r = _client().get("/api/combos/generate", params={"dining": "c4c", "date": today})
    assert r.status_code == 503
    assert "x-api-key" not in r.text and "401" not in r.text
