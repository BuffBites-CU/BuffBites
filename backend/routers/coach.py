"""Fuel coach: today's calorie target from Strava workouts, and a menu-built plan.

Two steps, kept apart on purpose:

1. **Budget (no AI).** `energy.py` turns body stats and today's Strava
   workouts into a calorie and macro target. Same inputs, same numbers.
2. **Plan (agent).** Claude gets the hall's menu and a short brief, drafts a
   day of meals, and calls a `check_plan` tool that totals the draft from the
   scraped nutrition data and says what's off (over budget, short on protein,
   an item that isn't on the menu or breaks a dietary rule). It revises until
   the check passes. The server re-checks the final answer the same way and
   drops anything that doesn't hold up, so every number shown comes from the
   menu, never from the model.

Strava data is used only for students who connected it (see strava_client.py).
Without it the budget is a rest-day estimate.
"""

from __future__ import annotations

import asyncio
import difflib
import functools
import hashlib
import json
import os
from dataclasses import dataclass, field
from datetime import date as date_cls, datetime, timedelta, timezone
from typing import Literal

import anthropic
import structlog
from anthropic import beta_async_tool
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, ValidationError

import energy
import strava_client
from auth import get_current_user
from database import coach_plans_collection, users_collection
from menu_rules import (
    GLUTEN_ALLERGENS,
    MT,
    check_date,
    classify_station,
    ensure_open,
    is_component_item,
    name_key,
    passes_dietary,
    to_float,
    today_mt,
)
from menu_store import DINING_FILES, load_menu
from pydantic_models.user_models import BodyStats
from rate_limit import DailyQuota, SlidingWindowLimiter

router = APIRouter(prefix="/api/coach", tags=["coach"])
logger = structlog.get_logger()

COACH_MODEL = os.getenv("COACH_MODEL", "claude-opus-5-5")
# Bump when the prompt or tool changes, so cached plans from the old one expire.
PROMPT_VERSION = "2"
_PLAN_TTL = timedelta(hours=6)
_MAX_TURNS = 6
_MAX_MENU_ITEMS = 400
_MAX_MEAL_ITEMS = 6  # the prompt asks for 2-6 items per meal

PERIODS = ("Breakfast", "Lunch", "Dinner")
# Share of the day's calories, and the hour (MT) after which a meal is past.
PERIOD_SHARE = {"Breakfast": 0.25, "Lunch": 0.35, "Dinner": 0.40}
PERIOD_END_HOUR = {"Breakfast": 11, "Lunch": 16, "Dinner": 21}
_ORDER = {"Breakfast": 0, "Lunch": 1, "Snack": 2, "Dinner": 3}

_limiter = SlidingWindowLimiter(limit=4, window_seconds=60, detail="Slow down a little. Try again in a minute.")
_quota = DailyQuota(
    per_key=int(os.getenv("COACH_DAILY_PER_USER", "8")),
    total=int(os.getenv("COACH_DAILY_TOTAL", "150")),
    today=today_mt,
    key_detail="You've built today's limit of fuel plans. It resets at midnight.",
    total_detail="Fuel plans are paused for today. Try again tomorrow.",
)


def _now_mt() -> datetime:
    return datetime.now(MT)


# ── Response models ────────────────────────────────────────────────────────

class Macros(BaseModel):
    calories: int = 0
    protein_g: int = 0
    carbs_g: int = 0
    fat_g: int = 0


class WorkoutOut(BaseModel):
    name: str
    sport: str
    date: str
    start_time: str
    minutes: float
    distance_km: float
    elevation_m: float
    kcal: int
    method: str


class TrainingOut(BaseModel):
    connected: bool
    today: list[WorkoutOut] = []
    week_sessions: int = 0
    week_minutes: int = 0
    week_kcal: int = 0
    error: str | None = None


class BodyOut(BaseModel):
    weight_kg: float
    height_cm: float
    age: int
    sex: str
    estimated: list[str]


class BudgetOut(BaseModel):
    date: str
    bmr: int
    baseline_kcal: int
    exercise_kcal: int
    goal_adjust_kcal: int
    target_kcal: int
    protein_g: int
    carbs_g: int
    fat_g: int
    fiber_g: int
    training_load: str
    focus: str | None
    eaten: Macros
    remaining_kcal: int
    body: BodyOut
    training: TrainingOut
    notes: list[str]


