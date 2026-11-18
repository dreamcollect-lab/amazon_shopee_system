import importlib.util
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import pandas as pd
from sg_variant_check import SgTitleIndex

spec = importlib.util.spec_from_file_location("step1", Path(__file__).parent / "step1.py")
step1 = importlib.util.module_from_spec(spec)
spec.loader.exec_module(step1)


class Step1DuplicateSafetyTests(unittest.TestCase):
    def test_all_candidate_asins_and_case_insensitive_urls(self):
        row = {"asin": "B000000001", "all_asins": "B000000001,B000000002"}
        self.assertEqual(step1.judge_duplicate(row, {"B000000002"})[0], "OUT_DUPLICATE")
        self.assertEqual(step1.extract_asin("https://amazon.co.jp/dp/b000000002"), "B000000002")
        self.assertEqual(step1.judge_duplicate(row, {"B000000009"})[0], "SAFE")

    def test_every_current_sg_asin_is_rejected(self):
        master = Path(__file__).resolve().parents[1] / "input" / "shopee_sg_existing_asin.csv"
        values = pd.read_csv(master, dtype=str)["asin"].str.upper().tolist()
        self.assertGreater(len(values), 4000)
        existing = set(values)
        for asin in values:
            self.assertEqual(step1.judge_duplicate({"asin": asin}, existing)[0], "OUT_DUPLICATE")

    def test_cross_csv_and_missing_asin_fail_closed(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            dirs = {}
            for key in ("STANDARD_DIR", "SAFE_DIR", "OUT_NG_DIR", "OUT_DENY_DIR",
                        "OUT_DUPLICATE_DIR", "OUT_PRICE_DIR", "CHECK_DIR", "REVIEW_SOURCE_DIR"):
                path = root / key
                path.mkdir()
                dirs[key] = path
            # 2 different source files of the same category; the second also contains a missing ASIN.
            a = root / "pens_20261118.csv"
            b = root / "pens_20261119.csv"
            pd.DataFrame([
                {"title": "Logitech MX Master 3S Wireless Mouse Black",
                 "url": "https://amazon.co.jp/dp/B000000003"},
                {"title": "Previously listed", "url": "https://amazon.co.jp/dp/B000000001"},
                {"title": "Two URLs", "url": "https://amazon.co.jp/dp/B000000004",
                 "extra": "https://amazon.co.jp/dp/B000000002"},
            ]).to_csv(a, index=False)
            pd.DataFrame([
                {"title": "Logitech MX Master 3S Wireless Mouse White",
                 "url": "https://amazon.co.jp/dp/B000000005"},
                {"title": "Another title same ASIN", "url": "https://amazon.co.jp/dp/B000000003"},
                {"title": "Unknown identity", "url": ""},
                {"title": "Ambiguous", "url": "https://amazon.co.jp/dp/B000000006",
                 "extra": "https://amazon.co.jp/dp/B000000007"},
            ]).to_csv(b, index=False)
            index = SgTitleIndex()
            seen = set()
            with patch.multiple(step1, **dirs), \
                 patch.object(step1, "judge_ng", return_value=("SAFE", "", "", "")), \
                 patch.object(step1, "judge_category", return_value=("SAFE", "", "", "")), \
                 patch.object(step1, "judge_price", return_value=("SAFE", "", "", "")):
                for source in (a, b):
                    step1.process_one_amazon_csv(
                        source, {}, {"B000000001", "B000000002"}, pd.DataFrame(),
                        "test", [], SgTitleIndex(), index, seen
                    )
            safe_a = pd.read_csv(next(dirs["SAFE_DIR"].glob("*20261118*")), dtype=str)
            safe_b = pd.read_csv(next(dirs["SAFE_DIR"].glob("*20261119*")), dtype=str)
            self.assertEqual(safe_a["asin"].tolist(), ["B000000003"])
            self.assertTrue(safe_b.empty)
            check_b = pd.read_csv(next(dirs["CHECK_DIR"].glob("*20261119*")), dtype=str)
            self.assertIn("batch_title_similarity_risk", check_b["hit_type"].tolist())
            self.assertIn("batch_duplicate_asin", check_b["hit_type"].tolist())
            self.assertIn("asin_missing", check_b["hit_type"].tolist())
            self.assertIn("multiple_asins", check_b["hit_type"].tolist())
            dup_a = pd.read_csv(next(dirs["OUT_DUPLICATE_DIR"].glob("*20261118*")), dtype=str)
            self.assertEqual(len(dup_a), 2)


if __name__ == "__main__":
    unittest.main()
