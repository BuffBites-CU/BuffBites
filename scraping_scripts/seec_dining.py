#!/usr/bin/env python3
# Link: https://colorado-diningmenus.nutrislice.com/menu/seec/seec-student-order-ahead

from halls import HALLS
from nutrislice import scrape

if __name__ == "__main__":
    scrape(HALLS["seec"])