class PlanItemOut(BaseModel):
    name: str
    station: str
    servings: float
    calories: int
    protein_g: float
    carbs_g: float
    fat_g: float


class PlanMealOut(BaseModel):
    period: str
    title: str
    why: str
    items: list[PlanItemOut]
    totals: Macros
    target_kcal: int | None
    target_protein_g: int | None


class PlanOut(BaseModel):
    date: str
    dining_location: str
    budget: BudgetOut
    meals: list[PlanMealOut]
    totals: Macros
    planned_kcal: int
    planned_protein_g: int
    headline: str
    tips: list[str]
    assumptions: list[str]


class PlanRequest(BaseModel):
    dining: str
    date: str | None = None


# ── What the model works with ─────────────────────────────────────────────

class _DraftItem(BaseModel):
    name: str = Field(description="Exact item name from MENU")
    servings: float = Field(description="Menu servings, 0.5 to 3 in steps of 0.5")


class _DraftMeal(BaseModel):
    period: Literal["Breakfast", "Lunch", "Dinner", "Snack"]
    items: list[_DraftItem]


class _CoachMeal(_DraftMeal):
    title: str = Field(description="Short name for the meal, e.g. 'Recovery pasta bowl'")
    why: str = Field(description="One sentence tying this meal to today's training or goal")


class _CoachOutput(BaseModel):
    headline: str = Field(description="One sentence summing up today's fueling, under 120 characters")
    meals: list[_CoachMeal]
    tips: list[str] = Field(description="Up to 3 short, specific tips")


_SYSTEM = """You are the fuel coach in BuffBites, a CU Boulder dining-hall app. You plan what a
student eats for the rest of today from ONE hall's MENU, so they hit a calorie and protein
target that the server has already worked out from their body stats and Strava workouts.

How to work:
1. Draft a plan for each meal period in the brief: 2-6 items per meal from MENU, each with
   servings (0.5 to 3, in steps of 0.5). Prefer stations tagged for that period.
2. Call check_plan with the draft. It totals the draft from the menu's nutrition data and
   lists what is off. Never do the nutrition math yourself.
3. Fix what it reports and check again. Stop when it says ok, or after 4 checks keep the
   closest draft.
4. Reply with the final plan: the same items and servings you last checked, plus a title
   and a one-sentence "why" per meal, a headline, and up to 3 tips.

Rules:
- Copy item names exactly from MENU. Never pick an item that breaks the student's dietary
  rules or contains anything on their avoid list.
- Build plates a student would actually take: a main, a side or two, maybe fruit or a
  drink. No piles of condiments, no 3 servings of dessert.
- Spread protein across meals. On a training day, put more carbs in the meal after the
  workout. You may add one Snack if a meal would otherwise need more than about 1,000 kcal.
- Tips must be specific to today (timing around the workout, hydration, recovery). No
  medical advice and no talk of weight or body shape. Plain, friendly words; no emojis.
- If the brief's training looks extreme, say so plainly in a tip and still plan sensibly."""


_TAG = {"breakfast": "breakfast", "lunch": "lunch", "dinner": "dinner", "dessert": "dessert", "lunch_dinner": "lunch+dinner"}


def build_menu(day_menu: dict) -> tuple[str, dict[str, dict]]:
    """The menu as prompt text (grouped by station) plus a name → item lookup.
    Condiment stations and component items are left out, as in combos."""
    lookup: dict[str, dict] = {}
    blocks: list[str] = []
    for station, raw_items in (day_menu.get("categories") or {}).items():
        kind = classify_station(station)
        if kind == "excluded":
            continue
        lines: list[str] = []
        for raw in raw_items:
            name = (raw.get("name") or "").strip()
            k = name_key(name)
            if not name or k in lookup or is_component_item(name):
                continue
            n = raw.get("nutrition") or {}
            item = {
                "name": name,
                "station": station,
                "serving": raw.get("serving_size") or "1 serving",
                "kcal": to_float(raw.get("calories") or n.get("calories")),
                "protein": to_float(n.get("protein_g")),
                "carbs": to_float(n.get("carbohydrates_g")),
                "fat": to_float(n.get("fat_g")),
                "allergens": [str(a) for a in (raw.get("allergens") or [])],
                "is_vegan": bool(raw.get("is_vegan")),
                "is_vegetarian": bool(raw.get("is_vegetarian")),
            }
            lookup[k] = item
            flags = []
            if item["is_vegan"]:
                flags.append("vegan")
            elif item["is_vegetarian"]:
                flags.append("vegetarian")
            if {a.lower() for a in item["allergens"]} & GLUTEN_ALLERGENS:
                flags.append("gluten")
            lines.append(
                f"{name} | {item['serving']} | {round(item['kcal'])} kcal | "
                f"P{item['protein']:g} C{item['carbs']:g} F{item['fat']:g}"
                + (f" | {', '.join(flags)}" if flags else "")
            )
            if len(lookup) >= _MAX_MENU_ITEMS:
                break
        if lines:
            blocks.append(f"## {station} [{_TAG[kind]}]\n" + "\n".join(lines))
        if len(lookup) >= _MAX_MENU_ITEMS:
            break
    legend = "Each line: name | serving | kcal | protein, carbs, fat in grams | flags (vegan, vegetarian, gluten = contains gluten)"
    return legend + "\n\n" + "\n\n".join(blocks), lookup


