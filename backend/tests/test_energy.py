import pytest

import energy
from energy import Body, daily_budget, resolve_body, workout_from_strava, workout_kcal

MAN = Body(weight_kg=70, height_cm=175, age=20, sex="male")
WOMAN = Body(weight_kg=60, height_cm=165, age=20, sex="female")


def test_mifflin_st_jeor():
    # 10*70 + 6.25*175 - 5*20 + 5 = 1698.75
    assert energy.bmr(MAN) == pytest.approx(1698.75)
    # 10*60 + 6.25*165 - 5*20 - 161 = 1370.25
    assert energy.bmr(WOMAN) == pytest.approx(1370.25)


def test_resolve_body_prefers_own_stats_then_strava_then_defaults():
    b = resolve_body({"weight_kg": 64, "height_cm": 170, "age": 22, "sex": "female"}, 80, "male")
    assert (b.weight_kg, b.sex, b.estimated) == (64, "female", ())
    b = resolve_body(None, 80, "male")
    assert b.weight_kg == 80 and b.sex == "male"
    assert set(b.estimated) == {"height", "age"}
    b = resolve_body({}, None, None)
    assert b.sex == "unspecified" and set(b.estimated) == {"sex", "weight", "height", "age"}


def test_run_uses_acsm_pace_equation():
    # 10 km in 60 min on the flat = 166.7 m/min -> MET (0.2*166.7+3.5)/3.5 = 10.52
    kcal, method = workout_kcal("Run", 3600, 10_000, 0, None, 70)
    assert method == "pace"
    assert kcal == round((10.524 - 1) * 70)


def test_climb_adds_calories():
    flat, _ = workout_kcal("Run", 3600, 10_000, 0, None, 70)
    hilly, _ = workout_kcal("Run", 3600, 10_000, 300, None, 70)
    assert hilly > flat


def test_ride_prefers_power_meter_work():
    kcal, method = workout_kcal("Ride", 7200, 60_000, 500, 1800, 70)
    assert method == "power"
    assert kcal == 1800 - 140  # kJ minus resting kcal for 2 h


def test_ride_without_power_uses_speed_met():
    kcal, method = workout_kcal("Ride", 3600, 20_000, 0, None, 70)  # 20 km/h -> MET 8
    assert method == "met" and kcal == round(7 * 70)


def test_unknown_sport_uses_default_met_and_zero_time_is_zero():
    assert workout_kcal("Kitesurf", 3600, 0, 0, None, 70) == (round(4 * 70), "met")
    assert workout_kcal("Run", 0, 5000, 0, None, 70) == (0, "met")


def test_workout_from_strava_reads_local_date_and_falls_back_to_elapsed():
    w = workout_from_strava({
        "name": "Morning Run", "sport_type": "Run", "start_date_local": "2026-10-12T07:10:00Z",
        "moving_time": 0, "elapsed_time": 1800, "distance": 5000, "total_elevation_gain": 20,
    }, 70)
    assert (w.date, w.start_time, w.minutes, w.distance_km) == ("2026-10-12", "07:10", 30.0, 5.0)
    assert w.kcal > 0


def test_rest_day_budget():
    b = daily_budget(MAN, [], None)
    assert b.training_load == "rest" and b.exercise_kcal == 0
    assert b.target_kcal == round(1698.75 * 1.4 / 10) * 10
    assert b.protein_g == round(1.4 * 70)
    # Macros add up to the target within rounding.
    assert abs(4 * b.protein_g + 4 * b.carbs_g + 9 * b.fat_g - b.target_kcal) < 15


def test_training_day_adds_workout_and_more_carbs():
    run = workout_from_strava({"sport_type": "Run", "start_date_local": "2026-10-12T07:00:00Z",
                               "moving_time": 3600, "distance": 10_000}, 70)
    rest = daily_budget(MAN, [], None)
    train = daily_budget(MAN, [run], None)
    assert train.exercise_kcal == run.kcal
    assert train.target_kcal - rest.target_kcal == pytest.approx(run.kcal, abs=10)
    assert train.training_load == "moderate"
    assert train.carbs_g > rest.carbs_g and train.protein_g > rest.protein_g


def test_weight_loss_deficit_is_capped_and_floored():
    # Rest day: a 15% deficit would dip under 1.2x BMR, so the floor wins.
    b = daily_budget(MAN, [], "weight-loss")
    assert b.target_kcal == round(1698.75 * 1.2 / 10) * 10
    assert b.protein_g == 140  # 2.0 g/kg in a deficit
    # Big training day: the deficit is capped at 500 kcal.
    ride = energy.Workout("x", "Ride", "d", "07:00", 180, 80, 900, 2000, "power")
    b = daily_budget(MAN, [ride], "weight-loss")
    assert b.goal_adjust_kcal == -500
    assert b.target_kcal == round((1698.75 * 1.4 + 2000 - 500) / 10) * 10


def test_fat_stays_within_20_to_35_percent():
    for focus in (None, "endurance", "muscle-gain", "weight-loss"):
        for minutes in (0, 30, 70, 150, 240):
            w = [energy.Workout("x", "Run", "d", "07:00", minutes, 0, 0, round(minutes * 10), "met")] if minutes else []
            b = daily_budget(WOMAN, w, focus)
            share = 9 * b.fat_g / b.target_kcal
            assert 0.19 <= share <= 0.36, (focus, minutes, share)


def test_low_carb_caps_carbs_and_warns_on_big_days():
    long_ride = energy.Workout("x", "Ride", "d", "07:00", 200, 80, 900, 2000, "power")
    b = daily_budget(MAN, [long_ride], "low-carb")
    assert b.carbs_g <= round(2.5 * 70)
    assert any("Low-carb" in n for n in b.notes)
