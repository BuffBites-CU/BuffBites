"""Snap-your-plate: photo → items matched to today's menu → macros.

Generic food-photo apps (Cal AI, MyFitnessPal Meal Scan) have to guess both
*what* a dish is and *its nutrition* from a global food database. We know the
exact menu the student is eating from, so the model's job shrinks to a
grounded matching problem:

    1. Claude (vision) looks at the photo and picks items from today's scraped
       menu at that hall, plus a portion estimate per item.
    2. The server verifies every pick against the menu (same idea as
       `verify_combos` for AI combos) and drops anything not on it.
    3. Nutrition comes from the scraped Nutrislice data × portion — never from
       the model — so the numbers are only as wrong as the portion estimate.

Images are processed in memory and never stored.
"""

import base64
import binascii
import os
import sys
from typing import Literal

import anthropic
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from menu_store import DINING_FILES, load_menu
from rate_limit import SlidingWindowLimiter
from routers.combos import _today_mt

router = APIRouter()

# Opus-class vision is what makes small-item recognition (a scoop of rice vs.
# quinoa, which dressing) reliable. Override with VISION_MODEL to trade
# accuracy for cost, e.g. claude-haiku-5-5.
VISION_MODEL = os.getenv("VISION_MODEL", "claude-opus-5-5")

_ALLOWED_MEDIA = {"image/jpeg", "image/png", "image/webp"}
_MAX_IMAGE_BYTES = 5 * 1024 * 1024
_MAX_MENU_ITEMS = 450
_MAX_PORTION = 4.0

# Vision calls cost more than combo generation; give them their own, tighter bucket.
_limiter = SlidingWindowLimiter(limit=6, window_seconds=60)



# ── Request / response models ──────────────────────────────────────────────

class PlateRequest(BaseModel):
    image_base64: str = Field(..., description="Base64-encoded image, no data: prefix")
    media_type: str = "image/jpeg"
    dining: str
    date: str | None = None


class PlateItemOut(BaseModel):
    name: str
    station: str
    portion: float
    confidence: Literal["high", "medium", "low"]
    calories: float
    protein_g: float
    carbs_g: float
    fat_g: float
    fiber_g: float
    sodium_mg: float
    added_sugar_g: float


class UnmatchedItem(BaseModel):
    description: str


class PlateResponse(BaseModel):
    dining_location: str
    date: str
    is_food: bool
    items: list[PlateItemOut]
    unmatched: list[UnmatchedItem]
    totals: dict[str, float]
    notes: str


# ── Structured output the model must return ────────────────────────────────

class _VPlateItem(BaseModel):
    menu_item: str | None = Field(
        description="Exact name copied from the MENU list, or null if the food is not on it"
    )
    seen_as: str = Field(description="Short description of what is visible, e.g. 'scoop of white rice'")
    portion: float = Field(description="Servings relative to the menu serving size, e.g. 0.5, 1, 1.5, 2")
    confidence: Literal["high", "medium", "low"]


class _VPlate(BaseModel):
    is_food: bool = Field(description="False if the photo does not show a meal")
    items: list[_VPlateItem]
    notes: str = Field(description="One short sentence for the student; empty if nothing to add")


_SYSTEM_INSTRUCTIONS = """You identify food on a student's plate at a CU Boulder dining hall.

You get a photo and the full MENU served at that hall today, one item per line as
`name | station | serving size | calories`. For every distinct food you can see:
- Set menu_item to the exact name from MENU that best matches it. Prefer items whose
  station fits what you see. Copy the name character-for-character.
- If nothing on MENU plausibly matches (outside food, a drink brought in), set
  menu_item to null and describe it in seen_as.
- Estimate portion in menu servings by comparing against the plate, utensils and
  bowls. A standard dining-hall scoop is usually one serving.
- Include visible sauces and dressings as separate items; they carry real calories.
- Use confidence "low" when two menu items look alike and you had to guess.

If the photo is not a meal, set is_food to false and return no items.
Never invent nutrition numbers; the server computes them from the menu."""


def _menu_lines(day_menu: dict) -> tuple[str, dict[str, dict]]:
    """Render the day's menu for the prompt and build a name → item lookup."""
    lookup: dict[str, dict] = {}
    lines: list[str] = []
    for station, items in (day_menu.get("categories") or {}).items():
        for raw in items:
            name = (raw.get("name") or "").strip()
            key = name.lower()
            if not name or key in lookup:
                continue
            lookup[key] = {**raw, "station": station}
            cal = raw.get("calories")
            lines.append(f"{name} | {station} | {raw.get('serving_size') or '1 serving'} | {cal if cal not in (None, '') else '?'} cal")
            if len(lines) >= _MAX_MENU_ITEMS:
                break
        if len(lines) >= _MAX_MENU_ITEMS:
            break
    return "\n".join(lines), lookup


def _num(v) -> float:
    try:
        return float(v)
    except (TypeError, ValueError):
        return 0.0