@dataclass
class DietRules:
    prefs: set[str] = field(default_factory=set)
    avoid: list[str] = field(default_factory=list)

    def violation(self, item: dict) -> str | None:
        if not passes_dietary(item, self.prefs):
            return ", ".join(sorted(self.prefs))
        text = " ".join([item["name"], *item.get("allergens", [])]).lower()
        for term in self.avoid:
            if term and term in text:
                return f"contains {term}"
        return None


def _servings(v: float) -> float:
    return min(max(round(v * 2) / 2, 0.5), 3.0)


@dataclass
class Targets:
    by_period: dict[str, tuple[int, int]]  # period → (kcal, protein g)
    kcal: int
    protein_g: int


class PlanChecker:
    """The agent's check_plan tool, and the server's final verification."""

    def __init__(self, lookup: dict[str, dict], rules: DietRules, targets: Targets):
        self.lookup = lookup
        self.rules = rules
        self.targets = targets
        self.last_draft: list[_DraftMeal] | None = None
        self.calls = 0
        self._names = [i["name"] for i in lookup.values()]

    def resolve(self, name: str) -> tuple[dict | None, str | None]:
        item = self.lookup.get(name_key(name))
        if item is None:
            close = difflib.get_close_matches(name, self._names, n=3, cutoff=0.6)
            hint = f" Did you mean: {'; '.join(close)}?" if close else ""
            return None, f"'{name}' is not on the menu.{hint}"
        reason = self.rules.violation(item)
        if reason:
            return None, f"'{item['name']}' breaks the student's rules ({reason})."
        return item, None

    def check(self, meals: list[_DraftMeal]) -> dict:
        self.calls += 1
        self.last_draft = meals
        issues: list[str] = []
        blocking = False
        out_meals = []
        day = {"kcal": 0.0, "protein_g": 0.0, "carbs_g": 0.0, "fat_g": 0.0}
        seen: set[str] = set()
        for meal in meals:
            if meal.period in seen:
                issues.append(f"{meal.period} appears twice; merge them.")
                blocking = True
            seen.add(meal.period)
            if meal.period != "Snack" and meal.period not in self.targets.by_period:
                issues.append(f"{meal.period} isn't needed today; drop it.")
                blocking = True
                continue
            if len(meal.items) > _MAX_MEAL_ITEMS:
                # Blocking: ground() keeps only the first 6, so the totals
                # checked here wouldn't match the plan the student sees.
                issues.append(f"{meal.period} has {len(meal.items)} items; keep it to {_MAX_MEAL_ITEMS} or fewer.")
                blocking = True
            m = {"kcal": 0.0, "protein_g": 0.0, "carbs_g": 0.0, "fat_g": 0.0}
            rows = []
            for pick in meal.items:
                item, problem = self.resolve(pick.name)
                if problem:
                    issues.append(problem)
                    blocking = True
                    continue
                s = _servings(pick.servings)
                row = {"name": item["name"], "servings": s, "kcal": round(item["kcal"] * s), "protein_g": round(item["protein"] * s, 1)}
                rows.append(row)
                m["kcal"] += item["kcal"] * s
                m["protein_g"] += item["protein"] * s
                m["carbs_g"] += item["carbs"] * s
                m["fat_g"] += item["fat"] * s
            for k in day:
                day[k] += m[k]
            tk, tp = self.targets.by_period.get(meal.period, (None, None))
            out_meals.append({
                "period": meal.period, "items": rows,
                "kcal": round(m["kcal"]), "protein_g": round(m["protein_g"]),
                "target_kcal": tk, "target_protein_g": tp,
            })
            if tk and abs(m["kcal"] - tk) > 0.35 * tk:
                issues.append(f"{meal.period} is {round(m['kcal'])} kcal vs about {tk}; rebalance if you can.")

        for p in self.targets.by_period:
            if p not in seen:
                issues.append(f"{p} is missing.")
                blocking = True

        tk, tp = self.targets.kcal, self.targets.protein_g
        if tk and abs(day["kcal"] - tk) > 0.10 * tk:
            gap = round(tk - day["kcal"])
            issues.append(
                f"Total is {round(day['kcal'])} kcal vs target {tk}: "
                + (f"add about {gap} kcal." if gap > 0 else f"cut about {-gap} kcal.")
            )
            blocking = True
        if tp and day["protein_g"] < 0.9 * tp:
            issues.append(f"Protein is {round(day['protein_g'])} g vs target {tp} g: add about {round(tp - day['protein_g'])} g.")
            blocking = True

        return {
            "ok": not blocking,
            "day": {
                "kcal": round(day["kcal"]), "target_kcal": tk,
                "protein_g": round(day["protein_g"]), "target_protein_g": tp,
                "carbs_g": round(day["carbs_g"]), "fat_g": round(day["fat_g"]),
            },
            "meals": out_meals,
            "issues": issues,
        }

    def ground(self, meals: list[_CoachMeal]) -> list[PlanMealOut]:
        """Keep only verifiable picks; compute every number from the menu."""
        out: list[PlanMealOut] = []
        seen: set[str] = set()
        for meal in meals:
            if meal.period in seen or (meal.period != "Snack" and meal.period not in self.targets.by_period):
                continue
            items: list[PlanItemOut] = []
            for pick in meal.items[:_MAX_MEAL_ITEMS]:
                item, problem = self.resolve(pick.name)
                if problem:
                    logger.info("coach_dropped_item", problem=problem)
                    continue
                s = _servings(pick.servings)
                items.append(PlanItemOut(
                    name=item["name"], station=item["station"], servings=s,
                    calories=round(item["kcal"] * s),
                    protein_g=round(item["protein"] * s, 1),
                    carbs_g=round(item["carbs"] * s, 1),
                    fat_g=round(item["fat"] * s, 1),
                ))
            if not items:
                continue
            seen.add(meal.period)
            tk, tp = self.targets.by_period.get(meal.period, (None, None))
            out.append(PlanMealOut(
                period=meal.period, title=meal.title.strip()[:60] or meal.period,
                why=meal.why.strip()[:240], items=items, totals=_sum(items),
                target_kcal=tk, target_protein_g=tp,
            ))
        out.sort(key=lambda m: _ORDER.get(m.period, 9))
        return out


