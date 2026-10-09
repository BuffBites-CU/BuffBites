import asyncio
import base64
import json

import anthropic
import httpx2
import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

import menu_store
from routers import vision
from routers.vision import PlateRequest, _VPlate, _VPlateItem, ground_items

TODAY = "2026-10-09"

DAY = {
    "date": TODAY,
    "day_of_week": "Friday",
    "categories": {
        "Smoke n' Grill": [
            {"name": "Grilled Chicken Breast", "serving_size": "4 oz", "calories": 180,
             "nutrition": {"protein_g": 32, "carbohydrates_g": 0, "fat_g": 5, "sodium_mg": 400}},
        ],
        "Wholesome Field": [
            {"name": "Brown Rice", "serving_size": "1/2 cup", "calories": 110,
             "nutrition": {"protein_g": 2.5, "carbohydrates_g": 23, "fat_g": 1, "fiber_g": 2}},
        ],
        "Salad Dressings": [
            {"name": "Ranch Dressing", "serving_size": "2 tbsp", "calories": 140,
             "nutrition": {"protein_g": 0, "carbohydrates_g": 1, "fat_g": 15}},
        ],
    },
}
PNG_1PX = base64.b64encode(bytes.fromhex(
    "89504e470d0a1a0a0000000d4948445200000001000000010806000000"
    "1f15c4890000000d49444154789c6360000002000105e2d3d00000000049454e44ae426082"
)).decode()


@pytest.fixture(autouse=True)
def _menu(monkeypatch):
    menu_store._cache["c4c"] = {"dining_location": "C4C", "menus": [DAY]}
    monkeypatch.setattr(vision, "_today_mt", lambda: TODAY)
    vision._limiter._hits.clear()


def _lookup():
    return vision._menu_lines(DAY)[1]


def test_ground_items_scales_scraped_nutrition_by_portion():
    parsed = _VPlate(is_food=True, notes="", items=[
        _VPlateItem(menu_item="grilled chicken breast", seen_as="chicken", portion=1.5, confidence="high"),
        _VPlateItem(menu_item="Ranch Dressing", seen_as="ranch cup", portion=1, confidence="medium"),
    ])
    items, unmatched = ground_items(parsed, _lookup())
    assert [i.name for i in items] == ["Grilled Chicken Breast", "Ranch Dressing"]
    assert items[0].calories == 270 and items[0].protein_g == 48
    assert items[0].station == "Smoke n' Grill"
    assert unmatched == []


def test_ground_items_drops_hallucinated_and_clamps_portion():
    parsed = _VPlate(is_food=True, notes="", items=[
        _VPlateItem(menu_item="Lobster Thermidor", seen_as="lobster", portion=1, confidence="low"),
        _VPlateItem(menu_item=None, seen_as="can of Celsius", portion=1, confidence="high"),
        _VPlateItem(menu_item="Brown Rice", seen_as="rice", portion=40, confidence="high"),
    ])
    items, unmatched = ground_items(parsed, _lookup())
    assert [u.description for u in unmatched] == ["lobster", "can of Celsius"]
    assert items[0].portion == vision._MAX_PORTION


def test_menu_lines_dedupes_and_includes_dressings():
    text, lookup = vision._menu_lines(DAY)
    assert "Ranch Dressing | Salad Dressings | 2 tbsp | 140 cal" in text
    assert set(lookup) == {"grilled chicken breast", "brown rice", "ranch dressing"}


@pytest.mark.parametrize("req,status", [
    (PlateRequest(image_base64=PNG_1PX, media_type="image/gif", dining="c4c"), 415),
    (PlateRequest(image_base64="not base64!!", media_type="image/png", dining="c4c"), 400),
])
def test_decode_image_rejects_bad_input(req, status):
    with pytest.raises(HTTPException) as exc:
        vision._decode_image(req)
    assert exc.value.status_code == status


def test_decode_image_strips_data_url():
    req = PlateRequest(image_base64=f"data:image/png;base64,{PNG_1PX}", media_type="image/png", dining="c4c")
    assert vision._decode_image(req) == PNG_1PX


