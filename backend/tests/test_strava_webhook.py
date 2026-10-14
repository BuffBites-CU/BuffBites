import asyncio

import httpx
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

import strava_client
from routers import strava_webhook
from tests.fakes import FakeCollection


class _Log(list):
    """Calls made to strava_client, plus the fake Strava's authorization state."""
    state: dict


@pytest.fixture
def calls(monkeypatch):
    log = _Log()
    links = {42: "u1"}
    state = {"authorized": False}

    async def uids_for_athlete(athlete_id):
        return [links[athlete_id]] if athlete_id in links else []

    async def still_authorized(uid):
        log.append(("check", uid))
        return state["authorized"]

    async def forget(uid):
        log.append(("forget", uid))

    def invalidate(uid):
        log.append(("invalidate", uid))

    for name, fn in [("uids_for_athlete", uids_for_athlete), ("still_authorized", still_authorized),
                     ("forget", forget), ("invalidate", invalidate)]:
        monkeypatch.setattr(strava_client, name, fn)
    monkeypatch.setattr(strava_webhook, "STRAVA_WEBHOOK_VERIFY_TOKEN", "s3cret")
    strava_webhook._limiter._hits.clear()
    strava_webhook._last_revoke_check.clear()
    log.state = state
    return log


URL = "/api/strava/webhook/s3cret"


def _client() -> TestClient:
    app = FastAPI()
    app.include_router(strava_webhook.router)
    return TestClient(app)


def _event(**kw):
    return {"object_type": "activity", "object_id": 1, "aspect_type": "create", "owner_id": 42,
            "subscription_id": 7, "event_time": 0, "updates": {}, **kw}


def test_subscription_validation_echoes_challenge(calls):
    r = _client().get(URL, params={"hub.mode": "subscribe", "hub.challenge": "abc", "hub.verify_token": "s3cret"})
    assert r.status_code == 200 and r.json() == {"hub.challenge": "abc"}


@pytest.mark.parametrize("token", ["wrong", ""])
def test_subscription_validation_rejects_bad_token(calls, token):
    r = _client().get(URL, params={"hub.mode": "subscribe", "hub.challenge": "abc", "hub.verify_token": token})
    assert r.status_code == 403


def test_validation_refused_when_no_token_configured(calls, monkeypatch):
    monkeypatch.setattr(strava_webhook, "STRAVA_WEBHOOK_VERIFY_TOKEN", "")
    r = _client().get(URL, params={"hub.mode": "subscribe", "hub.challenge": "abc", "hub.verify_token": ""})
    assert r.status_code == 404  # with no secret configured the webhook doesn't exist


def test_activity_event_invalidates_that_students_cache(calls):
    assert _client().post(URL, json=_event()).status_code == 200
    assert calls == [("invalidate", "u1")]


def test_events_for_unknown_athletes_are_ignored(calls):
    _client().post(URL, json=_event(owner_id=999))
    assert calls == []


def test_revoke_is_confirmed_with_strava_before_deleting(calls):
    calls.state["authorized"] = True  # a spoofed event: the token still works
    _client().post(URL, json=_event(object_type="athlete", aspect_type="update", updates={"authorized": "false"}))
    assert calls == [("check", "u1")]

    calls.clear()
    strava_webhook._last_revoke_check.clear()  # next check window
    calls.state["authorized"] = False  # a real revoke
    _client().post(URL, json=_event(object_type="athlete", aspect_type="update", updates={"authorized": "false"}))
    assert calls == [("check", "u1"), ("forget", "u1")]


def test_events_without_the_secret_path_are_rejected(calls):
    for url in ("/api/strava/webhook/wrong", "/api/strava/webhook/"):
        assert _client().post(url, json=_event()).status_code == 404
    assert calls == []


def test_spoofed_revokes_check_strava_at_most_once_per_window(calls):
    calls.state["authorized"] = True
    revoke = _event(object_type="athlete", aspect_type="update", updates={"authorized": "false"})
    for _ in range(5):
        _client().post(URL, json=revoke)
    assert calls == [("check", "u1")]


def test_malformed_event_is_422(calls):
    assert _client().post(URL, json={"object_type": "activity"}).status_code == 422


# ── strava_client's webhook helpers against fake storage and a fake Strava ──

class _Cursor:
    def __init__(self, docs):
        self.docs = docs

    async def to_list(self, n):
        return self.docs[:n]


class _Links(FakeCollection):
    def find(self, flt, projection=None):
        return _Cursor([d for d in self.docs if all(d.get(k) == v for k, v in flt.items())])


@pytest.fixture
def stored(monkeypatch):
    from cryptography.fernet import Fernet
    key = Fernet.generate_key().decode()
    monkeypatch.setattr(strava_client, "STRAVA_TOKEN_KEY", key)
    links = _Links([{"firebase_uid": "u1", "athlete_id": 42, "access_token": strava_client.seal("a"),
                     "refresh_token": strava_client.seal("r"), "expires_at": 0}])
    plans = FakeCollection([{"key": "p", "firebase_uid": "u1"}, {"key": "q", "firebase_uid": "u2"}])
    monkeypatch.setattr(strava_client, "strava_links_collection", links)
    monkeypatch.setattr(strava_client, "coach_plans_collection", plans)
    return links, plans


def test_uids_for_athlete_and_invalidate(stored):
    links, plans = stored
    strava_client._activity_cache["u1"] = (0.0, [])
    assert asyncio.run(strava_client.uids_for_athlete(42)) == ["u1"]
    assert asyncio.run(strava_client.uids_for_athlete(7)) == []
    strava_client.invalidate("u1")
    assert "u1" not in strava_client._activity_cache
    # Plans stay: their cache key changes when the day's workouts do.
    assert [d["key"] for d in plans.docs] == ["p", "q"]


@pytest.mark.parametrize("status,expected", [(200, True), (400, False), (503, True)])
def test_still_authorized_asks_strava(stored, monkeypatch, status, expected):
    def handler(request):
        if status == 200:
            return httpx.Response(200, json={"access_token": "a2", "refresh_token": "r2", "expires_at": 9999999999})
        return httpx.Response(status, json={})
    monkeypatch.setattr(strava_client, "_http", lambda: httpx.AsyncClient(transport=httpx.MockTransport(handler)))
    assert asyncio.run(strava_client.still_authorized("u1")) is expected
    if status == 200:  # the refreshed tokens are kept
        assert strava_client._open(stored[0].docs[0]["refresh_token"]) == "r2"


def test_request_logs_never_contain_the_webhook_secret():
    import main
    assert main._loggable_path("/api/strava/webhook/s3cret") == "/api/strava/webhook/<redacted>"
    assert main._loggable_path("/api/users/u1") == "/api/users/u1"
