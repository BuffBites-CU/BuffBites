#!/usr/bin/env python3
# Link: https://colorado-diningmenus.nutrislice.com/menu/sewall-dining-center/executive-chefs-place

from halls import HALLS
from nutrislice import scrape

if __name__ == "__main__":
    scrape(HALLS["sewall"])
