"""Tests for classify_station and is_component_item in menu_rules.py."""
import pytest

from menu_rules import classify_station, is_component_item


class TestClassifyStation:
    # ── Breakfast ──────────────────────────────────────────────────────────

    def test_breakfast_keyword(self):
        assert classify_station("Breakfast Bar") == "breakfast"

    def test_omelet_station(self):
        assert classify_station("Omelet Bar") == "breakfast"

    def test_scramble_station(self):
        assert classify_station("Scramble Station") == "breakfast"

    def test_egg_station(self):
        assert classify_station("Egg Station") == "breakfast"

    def test_waffle_station(self):
        assert classify_station("Waffle Station") == "breakfast"

    def test_pancake_station(self):
        assert classify_station("Pancake Corner") == "breakfast"

    def test_cereal_station(self):
        assert classify_station("Cereal Bar") == "breakfast"

    def test_hot_cereal_station(self):
        assert classify_station("Hot Cereal") == "breakfast"

    def test_granola_station(self):
        assert classify_station("Granola & Yogurt") == "breakfast"

    def test_case_insensitive_breakfast(self):
        assert classify_station("BREAKFAST ITEMS") == "breakfast"

    # ── Lunch ─────────────────────────────────────────────────────────────

    def test_lunch_keyword(self):
        assert classify_station("Lunch Specials") == "lunch"

    def test_case_insensitive_lunch(self):
        assert classify_station("LUNCH SPECIAL") == "lunch"

    # ── Dinner ────────────────────────────────────────────────────────────

    def test_dinner_keyword(self):
        assert classify_station("Dinner Entrees") == "dinner"

    def test_case_insensitive_dinner(self):
        assert classify_station("DINNER SPECIALS") == "dinner"

    # ── Dessert ───────────────────────────────────────────────────────────

    def test_dessert_keyword(self):
        assert classify_station("Dessert Station") == "dessert"

    def test_ice_cream_station(self):
        assert classify_station("Ice Cream Bar") == "dessert"

    def test_soft_serve_station(self):
        assert classify_station("Soft Serve") == "dessert"

    # ── Excluded via keyword ───────────────────────────────────────────────

    def test_condiment_station_excluded(self):
        assert classify_station("Condiment Bar") == "excluded"

    def test_dressing_station_excluded(self):
        assert classify_station("Salad Dressing Station") == "excluded"

    def test_sauce_station_excluded(self):
        assert classify_station("Sauce Bar") == "excluded"

    def test_beverage_station_excluded(self):
        assert classify_station("Beverage Station") == "excluded"

    def test_milk_station_excluded(self):
        assert classify_station("Milk & Dairy") == "excluded"

    def test_butter_station_excluded(self):
        assert classify_station("Butter and Spreads") == "excluded"

    def test_coffee_station_excluded(self):
        assert classify_station("Coffee Corner") == "excluded"

    # ── Excluded via component ─────────────────────────────────────────────

    def test_sides_component_excluded(self):
        assert classify_station("Grill - Sides") == "excluded"

    def test_bread_component_excluded(self):
        assert classify_station("Bakery - Bread") == "excluded"

    def test_protein_component_excluded(self):
        assert classify_station("Station - Protein") == "excluded"

    def test_proteins_component_excluded(self):
        assert classify_station("Station - Proteins") == "excluded"

    def test_deli_bar_cheeses_excluded(self):
        assert classify_station("Deli Bar Cheeses") == "excluded"

    def test_deli_bar_meats_excluded(self):
        assert classify_station("Deli Bar Meats") == "excluded"

    def test_deli_bar_breads_excluded(self):
        assert classify_station("Deli Bar Breads") == "excluded"

    def test_tortillas_component_excluded(self):
        assert classify_station("Mexican Bar - Tortillas") == "excluded"

    # ── Fallthrough to lunch_dinner ────────────────────────────────────────

    def test_generic_station_is_lunch_dinner(self):
        assert classify_station("Global Kitchen") == "lunch_dinner"

    def test_grill_station_is_lunch_dinner(self):
        assert classify_station("Grill") == "lunch_dinner"

    def test_salad_bar_is_lunch_dinner(self):
        assert classify_station("Salad Bar") == "lunch_dinner"

    # ── Priority: excluded beats breakfast ────────────────────────────────

    def test_condiment_beats_breakfast(self):
        # "breakfast syrup" contains both breakfast and syrup keywords
        assert classify_station("Breakfast Syrup Station") == "excluded"

    # ── Priority: dessert beats breakfast ─────────────────────────────────

    def test_dessert_beats_breakfast(self):
        # "Breakfast Dessert" — dessert is checked before breakfast
        assert classify_station("Breakfast Dessert Corner") == "dessert"


class TestIsComponentItem:
    # ── Suffix-based exclusions ────────────────────────────────────────────

    def test_item_ending_in_sauce(self):
        assert is_component_item("Teriyaki Sauce") is True

    def test_item_ending_in_dressing(self):
        assert is_component_item("Ranch Dressing") is True

    def test_item_ending_in_oil(self):
        assert is_component_item("Olive Oil") is True

    def test_item_ending_in_vinegar(self):
        assert is_component_item("Balsamic Vinegar") is True

    def test_item_ending_in_butter(self):
        assert is_component_item("Peanut Butter") is True

    def test_item_ending_in_syrup(self):
        assert is_component_item("Maple Syrup") is True

    def test_item_ending_in_mayo(self):
        assert is_component_item("Chipotle Mayo") is True

    def test_item_ending_in_mustard(self):
        assert is_component_item("Dijon Mustard") is True

    def test_item_ending_in_ketchup(self):
        assert is_component_item("Tomato Ketchup") is True

    def test_item_ending_in_spread(self):
        assert is_component_item("Cream Cheese Spread") is True

    # ── Word-based exclusions ──────────────────────────────────────────────

    def test_diced_item_excluded(self):
        assert is_component_item("Diced Onion") is True

    def test_sliced_item_excluded(self):
        assert is_component_item("Sliced Tomato") is True

    def test_shredded_item_excluded(self):
        assert is_component_item("Shredded Cheese") is True

    def test_chopped_item_excluded(self):
        assert is_component_item("Chopped Jalapeños") is True

    def test_minced_item_excluded(self):
        assert is_component_item("Minced Garlic") is True

    def test_mixed_case_diced(self):
        assert is_component_item("Medium Diced Yellow Onion") is True

    # ── Real menu items that should pass through ───────────────────────────

    def test_real_entree_not_excluded(self):
        assert is_component_item("Grilled Chicken Breast") is False

    def test_soup_not_excluded(self):
        assert is_component_item("Tomato Bisque") is False

    def test_rice_not_excluded(self):
        assert is_component_item("Brown Rice") is False

    def test_salmon_not_excluded(self):
        assert is_component_item("Grilled Salmon") is False

    def test_pasta_not_excluded(self):
        assert is_component_item("Penne Pasta") is False

    def test_empty_string_not_excluded(self):
        assert is_component_item("") is False

    # ── Suffix must be at end (not a substring) ────────────────────────────

    def test_sauce_in_middle_not_excluded(self):
        # "Saucepan Chicken" doesn't end with " sauce"
        assert is_component_item("Saucepan Chicken") is False

    def test_oil_in_middle_not_excluded(self):
        assert is_component_item("Broiled Tofu") is False
