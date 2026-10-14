"""Daily calorie and macro targets from body stats and Strava workouts.

Everything here is plain arithmetic, so the fuel coach never has to guess a
number:

- Resting burn (BMR): Mifflin-St Jeor (Mifflin et al., Am J Clin Nutr 1990),
  the equation the Academy of Nutrition and Dietetics recommends for healthy
  adults.
- Everyday movement: BMR x 1.4, a "lightly active" level that covers walking
  around campus. Logged workouts are added on top.
- Workouts, best source first:
    1. Power meter work (Strava `kilojoules`). Riders convert food to work at
       roughly 20-25% efficiency, so kJ of work is close to kcal burned.
    2. ACSM metabolic equations for runs and walks, from pace and climb.
    3. A MET for the sport from the 2024 Compendium of Physical Activities.
  Calories are net of resting burn, (MET - 1) x kg x hours, so the time spent
  training isn't counted twice.
- Macros: ACSM / Academy / Dietitians of Canada joint position stand on
  nutrition and athletic performance (2016). Carbs scale with training time;
  protein 1.4-2.0 g/kg, the top of that range during a calorie deficit (ISSN
  protein position stand, 2017); fat 20-35% of calories.
"""

from __future__ import annotations

from dataclasses import dataclass, field

SEXES = ("male", "female", "unspecified")

# Placeholders for anyone who hasn't entered their stats yet. They keep the
# card useful on day one; the UI says the number is rough until stats are in.
_DEFAULT_SIZE = {"male": (75.0, 177.0), "female": (62.0, 163.0), "unspecified": (68.0, 170.0)}
DEFAULT_AGE = 20

EVERYDAY_FACTOR = 1.4

_RUN = {"Run", "TrailRun", "VirtualRun"}
_WALK = {"Walk", "Hike"}
_RIDE = {"Ride", "GravelRide", "VirtualRide", "Velomobile", "Handcycle"}

# Gross METs by Strava sport type (2024 Compendium, rounded).
_MET = {
    "MountainBikeRide": 8.5, "EMountainBikeRide": 5.5, "EBikeRide": 4.0,
    "Swim": 7.0, "WeightTraining": 5.0, "Workout": 6.0, "Crossfit": 7.5,
    "HighIntensityIntervalTraining": 8.0, "Yoga": 2.5, "Pilates": 3.0,
    "RockClimbing": 6.0, "AlpineSki": 5.3, "Snowboard": 5.3, "BackcountrySki": 9.0,
    "NordicSki": 9.0, "Snowshoe": 6.0, "Rowing": 7.0, "VirtualRow": 7.0,
    "Elliptical": 5.0, "StairStepper": 9.0, "Soccer": 7.0, "Tennis": 7.3,
    "Basketball": 6.5, "Volleyball": 4.0, "Pickleball": 5.0, "Badminton": 5.5,
    "Squash": 7.3, "Racquetball": 7.0, "TableTennis": 4.0, "Golf": 3.5,
    "Kayaking": 5.0, "Canoeing": 4.0, "StandUpPaddling": 6.0, "Surfing": 3.0,
    "Skateboard": 5.0, "InlineSkate": 7.5, "IceSkate": 7.0, "Dance": 5.0,
    "Wheelchair": 5.0,
}
_DEFAULT_MET = 5.0


@dataclass(frozen=True)
class Body:
    weight_kg: float
    height_cm: float
    age: int
    sex: str
    estimated: tuple[str, ...] = ()  # fields filled from placeholders


def resolve_body(stored: dict | None, strava_weight_kg: float | None = None, strava_sex: str | None = None) -> Body:
    """The student's own stats win; Strava's profile fills gaps; placeholders last."""
    stored = stored or {}
    estimated: list[str] = []
    sex = stored.get("sex") or strava_sex
    if sex not in SEXES:
        sex = "unspecified"
        estimated.append("sex")
    default_w, default_h = _DEFAULT_SIZE[sex]
    weight = stored.get("weight_kg") or strava_weight_kg
    if not weight:
        weight = default_w
        estimated.append("weight")
    height = stored.get("height_cm")
    if not height:
        height = default_h
        estimated.append("height")
    age = stored.get("age")
    if not age:
        age = DEFAULT_AGE
        estimated.append("age")
    return Body(float(weight), float(height), int(age), sex, tuple(estimated))


