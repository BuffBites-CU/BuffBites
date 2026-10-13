"""Register, inspect or remove BuffBites' Strava webhook subscription.

Strava allows one push subscription per API application. Once it exists,
Strava POSTs to /api/strava/webhook whenever a connected student records,
edits or deletes an activity, or revokes BuffBites' access.

Run where the Strava secrets are set, e.g. on the Fly machine:

    flyctl ssh console -a buffbites-backend -C "python scripts/strava_webhook.py create"
    flyctl ssh console -a buffbites-backend -C "python scripts/strava_webhook.py view"
    flyctl ssh console -a buffbites-backend -C "python scripts/strava_webhook.py delete"

Needs STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET and STRAVA_WEBHOOK_VERIFY_TOKEN.
The callback defaults to STRAVA_WEBHOOK_CALLBACK_URL, or the Fly app URL.
"""

import argparse
import os
import sys

import httpx

PUSH_URL = "https://www.strava.com/api/v3/push_subscriptions"


def _env(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        sys.exit(f"{name} is not set")
    return value


def _default_callback() -> str:
    explicit = os.getenv("STRAVA_WEBHOOK_CALLBACK_URL", "").strip()
    if explicit:
        return explicit
    app = os.getenv("FLY_APP_NAME", "buffbites-backend")
    return f"https://{app}.fly.dev/api/strava/webhook"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("action", choices=["create", "view", "delete"])
    parser.add_argument("--callback", default=None, help="public URL of /api/strava/webhook")
    args = parser.parse_args()

    auth = {"client_id": _env("STRAVA_CLIENT_ID"), "client_secret": _env("STRAVA_CLIENT_SECRET")}
    with httpx.Client(timeout=30) as http:
        if args.action == "create":
            # Strava calls the callback (GET) to validate it before answering this request.
            r = http.post(PUSH_URL, data={
                **auth,
                "callback_url": args.callback or _default_callback(),
                "verify_token": _env("STRAVA_WEBHOOK_VERIFY_TOKEN"),
            })
        elif args.action == "view":
            r = http.get(PUSH_URL, params=auth)
        else:
            current = http.get(PUSH_URL, params=auth)
            current.raise_for_status()
            subs = current.json()
            if not subs:
                print("No subscription to delete.")
                return
            r = http.delete(f"{PUSH_URL}/{subs[0]['id']}", params=auth)

    print(r.status_code, r.text or "(empty)")
    if r.status_code >= 400:
        sys.exit(1)


if __name__ == "__main__":
    main()
