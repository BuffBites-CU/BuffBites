"""The dining halls we scrape, one entry per hall.

Keys and file names match backend/menu_store.DINING_FILES, and `closed` matches
menu_store.CLOSED_HALLS. Each <key>_dining.py scrapes its entry with
nutrislice.scrape(); validate_menus.py and build_live_menus.py read this table.
"""

from dataclasses import dataclass

MENU_SITE = "https://colorado-diningmenus.nutrislice.com/menu"


@dataclass(frozen=True)
class Hall:
    name: str    # "dining_location" in the JSON
    school: str  # Nutrislice school slug
    # (menu-type slug, station prefix), merged by date.
    # prefix=None  → station-header names used as-is
    # prefix="Foo" → stations become "Foo - <header>" to avoid name collisions across menus
    menus: tuple[tuple[str, str | None], ...]
    url: str     # public menu page
    file: str    # output file in data/
    # Closed for a long stretch: an empty scrape is expected, and validate_menus
    # reports the hall without failing.
    closed: bool = False
    # Also write "stations_scraped" (the menu slugs) into the JSON.
    list_menus: bool = False


HALLS: dict[str, Hall] = {
    "alley": Hall(
        name="The Alley at Farrand",
        school="the-alley",
        menus=(("the-alley-at-farrand-s-all-day-id2009", None),),
        url=f"{MENU_SITE}/the-alley/the-alley-at-farrand-s-all-day-id2009",
        file="alley_dining_menus.json",
        # Closed for remodel; CU Dining expects it to reopen Aug 2028.
        closed=True,
    ),
    "c4c": Hall(
        name="Center for Community (C4C)",
        school="center-for-community",
        menus=(
            ("italian",             "Italian"),
            ("latin",               "Latin"),
            ("persian",             "Persia"),
            ("c4c-kosher",          "Kosher"),
            ("c4c-black-coats",     "Black Coats"),
            ("c4c-dessert-station", "Dessert Station"),
            ("c4c-asia-all-day",    "Asia"),
            ("smokin-grill",        "Smoke n' Grill"),
            ("c4c_wholesome-field", "Wholesome Field"),
        ),
        url=f"{MENU_SITE}/center-for-community",
        file="c4c_dining_menus.json",
        list_menus=True,
    ),
    "libby": Hall(
        name="Libby Dining",
        school="libby",
        menus=(("libby-opening-august-16th", None),),
        url=f"{MENU_SITE}/libby/libby-opening-august-16th",
        file="libby_dining_menus.json",
    ),
    "seec": Hall(
        name="SEEC Cafe",
        school="seec",
        menus=(("seec-student-order-ahead", None),),
        url=f"{MENU_SITE}/seec/seec-student-order-ahead",
        file="seec_dining_menus.json",
    ),
    "sewall": Hall(
        name="Sewall Dining Center",
        school="sewall-dining-center",
        menus=(("executive-chefs-place", None),),
        url=f"{MENU_SITE}/sewall-dining-center/executive-chefs-place",
        file="sewall_dining_menus.json",
    ),
    "village_center": Hall(
        name="Village Center Dining",
        school="village-center-dining",
        # One menu per station. They reuse headers like "Featured Entree", which
        # merge into one station.
        menus=(
            ("vc_toast",             None),
            ("vc_curryroad",         None),
            ("vc_middleterranean",   None),
            ("vc_vc-salad-deli-bar", None),
            ("hearth",               None),
            ("vc_peaks",             None),
            ("vc_grange",            None),
        ),
        url=f"{MENU_SITE}/village-center-dining/vc-meal-of-the-day",
        file="village_center_dining_menus.json",
    ),
}