def bmr(body: Body) -> float:
    base = 10 * body.weight_kg + 6.25 * body.height_cm - 5 * body.age
    return base + {"male": 5, "female": -161}.get(body.sex, -78)


# ── Workouts ───────────────────────────────────────────────────────────────

@dataclass(frozen=True)
class Workout:
    name: str
    sport: str
    date: str          # local date, YYYY-MM-DD
    start_time: str    # local HH:MM
    minutes: float
    distance_km: float
    elevation_m: float
    kcal: int
    method: str        # "power" | "pace" | "met"
    id: str | None = None       # set for workouts a student logged by hand
    source: str = "strava"      # "strava" | "manual"


def _ride_met(kmh: float) -> float:
    if kmh < 16:
        return 4.0
    if kmh < 19:
        return 6.8
    if kmh < 22:
        return 8.0
    if kmh < 25.5:
        return 10.0
    return 12.0


def workout_kcal(
    sport: str,
    moving_s: float,
    distance_m: float,
    elevation_m: float,
    kilojoules: float | None,
    weight_kg: float,
) -> tuple[int, str]:
    """Net kcal for one workout and which method produced it."""
    hours = max(moving_s, 0) / 3600
    if hours <= 0:
        return 0, "met"
    resting = weight_kg * hours  # 1 MET ~ 1 kcal per kg per hour

    if kilojoules and kilojoules > 0:
        return max(0, round(kilojoules - resting)), "power"

    met: float | None = None
    method = "met"
    m_per_min = distance_m / (moving_s / 60) if distance_m > 0 else 0.0
    grade = min(max(elevation_m, 0) / distance_m, 0.25) if distance_m > 0 else 0.0
    if sport in _RUN and 134 <= m_per_min <= 400:
        met = (0.2 * m_per_min + 0.9 * m_per_min * min(grade, 0.15) + 3.5) / 3.5
        method = "pace"
    elif (sport in _RUN or sport in _WALK) and 40 <= m_per_min < 134:
        met = (0.1 * m_per_min + 1.8 * m_per_min * grade + 3.5) / 3.5
        method = "pace"
    elif sport in _RIDE and m_per_min > 0:
        met = _ride_met(m_per_min * 60 / 1000)
    if met is None:
        met = _MET.get(sport, _DEFAULT_MET)
    return max(0, round((met - 1) * weight_kg * hours)), method


def workout_from_strava(raw: dict, weight_kg: float) -> Workout:
    sport = raw.get("sport_type") or raw.get("type") or "Workout"
    moving = float(raw.get("moving_time") or 0)
    # Strava sometimes reports moving_time 0 for manual entries.
    if moving <= 0:
        moving = float(raw.get("elapsed_time") or 0)
    moving = min(moving, 12 * 3600)
    distance = float(raw.get("distance") or 0)
    elevation = float(raw.get("total_elevation_gain") or 0)
    kcal, method = workout_kcal(sport, moving, distance, elevation, raw.get("kilojoules"), weight_kg)
    local = str(raw.get("start_date_local") or "")
    return Workout(
        name=str(raw.get("name") or sport)[:80],
        sport=sport,
        date=local[:10],
        start_time=local[11:16],
        minutes=round(moving / 60, 1),
        distance_km=round(distance / 1000, 2),
        elevation_m=round(elevation),
        kcal=min(kcal, 6000),
        method=method,
    )


# ── Daily budget ───────────────────────────────────────────────────────────

@dataclass
class Budget:
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
    notes: list[str] = field(default_factory=list)


def training_load(minutes: float) -> str:
    if minutes <= 0:
        return "rest"
    if minutes < 45:
        return "light"
    if minutes < 90:
        return "moderate"
    if minutes < 180:
        return "high"
    return "very high"


# g/kg/day of carbs by load (ACSM 2016: light 3-5, moderate 5-7, high 6-10, very high 8-12).
_CARBS_PER_KG = {"rest": 3.0, "light": 4.0, "moderate": 6.0, "high": 8.0, "very high": 10.0}