def _sum(items: list[PlanItemOut]) -> Macros:
    return Macros(
        calories=round(sum(i.calories for i in items)),
        protein_g=round(sum(i.protein_g for i in items)),
        carbs_g=round(sum(i.carbs_g for i in items)),
        fat_g=round(sum(i.fat_g for i in items)),
    )


# ── Budget ────────────────────────────────────────────────────────────────

@dataclass
class Context:
    budget: BudgetOut
    eaten_periods: set[str]
    today_workouts: list[energy.Workout]
    prefs: set[str]
    avoid: list[str]
    strava_ok: bool


_DATE_DETAIL = "Fuel plans cover today and tomorrow only."


async def build_context(uid: str, day: str) -> Context:
    user = await users_collection.find_one(
        {"firebase_uid": uid},
        {"body": 1, "nutrition_goals": 1, "dietary_preferences": 1, "restrictions": 1, "meal_log": 1},
    )
    if not user:
        raise HTTPException(status_code=404, detail="Finish setting up your profile first.")

    link = await strava_client.get_link(uid)
    body = energy.resolve_body(user.get("body"), (link or {}).get("weight_kg"), (link or {}).get("sex"))

    activities: list[dict] | None = None
    error: str | None = None
    if link and strava_client.configured():
        try:
            activities = await strava_client.recent_activities(uid)
        except strava_client.StravaUnavailable as e:
            logger.warning("coach_strava_unavailable", error=str(e))
            error = "Couldn't reach Strava just now, so today's workouts aren't counted."
    connected = activities is not None or error is not None

    d = date_cls.fromisoformat(day)
    week_start = (d - timedelta(days=6)).isoformat()
    workouts = [energy.workout_from_strava(a, body.weight_kg) for a in activities or []]
    today = [w for w in workouts if w.date == day]
    week = [w for w in workouts if week_start <= w.date <= day]

    focus = (user.get("nutrition_goals") or {}).get("dietary_focus")
    b = energy.daily_budget(body, today, focus)

    eaten = Macros()
    eaten_periods: set[str] = set()
    for e in user.get("meal_log") or []:
        if e.get("date") != day:
            continue
        eaten.calories += round(to_float(e.get("calories")))
        eaten.protein_g += round(to_float(e.get("protein_g")))
        eaten.carbs_g += round(to_float(e.get("carbs_g")))
        eaten.fat_g += round(to_float(e.get("fat_g")))
        if e.get("meal_period") in PERIODS:
            eaten_periods.add(e["meal_period"])

    notes = list(b.notes)
    if body.estimated:
        notes.append("Rough estimate: add your height, weight and age in Profile for a real number.")
    if not connected:
        notes.append("No workouts counted, so this is a rest-day estimate.")

    budget = BudgetOut(
        date=day, bmr=b.bmr, baseline_kcal=b.baseline_kcal, exercise_kcal=b.exercise_kcal,
        goal_adjust_kcal=b.goal_adjust_kcal, target_kcal=b.target_kcal,
        protein_g=b.protein_g, carbs_g=b.carbs_g, fat_g=b.fat_g, fiber_g=b.fiber_g,
        training_load=b.training_load, focus=focus, eaten=eaten,
        remaining_kcal=max(0, b.target_kcal - eaten.calories),
        body=BodyOut(weight_kg=body.weight_kg, height_cm=body.height_cm, age=body.age, sex=body.sex, estimated=list(body.estimated)),
        training=TrainingOut(
            connected=connected,
            today=[WorkoutOut(**w.__dict__) for w in today],
            week_sessions=len(week),
            week_minutes=round(sum(w.minutes for w in week)),
            week_kcal=round(sum(w.kcal for w in week)),
            error=error,
        ),
        notes=notes,
    )
    prefs = {str(p).lower() for p in user.get("dietary_preferences") or []}
    avoid = [str(r).strip().lower() for r in user.get("restrictions") or [] if str(r).strip()]
    return Context(budget, eaten_periods, today, prefs, avoid, strava_ok=error is None)


