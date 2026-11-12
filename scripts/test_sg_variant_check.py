import unittest
from sg_variant_check import family_key, check_sg_variant

class SgVariantTests(unittest.TestCase):
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