def _app():
    app = FastAPI()
    app.include_router(vision.router)
    return TestClient(app)


def test_endpoint_returns_grounded_totals(monkeypatch):
    async def fake(*_a, **_k):
        return _VPlate(is_food=True, notes="Nice protein!", items=[
            _VPlateItem(menu_item="Grilled Chicken Breast", seen_as="chicken", portion=1, confidence="high"),
            _VPlateItem(menu_item="Brown Rice", seen_as="rice", portion=2, confidence="high"),
        ])
    monkeypatch.setattr(vision, "_call_model", fake)
    r = _app().post("/api/vision/plate", json={"image_base64": PNG_1PX, "media_type": "image/png", "dining": "c4c"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["totals"]["calories"] == 400
    assert body["totals"]["protein_g"] == 37
    assert body["totals"]["fiber_g"] == 4


def test_endpoint_404_when_no_menu(monkeypatch):
    monkeypatch.setattr(vision, "_today_mt", lambda: "2030-01-01")
    r = _app().post("/api/vision/plate", json={"image_base64": PNG_1PX, "media_type": "image/png", "dining": "c4c"})
    assert r.status_code == 404


def test_endpoint_rate_limited(monkeypatch):
    async def fake(*_a, **_k):
        return _VPlate(is_food=False, notes="", items=[])
    monkeypatch.setattr(vision, "_call_model", fake)
    c = _app()
    codes = [c.post("/api/vision/plate", json={"image_base64": PNG_1PX, "media_type": "image/png", "dining": "c4c"}).status_code
             for _ in range(vision._limiter.limit + 1)]
    assert codes[-1] == 429 and set(codes[:-1]) == {200}


# ── The real SDK call, against a mocked HTTP transport ─────────────────────

def _mock_client(monkeypatch, reply: dict, captured: dict):
    def handler(request: httpx2.Request) -> httpx2.Response:
        captured["headers"] = dict(request.headers)
        captured["body"] = json.loads(request.content)
        return httpx2.Response(200, json=reply)
    client = anthropic.AsyncAnthropic(api_key="test", http_client=httpx2.AsyncClient(transport=httpx2.MockTransport(handler)))
    monkeypatch.setattr(vision, "_make_client", lambda: client)


def _reply(text: str | None, stop_reason: str = "end_turn") -> dict:
    return {
        "id": "msg_1", "type": "message", "role": "assistant", "model": vision.VISION_MODEL,
        "content": [{"type": "text", "text": text}] if text is not None else [],
        "stop_reason": stop_reason, "stop_sequence": None,
        "usage": {"input_tokens": 10, "output_tokens": 10},
    }


def test_call_model_request_shape(monkeypatch):
    captured: dict = {}
    out = {"is_food": True, "notes": "", "items": [
        {"menu_item": "Brown Rice", "seen_as": "rice", "portion": 1, "confidence": "high"}]}
    _mock_client(monkeypatch, _reply(json.dumps(out)), captured)

    parsed = asyncio.run(vision._call_model(PNG_1PX, "image/png", "Brown Rice | X | 1 | 110 cal", "C4C"))

    assert parsed.items[0].menu_item == "Brown Rice"
    body = captured["body"]
    assert body["model"] == vision.VISION_MODEL
    assert body["fallbacks"] == "default"
    assert "server-side-fallback-2026-07-01" in captured["headers"]["anthropic-beta"]
    assert body["output_config"]["effort"] == "medium"
    assert body["output_config"]["format"]["type"] == "json_schema"
    assert body["system"][1]["cache_control"] == {"type": "ephemeral"}
    assert body["messages"][0]["content"][0]["type"] == "image"
    assert "thinking" not in body


def test_call_model_refusal_maps_to_422(monkeypatch):
    _mock_client(monkeypatch, _reply(None, stop_reason="refusal"), {})
    with pytest.raises(HTTPException) as exc:
        asyncio.run(vision._call_model(PNG_1PX, "image/png", "menu", "C4C"))
    assert exc.value.status_code == 422
