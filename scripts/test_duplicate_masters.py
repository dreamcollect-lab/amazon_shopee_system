import importlib.util
import tempfile
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location("step1", Path(__file__).resolve().parent / "step1.py")
step1 = importlib.util.module_from_spec(spec)
spec.loader.exec_module(step1)


class DuplicateMasterTests(unittest.TestCase):
    def test_union_and_fail_closed(self):
        with tempfile.TemporaryDirectory() as temp:
            ph = Path(temp) / "ph.csv"
            sg = Path(temp) / "sg.csv"
            ph.write_text("asin,source_file\nB000000001,original\nB000000002,original\n", encoding="utf-8")
            sg.write_text("asin\nB000000002\nB000000003\n", encoding="utf-8")
            old_ph = step1.SHOPEE_EXISTING_ASIN_CSV
            old_sg = step1.SHOPEE_SG_EXISTING_ASIN_CSV
            try:
                step1.SHOPEE_EXISTING_ASIN_CSV = ph
                step1.SHOPEE_SG_EXISTING_ASIN_CSV = sg
                result = step1.load_existing_asins()
                self.assertEqual(result, {"B000000001", "B000000002", "B000000003"})
                for asin in result:
                    self.assertEqual(step1.judge_duplicate({"asin": asin}, result)[0], "OUT_DUPLICATE")
                self.assertEqual(step1.judge_duplicate({"asin": "B000000004"}, result)[0], "SAFE")
                sg.unlink()
                with self.assertRaises(RuntimeError):
                    step1.load_existing_asins()
                sg.write_text("asin\nINVALID\n", encoding="utf-8")
                with self.assertRaises(RuntimeError):
                    step1.load_existing_asins()
            finally:
                step1.SHOPEE_EXISTING_ASIN_CSV = old_ph
                step1.SHOPEE_SG_EXISTING_ASIN_CSV = old_sg


if __name__ == "__main__":
    unittest.main()
