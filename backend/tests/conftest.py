"""Test setup shared by all backend tests.

auth.py initializes the Firebase Admin SDK at import time and needs real
credentials. Tests don't have them, so swap in a stub module before any router
imports it; individual tests override get_current_user per app.
"""
import sys
import types

if "auth" not in sys.modules:
    stub = types.ModuleType("auth")

    def get_current_user() -> dict:  # replaced via app.dependency_overrides in tests
        raise RuntimeError("auth not configured in tests")

    def get_optional_user() -> dict | None:  # a guest unless a test overrides it
        return None

    def delete_firebase_user(uid: str) -> None:  # tests patch this where it's used
        raise RuntimeError("auth not configured in tests")

    stub.get_current_user = get_current_user
    stub.get_optional_user = get_optional_user
    stub.delete_firebase_user = delete_firebase_user
    sys.modules["auth"] = stub