def daily_budget(body: Body, today: list[Workout], focus: str | None = None) -> Budget:
    resting = bmr(body)
    baseline = resting * EVERYDAY_FACTOR
    exercise = sum(w.kcal for w in today)
    tdee = baseline + exercise
    notes: list[str] = []

    adjust = 0.0
    if focus == "weight-loss":
        adjust = -min(500.0, 0.15 * tdee)
    elif focus == "muscle-gain":
        adjust = min(300.0, 0.10 * tdee)

    # Never plan below 1.2x resting burn; on a rest day this trims the deficit a little.
    floor = resting * 1.2
    target = tdee + adjust
    if target < floor:
        if floor - target > 50:
            notes.append("Kept above 1.2x your resting burn; eating less than that isn't recommended.")
        target = floor
        adjust = target - tdee
    target = round(target / 10) * 10

    load = training_load(sum(w.minutes for w in today))
    kg = body.weight_kg

    protein_per_kg = 1.4 if load == "rest" else 1.6
    if focus in ("high-protein", "muscle-gain"):
        protein_per_kg = 1.8
    elif focus == "weight-loss":
        protein_per_kg = 2.0
    protein = protein_per_kg * kg

    carbs_per_kg = _CARBS_PER_KG[load]
    if focus == "low-carb":
        carbs_per_kg = min(carbs_per_kg, 2.5)
        if load in ("high", "very high"):
            notes.append("Low-carb on a big training day can hurt recovery; consider more carbs after the workout.")
    carbs = carbs_per_kg * kg

    # Fat fills the rest, kept within 20-35% of calories. Low-carb diets are
    # allowed more fat, since that's the point of them.
    fat_kcal = target - 4 * protein - 4 * carbs
    min_fat, max_fat = 0.20 * target, (0.45 if focus == "low-carb" else 0.35) * target
    if fat_kcal < min_fat:
        carbs = max(0.0, (target - 4 * protein - min_fat) / 4)
        fat_kcal = target - 4 * protein - 4 * carbs
    elif fat_kcal > max_fat and focus != "low-carb":
        carbs += (fat_kcal - max_fat) / 4
        fat_kcal = max_fat
    fat = max(fat_kcal, min_fat) / 9

    return Budget(
        bmr=round(resting),
        baseline_kcal=round(baseline),
        exercise_kcal=round(exercise),
        goal_adjust_kcal=round(adjust),
        target_kcal=int(target),
        protein_g=round(protein),
        carbs_g=round(carbs),
        fat_g=round(fat),
        fiber_g=round(14 * target / 1000),
        training_load=load,
        notes=notes,
    )


# ── Workouts logged by hand ────────────────────────────────────────────────

# What a student can pick when logging without Strava: Strava sport names the
# calorie code already knows.
MANUAL_SPORTS = {
    "Run": "Run", "Walk": "Walk", "Hike": "Hike", "Ride": "Bike ride", "Swim": "Swim",
    "WeightTraining": "Weights", "HighIntensityIntervalTraining": "HIIT", "Workout": "Other workout",
    "Yoga": "Yoga", "Elliptical": "Elliptical", "Rowing": "Rowing", "RockClimbing": "Climbing",
    "Soccer": "Soccer", "Basketball": "Basketball", "Tennis": "Tennis", "Pickleball": "Pickleball",
    "Dance": "Dance",
}
# How hard it felt scales sport METs; pace-based runs, walks and rides already
# reflect effort through speed.
EFFORT = {"light": 0.8, "moderate": 1.0, "hard": 1.25}


def manual_workout(doc: dict, weight_kg: float) -> Workout:
    """A Workout from a student's own entry (see routers/workouts.py)."""
    sport = doc["sport"]
    minutes = min(float(doc["minutes"]), 12 * 60)
    km = float(doc.get("distance_km") or 0)
    kcal, method = workout_kcal(sport, minutes * 60, km * 1000, 0, None, weight_kg)
    if method == "met" and not (sport in _RIDE and km > 0):
        kcal = round(kcal * EFFORT.get(doc.get("effort", "moderate"), 1.0))
    return Workout(
        name=MANUAL_SPORTS.get(sport, sport),
        sport=sport,
        date=doc["date"],
        start_time=doc.get("start_time") or "",
        minutes=round(minutes, 1),
        distance_km=round(km, 2),
        elevation_m=0,
        kcal=min(kcal, 6000),
        method=method,
        id=str(doc["_id"]),
        source="manual",
    )