def plan_targets(budget: BudgetOut, eaten_periods: set[str], day: str, now: datetime) -> tuple[Targets, list[str]]:
    """Split what's left of the day's budget over the meals still ahead.

    Meals already logged count at their logged values. Meals whose time has
    passed without a log are assumed eaten at their usual share, so a student
    who forgot to log lunch isn't told to eat 1,800 kcal at dinner.
    """
    is_today = day == now.date().isoformat()
    passed = {p for p in PERIODS if is_today and now.hour >= PERIOD_END_HOUR[p]}
    assumed = [p for p in PERIODS if p in passed and p not in eaten_periods]
    ahead = [p for p in PERIODS if p not in passed and p not in eaten_periods]

    t, tp = budget.target_kcal, budget.protein_g
    assumed_share = sum(PERIOD_SHARE[p] for p in assumed)
    kcal_left = t - budget.eaten.calories - assumed_share * t
    protein_left = tp - budget.eaten.protein_g - assumed_share * tp
    notes = [f"Counted a typical {p.lower()} (about {round(PERIOD_SHARE[p] * t)} kcal) since none was logged." for p in assumed]

    if not ahead or kcal_left < 150:
        return Targets({}, 0, 0), notes
    share = sum(PERIOD_SHARE[p] for p in ahead)
    by_period = {
        p: (round(kcal_left * PERIOD_SHARE[p] / share), round(max(protein_left, 0) * PERIOD_SHARE[p] / share))
        for p in ahead
    }
    return Targets(by_period, round(kcal_left), round(max(protein_left, 0))), notes


