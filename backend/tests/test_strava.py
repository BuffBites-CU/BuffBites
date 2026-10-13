import time
from urllib.parse import parse_qs, urlparse

import httpx
import pytest
from cryptography.fernet import Fernet
from fastapi import FastAPI
from fastapi.testclient import TestClient

import strava_client
from routers import strava
from tests.fakes import FakeCollection

KEY = Fernet.generate_key().decode()


class StravaStub:
    """Records calls and answers like Strava's OAuth and API endpoints."""

    def __init__(self):
        self.calls: list[tuple[str, str, dict]] = []
        self.token_status = 200
        self.activities_status = 200
        self.activities = [{"name": "Run", "sport_type": "Run", "start_date_local": "2026-10-12T07:00:00Z",
                            "moving_time": 1800, "distance": 5000, "map": {"summary_polyline": "secret"}}]

    def handler(self, request: httpx.Request) -> httpx.Response:
        form = dict(parse_qs(request.content.decode())) if request.method == "POST" else {}
        form = {k: v[0] for k, v in form.items()}
        self.calls.append((request.method, request.url.path, form))
        if request.url.path == "/oauth/token":
            if self.token_status != 200:
                return httpx.Response(self.token_status, json={"message": "Bad Request"})
            return httpx.Response(200, json={
                "access_token": "acc-" + form.get("grant_type", ""), "refresh_token": "ref-2",
                "expires_at": int(time.time()) + 21600,
                "athlete": {"id": 42, "firstname": "Ralphie", "sex": "F"},
            })
        if request.url.path == "/oauth/deauthorize":
            return httpx.Response(200, json={})
        if request.url.path == "/api/v3/athlete":
            return httpx.Response(200, json={"id": 42, "firstname": "Ralphie", "sex": "F", "weight": 61.5})
        if request.url.path == "/api/v3/athlete/activities":
            return httpx.Response(self.activities_status, json=self.activities if self.activities_status == 200 else {})
        return httpx.Response(404)


@pytest.fixture
def stub(monkeypatch):
    s = StravaStub()
    monkeypatch.setattr(strava_client, "STRAVA_CLIENT_ID", "123")
    monkeypatch.setattr(strava_client, "STRAVA_CLIENT_SECRET", "shh")
    monkeypatch.setattr(strava_client, "STRAVA_REDIRECT_URI", "http://localhost:3000/strava/callback")
    monkeypatch.setattr(strava_client, "STRAVA_TOKEN_KEY", KEY)
    monkeypatch.setattr(strava_client, "strava_links_collection", FakeCollection())
    monkeypatch.setattr(strava_client, "coach_plans_collection", FakeCollection([{"key": "k", "firebase_uid": "u1"}]))
    monkeypatch.setattr(strava_client, "_http", lambda: httpx.AsyncClient(transport=httpx.MockTransport(s.handler)))
    strava_client._activity_cache.clear()
    strava._limiter._hits.clear()
    return s


def _client(uid: str = "u1") -> TestClient:
    app = FastAPI()
    app.include_router(strava.router)
    app.dependency_overrides[strava.get_current_user] = lambda: {"uid": uid}
    return TestClient(app)


def _connect(c: TestClient, scope: str = "read,activity:read_all,profile:read_all"):
    url = c.post("/api/strava/connect", json={"consent": True}).json()["url"]
    state = parse_qs(urlparse(url).query)["state"][0]
    return c.post("/api/strava/complete", json={"code": "abc", "state": state, "scope": scope})


def test_status_when_not_configured(monkeypatch):
    monkeypatch.setattr(strava_client, "STRAVA_TOKEN_KEY", "")
    monkeypatch.setattr(strava_client, "strava_links_collection", FakeCollection())
    r = _client().get("/api/strava/status")
    assert r.json() == {"available": False, "connected": False, "athlete_name": None, "connected_at": None, "scopes": []}
    assert _client().post("/api/strava/connect", json={"consent": True}).status_code == 503


def test_connect_requires_consent(stub):
    assert _client().post("/api/strava/connect", json={"consent": False}).status_code == 400
    assert stub.calls == []


def test_connect_url_carries_scope_redirect_and_signed_state(stub):
    url = _client().post("/api/strava/connect", json={"consent": True}).json()["url"]
    q = parse_qs(urlparse(url).query)
    assert url.startswith(strava_client.AUTHORIZE_URL)
    assert q["client_id"] == ["123"] and q["redirect_uri"] == ["http://localhost:3000/strava/callback"]
    assert "activity:read_all" in q["scope"][0]
    assert strava_client.read_state(q["state"][0])["uid"] == "u1"
    assert stub.calls == []  # nothing is sent to Strava until the student approves there


