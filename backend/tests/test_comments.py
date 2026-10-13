from datetime import timedelta

import pytest
from bson import ObjectId

from tests.test_community import NOW, combo, make_env, sign_in


@pytest.fixture
def env(monkeypatch):
    return make_env(monkeypatch)


def comments_url(combo_id) -> str:
    return f"/api/community/combos/{combo_id}/comments"


def test_comment_on_missing_combo_is_404(env):
    r = sign_in(env, "bob-uid").post(comments_url(ObjectId()), json={"text": "nice"})
    assert r.status_code == 404
    assert env.comments.docs == []


def test_comment_on_malformed_combo_id_is_404(env):
    r = sign_in(env, "bob-uid").post(comments_url("not-an-id"), json={"text": "nice"})
    assert r.status_code == 404
    assert env.comments.docs == []


def test_comment_uses_profile_username_and_expires_with_its_combo(env):
    doc = combo(created_at=NOW - timedelta(days=2), expires_at=NOW - timedelta(days=1))
    env.combos.docs.append(doc)

    # An expired combo is still on the weekly trends, so it still takes comments.
    r = sign_in(env, "bob-uid").post(comments_url(doc["_id"]), json={"text": "  looks great  "})
    assert r.status_code == 200
    body = r.json()
    assert (body["author_username"], body["text"], body["combo_id"]) == ("bob", "looks great", str(doc["_id"]))

    stored = env.comments.docs[0]
    assert stored["expires_at"] == doc["created_at"] + timedelta(days=7)


def test_comment_without_profile_is_anonymous_not_the_token_name(env):
    doc = combo()
    env.combos.docs.append(doc)
    r = sign_in(env, "new-uid").post(comments_url(doc["_id"]), json={"text": "hi"})
    assert r.status_code == 200
    assert r.json()["author_username"] == "anonymous"


def test_comment_text_rules_still_apply(env):
    doc = combo()
    env.combos.docs.append(doc)
    client = sign_in(env, "bob-uid")
    assert client.post(comments_url(doc["_id"]), json={"text": "   "}).status_code == 400
    assert client.post(comments_url(doc["_id"]), json={"text": "x" * 501}).status_code == 400
    assert env.comments.docs == []


def test_get_comments_returns_newest_100_oldest_first(env):
    doc = combo()
    env.combos.docs.append(doc)
    env.comments.docs += [
        {"_id": ObjectId(), "combo_id": str(doc["_id"]), "text": str(i), "created_at": NOW + timedelta(seconds=i)}
        for i in range(105)
    ]
    texts = [c["text"] for c in env.client.get(comments_url(doc["_id"])).json()]
    assert texts == [str(i) for i in range(5, 105)]


def test_delete_comment(env):
    doc = combo()
    env.combos.docs.append(doc)
    comment_id = sign_in(env, "bob-uid").post(comments_url(doc["_id"]), json={"text": "hi"}).json()["id"]

    assert sign_in(env, "alice-uid").delete(f"/api/community/comments/{comment_id}").status_code == 403
    assert sign_in(env, "bob-uid").delete("/api/community/comments/not-an-id").status_code == 404
    assert sign_in(env, "bob-uid").delete(f"/api/community/comments/{comment_id}").status_code == 200
    assert env.comments.docs == []