def render_brief(day: str, hall: str, ctx: Context, targets: Targets) -> str:
    b = ctx.budget
    weekday = date_cls.fromisoformat(day).strftime("%A")
    lines = [f"Plan for {weekday} {day} at {hall}.", "", "Meals to plan:"]
    for p, (k, pr) in targets.by_period.items():
        lines.append(f"- {p}: about {k} kcal, {pr} g protein")
    lines.append(f"Whole plan: about {targets.kcal} kcal and {targets.protein_g} g protein.")
    lines.append(f"Day targets: {b.target_kcal} kcal; carbs {b.carbs_g} g, fat {b.fat_g} g, fiber {b.fiber_g} g.")
    lines.append("")
    if ctx.today_workouts:
        lines.append(f"Training today ({b.training_load} load):")
        for w in ctx.today_workouts:
            dist = f", {w.distance_km:g} km" if w.distance_km else ""
            climb = f", {w.elevation_m:g} m climb" if w.elevation_m else ""
            lines.append(f"- {w.sport} at {w.start_time or '?'}: {round(w.minutes)} min{dist}{climb}, about {w.kcal} kcal")
    elif b.training.connected:
        lines.append("No workout logged today yet (rest day so far).")
    else:
        lines.append("Training unknown (Strava not connected); treat as a rest day.")
    if b.training.week_sessions:
        lines.append(f"Past 7 days: {b.training.week_sessions} sessions, {round(b.training.week_minutes / 60, 1)} h.")
    lines.append("")
    lines.append(f"Goal: {b.focus.replace('-', ' ') if b.focus else 'balanced eating'}.")
    lines.append(f"Dietary rules: {', '.join(sorted(ctx.prefs)) if ctx.prefs else 'none'}.")
    lines.append(f"Avoid: {', '.join(ctx.avoid) if ctx.avoid else 'nothing listed'}.")
    if ctx.eaten_periods:
        lines.append(f"Already logged today: {', '.join(sorted(ctx.eaten_periods, key=_ORDER.get))} ({b.eaten.calories} kcal, {b.eaten.protein_g} g protein).")
    return "\n".join(lines)


# ── Agent ─────────────────────────────────────────────────────────────────

@functools.cache
def _make_client() -> anthropic.AsyncAnthropic:
    """One client per process, so its connection pool is reused across requests."""
    return anthropic.AsyncAnthropic()


async def _run_agent(brief: str, menu_text: str, hall: str, checker: PlanChecker) -> _CoachOutput | None:
    client = _make_client()

    @beta_async_tool(
        name="check_plan",
        description=(
            "Total a draft plan from the menu's nutrition data and list what's off: calories or "
            "protein vs target, missing meals, items not on the menu or against the student's rules."
        ),
    )
    async def check_plan(meals: list[_DraftMeal]) -> str:
        return json.dumps(checker.check(meals))

    runner = client.beta.messages.tool_runner(
        model=COACH_MODEL,
        # Thinking counts against max_tokens; this leaves room for it plus the plan.
        max_tokens=12000,
        max_iterations=_MAX_TURNS,
        output_config={"effort": "medium"},
        betas=["server-side-fallback-2026-07-01"],
        fallbacks="default",
        system=[
            {"type": "text", "text": _SYSTEM},
            # Same for every student at this hall today, so cache it.
            {"type": "text", "text": f"MENU — {hall}\n{menu_text}", "cache_control": {"type": "ephemeral"}},
        ],
        messages=[{"role": "user", "content": brief}],
        tools=[check_plan],
        output_format=_CoachOutput,
    )
    try:
        final = await runner.until_done()
    except ValidationError as e:
        logger.warning("coach_unparseable_output", errors=e.error_count())
        return None
    except anthropic.RateLimitError:
        raise HTTPException(status_code=503, detail="The fuel coach is busy. Try again in a minute.")
    except anthropic.APIStatusError as e:
        logger.error("coach_api_error", status=e.status_code, error=e.message)
        raise HTTPException(status_code=502, detail="The fuel coach is unavailable right now.")
    except anthropic.APIConnectionError:
        raise HTTPException(status_code=503, detail="The fuel coach is unavailable right now.")
    if final.stop_reason == "refusal":
        return None
    return final.parsed_output


def _fallback_output(draft: list[_DraftMeal]) -> _CoachOutput:
    """The model ran out of turns mid-revision: use its last checked draft."""
    return _CoachOutput(
        headline="Here's a plan close to your target.",
        meals=[_CoachMeal(period=m.period, items=m.items, title=m.period, why="") for m in draft],
        tips=[],
    )


def _cache_key(uid: str, dining: str, day: str, ctx: Context, targets: Targets) -> str:
    raw = json.dumps([
        PROMPT_VERSION, COACH_MODEL, uid, dining, day,
        sorted(targets.by_period.items()), targets.kcal, targets.protein_g,
        ctx.budget.training_load, ctx.budget.focus, sorted(ctx.prefs), sorted(ctx.avoid),
        [(w.sport, w.start_time, w.kcal) for w in ctx.today_workouts],
    ], default=str)
    return "coach:" + hashlib.sha256(raw.encode()).hexdigest()


