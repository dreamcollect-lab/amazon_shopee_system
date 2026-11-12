import unittest
from sg_variant_check import family_key, check_sg_variant, load_sg_catalog
from pathlib import Path

class SgVariantTests(unittest.TestCase):
    def test_real_sg_snapshot_against_deleted_pen_variants(self):
        catalog = Path(__file__).resolve().parents[1] / "input" / "shopee_sg_titles.csv"
        index = load_sg_catalog(catalog)
        self.assertGreaterEqual(sum(len(v) for v in index.values()), 20)
        deleted_examples = [
            "Kaweco Piston Sport Classic Black Gold Fountain Pen Fine",
            "Platinum Curidas Urban Green Fountain Pen Extra Fine",
            "Platinum Curidas Urban Green Fountain Pen Fine",
            "Platinum Curidas Grand Red Fountain Pen Fine",
            "Kaweco Classic Sport Black Fountain Pen Fine",
        ]
        for title in deleted_examples:
            with self.subTest(title=title):
                self.assertIsNotNone(check_sg_variant(title, "B000000001", index))

    def test_pen_nib_and_color_variants(self):
        index = {
            "platinum curidas|fountain pen": [
                {"asin": "B084448TFW", "product_id": "55721414951",
                 "title": "Platinum Fountain Pen Curidas Grand Red Medium PKN-7000"}
            ],
            "kaweco classic sport|fountain pen": [
                {"asin": "B00IZOVTM6", "product_id": "55221419920",
                 "title": "Kaweco Classic Sport Green Fountain Pen Fine Nib"}
            ]
        }
        self.assertIsNotNone(check_sg_variant("Platinum Curidas Urban Green Fountain Pen EF", "B000000001", index))
        self.assertIsNotNone(check_sg_variant("Platinum Curidas Grand Red Fountain Pen F", "B000000001", index))
        self.assertIsNotNone(check_sg_variant("Kaweco Classic Sport Navy Fountain Pen Medium", "B000000001", index))
        self.assertIsNone(check_sg_variant("Kaweco Classic Sport Navy Mechanical Pencil", "B000000001", index))
        self.assertIsNone(check_sg_variant("Platinum Procyon Blue Fountain Pen", "B000000001", index))
        self.assertIsNone(check_sg_variant("Platinum Curidas Grand Red Fountain Pen Medium", "B084448TFW", index))
        self.assertIsNone(check_sg_variant("Laptop 14 inch Core i7 16GB", "B000000001", index))

if __name__ == "__main__":
    unittest.main()
