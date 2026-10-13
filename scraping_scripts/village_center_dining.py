#!/usr/bin/env python3
# Link: https://colorado-diningmenus.nutrislice.com/menu/village-center-dining/vc-meal-of-the-day
# Scrapes every Village Center station menu (see halls.py) and merges them by date.

from halls import HALLS
from nutrislice import scrape

if __name__ == "__main__":
    scrape(HALLS["village_center"])