# ── Routes ────────────────────────────────────────────────────────────────

@router.get("/body", response_model=BodyStats)
async def get_body(current_user: dict = Depends(get_current_user)) -> BodyStats:
    user = await users_collection.find_one({"firebase_uid": current_user["uid"]}, {"body": 1})
    if not user:
        raise HTTPException(status_code=404, detail="Finish setting up your profile first.")
    return BodyStats(**(user.get("body") or {}))


@router.put("/body", response_model=BodyStats)
async def put_body(body: BodyStats, current_user: dict = Depends(get_current_user)) -> BodyStats:
    result = await users_collection.update_one(
        {"firebase_uid": current_user["uid"]}, {"$set": {"body": body.model_dump()}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Finish setting up your profile first.")
    return body


@router.get("/budget", response_model=BudgetOut)
async def get_budget(date: str | None = None, current_user: dict = Depends(get_current_user)) -> BudgetOut:
    day = check_date(date, earliest=-1, latest=1, detail=_DATE_DETAIL)
    return (await build_context(current_user["uid"], day)).budget


@router.post("/plan", response_model=PlanOut)
async def make_plan(req: PlanRequest, current_user: dict = Depends(get_current_user)) -> PlanOut:
    uid = current_user["uid"]
    if req.dining not in DINING_FILES:
        raise HTTPException(status_code=400, detail=f"Invalid dining location. Must be one of: {', '.join(DINING_FILES)}")
    ensure_open(req.dining)
    day = check_date(req.date, earliest=0, latest=1, detail=_DATE_DETAIL)

    ctx = await build_context(uid, day)
    targets, assumptions = plan_targets(ctx.budget, ctx.eaten_periods, day, _now_mt())

    try:
        menu_data = await asyncio.to_thread(load_menu, req.dining)
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to load menu data")
    hall = menu_data["dining_location"]

    def empty(headline: str) -> PlanOut:
        return PlanOut(
            date=day, dining_location=hall, budget=ctx.budget, meals=[], totals=Macros(),
            planned_kcal=0, planned_protein_g=0, headline=headline, tips=[], assumptions=assumptions,
        )

    if not targets.by_period:
        return empty("You've covered today's meals. Check back tomorrow for a new plan.")

    day_menu = next((m for m in menu_data["menus"] if m["date"] == day), None)
    if not day_menu or not day_menu.get("categories"):
        raise HTTPException(status_code=404, detail=f"No menu for {hall} on {day}.")
    menu_text, lookup = build_menu(day_menu)
    checker = PlanChecker(lookup, DietRules(ctx.prefs, ctx.avoid), targets)

    key = _cache_key(uid, req.dining, day, ctx, targets)
    cached = await coach_plans_collection.find_one({"key": key})
    if cached:
        return PlanOut(**{**cached["response"], "budget": ctx.budget})

    _limiter.check(uid)
    _quota.take(uid)
    output = await _run_agent(render_brief(day, hall, ctx, targets), menu_text, hall, checker)
    if output is None and checker.last_draft:
        output = _fallback_output(checker.last_draft)
    if output is None:
        raise HTTPException(status_code=502, detail="Couldn't build a plan right now. Try again in a minute.")

    meals = checker.ground(output.meals)
    if not meals:
        raise HTTPException(status_code=502, detail="Couldn't build a plan from this hall's menu. Try another hall.")

    plan = PlanOut(
        date=day, dining_location=hall, budget=ctx.budget, meals=meals,
        totals=_sum([i for m in meals for i in m.items]),
        planned_kcal=targets.kcal, planned_protein_g=targets.protein_g,
        headline=output.headline.strip()[:160],
        tips=[t.strip()[:200] for t in output.tips if t.strip()][:3],
        assumptions=assumptions,
    )
    # Don't keep a plan built while Strava was unreachable; the next try should count the workout.
    if ctx.strava_ok:
        await coach_plans_collection.update_one(
            {"key": key},
            {"$set": {
                "key": key, "firebase_uid": uid, "response": plan.model_dump(mode="json"),
                "expires_at": datetime.now(timezone.utc) + _PLAN_TTL,
            }},
            upsert=True,
        )
    return plan