def ground_items(parsed: _VPlate, lookup: dict[str, dict]) -> tuple[list[PlateItemOut], list[UnmatchedItem]]:
    """Keep only picks that exist on today's menu; compute nutrition from scraped data."""
    items: list[PlateItemOut] = []
    unmatched: list[UnmatchedItem] = []
    for pick in parsed.items:
        raw = lookup.get((pick.menu_item or "").strip().lower())
        if raw is None:
            if pick.menu_item:
                print(f"[VISION] dropped off-menu pick: {pick.menu_item!r}", file=sys.stderr)
            unmatched.append(UnmatchedItem(description=pick.seen_as or (pick.menu_item or "unknown item")))
            continue
        portion = min(max(pick.portion, 0.25), _MAX_PORTION)
        n = raw.get("nutrition") or {}
        items.append(PlateItemOut(
            name=raw["name"],
            station=raw["station"],
            portion=round(portion, 2),
            confidence=pick.confidence,
            calories=round(_num(raw.get("calories") or n.get("calories")) * portion),
            protein_g=round(_num(n.get("protein_g")) * portion, 1),
            carbs_g=round(_num(n.get("carbohydrates_g")) * portion, 1),
            fat_g=round(_num(n.get("fat_g")) * portion, 1),
            fiber_g=round(_num(n.get("fiber_g")) * portion, 1),
            sodium_mg=round(_num(n.get("sodium_mg")) * portion),
            added_sugar_g=round(_num(n.get("added_sugar_g")) * portion, 1),
        ))
    return items, unmatched


def _totals(items: list[PlateItemOut]) -> dict[str, float]:
    keys = ("calories", "protein_g", "carbs_g", "fat_g", "fiber_g", "sodium_mg", "added_sugar_g")
    return {k: round(sum(getattr(i, k) for i in items), 1) for k in keys}


def _decode_image(req: PlateRequest) -> str:
    if req.media_type not in _ALLOWED_MEDIA:
        raise HTTPException(status_code=415, detail="Use a JPEG, PNG or WebP photo.")
    data = req.image_base64.split(",", 1)[-1] if req.image_base64.startswith("data:") else req.image_base64
    try:
        raw = base64.b64decode(data, validate=True)
    except (binascii.Error, ValueError):
        raise HTTPException(status_code=400, detail="Image is not valid base64.")
    if len(raw) > _MAX_IMAGE_BYTES:
        raise HTTPException(status_code=413, detail="Photo is too large (max 5 MB).")
    return base64.standard_b64encode(raw).decode("ascii")


def _make_client() -> anthropic.AsyncAnthropic:
    return anthropic.AsyncAnthropic()


async def _call_model(image_b64: str, media_type: str, menu_text: str, hall: str) -> _VPlate:
    client = _make_client()
    try:
        response = await client.beta.messages.parse(
            model=VISION_MODEL,
            max_tokens=8000,
            output_config={"effort": "medium"},
            # Server-side retry on Anthropic's recommended model if a safety
            # classifier declines (rare for food photos, but costs nothing).
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",
            system=[
                {"type": "text", "text": _SYSTEM_INSTRUCTIONS},
                # The menu is identical for every student at this hall today, so
                # cache it; only the photo changes between requests.
                {
                    "type": "text",
                    "text": f"MENU — {hall}\n{menu_text}",
                    "cache_control": {"type": "ephemeral"},
                },
            ],
            messages=[{
                "role": "user",
                "content": [
                    {"type": "image", "source": {"type": "base64", "media_type": media_type, "data": image_b64}},
                    {"type": "text", "text": "Identify everything on this plate."},
                ],
            }],
            output_format=_VPlate,
        )
    except anthropic.RateLimitError:
        raise HTTPException(status_code=503, detail="Plate scanner is busy. Try again in a minute.")
    except anthropic.BadRequestError as e:
        print(f"[VISION] bad request: {e.message}", file=sys.stderr)
        raise HTTPException(status_code=400, detail="Couldn't read that photo. Try another one.")
    except anthropic.APIStatusError as e:
        print(f"[VISION] API error {e.status_code}: {e.message}", file=sys.stderr)
        raise HTTPException(status_code=502, detail="Plate scanner is unavailable right now.")
    except anthropic.APIConnectionError:
        raise HTTPException(status_code=503, detail="Plate scanner is unavailable right now.")

    if response.stop_reason == "refusal":
        raise HTTPException(status_code=422, detail="Couldn't analyze this photo. Try a clearer shot of your plate.")
    if response.parsed_output is None:
        print(f"[VISION] no parsed output, stop_reason={response.stop_reason}", file=sys.stderr)
        raise HTTPException(status_code=502, detail="Couldn't read that photo. Try another one.")
    return response.parsed_output


@router.post("/api/vision/plate", response_model=PlateResponse)
async def analyze_plate(req: PlateRequest, request: Request) -> PlateResponse:
    _limiter.check(request.client.host if request.client else "unknown")

    if req.dining not in DINING_FILES:
        raise HTTPException(status_code=400, detail=f"Invalid dining location. Must be one of: {', '.join(DINING_FILES)}")
    image_b64 = _decode_image(req)

    target_date = req.date or _today_mt()
    menu_data = load_menu(req.dining)
    day_menu = next((m for m in menu_data["menus"] if m["date"] == target_date), None)
    if not day_menu or not day_menu.get("categories"):
        raise HTTPException(status_code=404, detail=f"No menu for {menu_data['dining_location']} on {target_date}.")

    menu_text, lookup = _menu_lines(day_menu)
    parsed = await _call_model(image_b64, req.media_type, menu_text, menu_data["dining_location"])

    if not parsed.is_food:
        return PlateResponse(
            dining_location=menu_data["dining_location"], date=target_date, is_food=False,
            items=[], unmatched=[], totals=_totals([]), notes=parsed.notes or "That doesn't look like a meal.",
        )

    items, unmatched = ground_items(parsed, lookup)
    return PlateResponse(
        dining_location=menu_data["dining_location"],
        date=target_date,
        is_food=True,
        items=items,
        unmatched=unmatched,
        totals=_totals(items),
        notes=parsed.notes,
    )
