"""Shared rules for student chat: what can be said, and what students can pick.

Chats are for meeting up at a dining hall, so contact details (links, emails,
phone numbers, social handles) are kept out of public rooms and new tables.
Students swap those in person. Everything else is handled by reports, which
hide a message once enough students flag it, and by per-student blocks.
"""

from __future__ import annotations

import re
import unicodedata

MAX_MESSAGE = 280
MAX_INTERESTS = 5

# Interests American college students tend to bond over, tuned for CU Boulder.
INTERESTS: dict[str, str] = {
    "study": "Study buddies",
    "fitness": "Gym & lifting",
    "running": "Running",
    "outdoors": "Hiking & skiing",
    "sports": "Buffs sports",
    "gaming": "Gaming",
    "music": "Music & concerts",
    "film": "Movies & shows",
    "anime": "Anime & manga",
    "foodie": "Foodies",
    "plantbased": "Plant-based",
    "cs": "Engineering & CS",
    "premed": "Pre-med & health",
    "business": "Business & startups",
    "art": "Art & design",
    "international": "International students",
    "firstyear": "First-years",
    "chill": "Chill & de-stress",
}

_URL = re.compile(r"(https?://|www\.|\b[a-z0-9-]+\.(com|net|org|io|me|gg|app|ly|co)\b)", re.I)
_EMAIL = re.compile(r"\b[\w.+-]+@[\w-]+\.[\w.-]+\b")
_PHONE = re.compile(r"(?:\+?\d[\s().-]*){7,}")
_HANDLE = re.compile(r"(?:^|\s)@[a-z0-9_.]{2,}|\b(?:snap|insta|ig|discord|whatsapp|telegram)\s*[:@]", re.I)

CONTACT_DETAIL = "Keep links, phone numbers and handles out of chat. Swap them in person."


def clean_text(text: str) -> str:
    """Drop control and invisible characters and collapse whitespace."""
    kept = "".join(ch for ch in text if unicodedata.category(ch)[0] != "C" or ch in "\n")
    return " ".join(kept.split())


def has_contact_details(text: str) -> bool:
    return bool(_URL.search(text) or _EMAIL.search(text) or _PHONE.search(text) or _HANDLE.search(text))


def valid_interests(values: list[str]) -> list[str]:
    """Known interests only, de-duplicated, in the order given, at most MAX_INTERESTS."""
    seen: list[str] = []
    for v in values:
        if v in INTERESTS and v not in seen:
            seen.append(v)
    return seen[:MAX_INTERESTS]