def test_complete_stores_encrypted_tokens_and_profile(stub):
    r = _connect(_client())
    assert r.status_code == 200, r.text
    assert r.json()["connected"] is True and r.json()["athlete_name"] == "Ralphie"
    doc = stub_doc = strava_client.strava_links_collection.docs[0]
    assert "acc-authorization_code" not in str(doc["access_token"])
    assert Fernet(KEY).decrypt(doc["access_token"].encode()) == b"acc-authorization_code"
    assert (doc["weight_kg"], doc["sex"]) == (61.5, "female")
    assert doc["consent"]["version"] == strava_client.CONSENT_VERSION
    # Cached plans built before the link are dropped.
    assert strava_client.coach_plans_collection.docs == []
    assert stub_doc["firebase_uid"] == "u1"


def test_complete_rejects_state_from_another_account(stub):
    url = _client("attacker").post("/api/strava/connect", json={"consent": True}).json()["url"]
    state = parse_qs(urlparse(url).query)["state"][0]
    r = _client("victim").post("/api/strava/complete", json={"code": "abc", "state": state, "scope": "activity:read_all"})
    assert r.status_code == 403
    assert stub.calls == [] and strava_client.strava_links_collection.docs == []


def test_complete_rejects_tampered_or_expired_state(stub, monkeypatch):
    c = _client()
    assert c.post("/api/strava/complete", json={"code": "abc", "state": "nope", "scope": "activity:read"}).status_code == 400
    old = Fernet(KEY).encrypt_at_time(b'{"uid": "u1"}', int(time.time()) - 3600).decode()
    assert c.post("/api/strava/complete", json={"code": "abc", "state": old, "scope": "activity:read"}).status_code == 400


def test_complete_without_activity_scope_revokes_and_stores_nothing(stub):
    r = _connect(_client(), scope="read")
    assert r.status_code == 400
    assert ("POST", "/oauth/deauthorize", {"access_token": "acc-authorization_code"}) in stub.calls
    assert strava_client.strava_links_collection.docs == []


def test_rejected_code_is_a_400(stub):
    stub.token_status = 400
    assert _connect(_client()).status_code == 400


def test_recent_activities_trims_fields_and_caches(stub):
    import asyncio
    _connect(_client())
    acts = asyncio.run(strava_client.recent_activities("u1"))
    assert acts[0]["sport_type"] == "Run" and "map" not in acts[0]
    n = len(stub.calls)
    asyncio.run(strava_client.recent_activities("u1"))
    assert len(stub.calls) == n  # served from the 5-minute cache


def test_expired_token_is_refreshed(stub):
    import asyncio
    _connect(_client())
    strava_client.strava_links_collection.docs[0]["expires_at"] = int(time.time()) - 10
    token = asyncio.run(strava_client.get_access_token("u1"))
    assert token == "acc-refresh_token"
    assert ("POST", "/oauth/token") == stub.calls[-1][:2] and stub.calls[-1][2]["grant_type"] == "refresh_token"
    assert Fernet(KEY).decrypt(strava_client.strava_links_collection.docs[0]["refresh_token"].encode()) == b"ref-2"


def test_revoked_at_strava_drops_the_link(stub):
    import asyncio
    _connect(_client())
    stub.activities_status = 401
    assert asyncio.run(strava_client.recent_activities("u1")) is None
    assert strava_client.strava_links_collection.docs == []


def test_strava_outage_raises_unavailable(stub):
    import asyncio
    _connect(_client())
    stub.activities_status = 503
    with pytest.raises(strava_client.StravaUnavailable):
        asyncio.run(strava_client.recent_activities("u1"))
    assert len(strava_client.strava_links_collection.docs) == 1  # an outage isn't a disconnect


def test_disconnect_revokes_and_deletes_everything(stub):
    c = _client()
    _connect(c)
    strava_client.coach_plans_collection.docs.append({"key": "p", "firebase_uid": "u1"})
    strava_client.coach_plans_collection.docs.append({"key": "q", "firebase_uid": "someone-else"})
    r = c.delete("/api/strava")
    assert r.json()["connected"] is False
    assert stub.calls[-1][:2] == ("POST", "/oauth/deauthorize")
    assert strava_client.strava_links_collection.docs == []
    assert [d["key"] for d in strava_client.coach_plans_collection.docs] == ["q"]
    assert c.get("/api/strava/status").json()["connected"] is False
