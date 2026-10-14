#!/usr/bin/env python3
# Link: https://colorado-diningmenus.nutrislice.com/menu/libby/libby-opening-august-16th

from halls import HALLS
from nutrislice import scrape

if __name__ == "__main__":
    scrape(HALLS["libby"])
