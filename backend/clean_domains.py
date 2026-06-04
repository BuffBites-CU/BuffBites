from google.oauth2 import service_account
from google.auth.transport.requests import AuthorizedSession

creds = service_account.Credentials.from_service_account_file(
    "serviceAccountKey.json",
    scopes=["https://www.googleapis.com/auth/cloud-platform"]
)
session = AuthorizedSession(creds)
project = "buffbites-d3109"
base = f"https://identitytoolkit.googleapis.com/admin/v2/projects/{project}/config"

current = session.get(base).json()
domains = [d for d in current.get("authorizedDomains", []) if d != "null.com"]

r = session.patch(
    f"{base}?updateMask=authorizedDomains",
    json={"authorizedDomains": domains}
)
print("Clean domains:", r.json().get("authorizedDomains"))
