import unittest
from pathlib import Path
from sg_variant_check import SgTitleIndex, load_sg_catalog

class SgSimilarityTests(unittest.TestCase):
    def test_pen_color_nib(self):
        index = SgTitleIndex()
        index.add("B000000001", "Platinum Curidas Urban Green Fountain Pen Fine", "100")
        self.assertIsNotNone(index.match("Platinum Curidas Grand Red Fountain Pen Extra Fine", "B000000002"))
        self.assertIsNone(index.match("Platinum Curidas Urban Green Mechanical Pencil", "B000000002"))

    def test_same_brand_is_not_enough(self):
        index = SgTitleIndex()
        index.add("B000000001", "ASUS ROG STRIX B650 Gaming Motherboard", "100")
        self.assertIsNone(index.match("ASUS ROG STRIX B760 Gaming Motherboard", "B000000002"))
        self.assertIsNone(index.match("ASUS Zenbook 14 Laptop", "B000000002"))

    def test_variants_across_categories(self):
        index = SgTitleIndex()
        index.add("B000000001", "Logitech MX Master 3S Wireless Mouse Black", "100")
        self.assertIsNotNone(index.match("Logitech MX Master 3S Wireless Mouse White", "B000000002"))
        self.assertIsNone(index.match("Logitech MX Anywhere 3S Wireless Mouse", "B000000002"))
        index.add("B000000003", "Sony WH 1000XM5 Wireless Headphones Black", "101")
        self.assertIsNotNone(index.match("Sony WH 1000XM5 Wireless Headphones Silver", "B000000004"))
        self.assertIsNone(index.match("Sony WH 1000XM4 Wireless Headphones", "B000000004"))

    def test_eighty_percent_threshold(self):
        index = SgTitleIndex()
        index.add("B000000001", "Acme Aurora Travel Bottle Stainless Steel Black", "100")
        self.assertIsNotNone(index.match(
            "Acme Aurora Travel Bottle Stainless White", "B000000002"))
        self.assertIsNone(index.match(
            "Acme Aurora Travel Mug Ceramic White", "B000000003"))

    def test_exact_asin_is_not_similarity(self):
        index = SgTitleIndex()
        index.add("B000000001", "Logitech MX Master 3S Wireless Mouse Black", "100")
        self.assertIsNone(index.match("Logitech MX Master 3S Wireless Mouse White", "B000000001"))

    def test_actual_sg_snapshot(self):
        path = Path(__file__).resolve().parents[1] / "input" / "shopee_sg_titles.csv"
        index = load_sg_catalog(path)
        self.assertGreater(len(index), 1000)
        for title in [
            "Kaweco Piston Sport Classic Black Gold Fountain Pen Fine",
            "Platinum Curidas Urban Green Fountain Pen Extra Fine",
            "Platinum Curidas Urban Green Fountain Pen Fine",
            "Platinum Curidas Grand Red Fountain Pen Fine",
            "Kaweco Classic Sport Black Fountain Pen Fine",
        ]:
            with self.subTest(title=title):
                self.assertIsNotNone(index.match(title, "B000000001"))

if __name__ == "__main__":
    unittest.main()
