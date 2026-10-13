#!/usr/bin/env python3
# Scrapes every C4C station menu (see halls.py) and merges them by date.
# Stations: Italian, Latin, Persia, Kosher, Black Coats, Dessert Station, Asia,
#           Smoke n' Grill, Wholesome Field

from halls import HALLS
from nutrislice import scrape

if __name__ == "__main__":
    scrape(HALLS["c4c"])
