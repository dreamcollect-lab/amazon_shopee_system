"""Prepare a combined PH + SG ASIN master for STEP1 without modifying Git history.

The PH master is input/shopee_existing_asin.csv and SG is input/shopee_sg_existing_asin.csv.
Both sources must exist and contain a column named asin.
"""
import csv
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PH = ROOT / "input" / "shopee_existing_asin.csv"
SG = ROOT / "input" / "shopee_sg_existing_asin.csv"
OUT = ROOT / "input" / "shopee_existing_asin.csv"
ASIN = re.compile(r"[A-Z0-9]{10}")


def read_asins(path):
    if not path.is_file():
        raise RuntimeError(f"Missing required existing-list master: {path.name}")
    with path.open("r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        if not reader.fieldnames or "asin" not in reader.fieldnames:
            raise RuntimeError(f"Missing asin column in {path.name}")
        values = set()
        invalid = []
        for row_num, row in enumerate(reader, start=2):
            value = (row.get("asin") or "").strip().upper()
            if not value:
                continue
            if not ASIN.fullmatch(value):
                invalid.append(row_num)
            else:
                values.add(value)
    if invalid:
        raise RuntimeError(f"Invalid ASIN in {path.name} at rows: {invalid[:10]}")
    if not values:
        raise RuntimeError(f"No valid ASIN values in {path.name}")
    return values


def main():
    ph = read_asins(PH)
    sg = read_asins(SG)
    combined = ph | sg
    # This file is changed only in the ephemeral GitHub Actions runner.
    with OUT.open("w", encoding="utf-8-sig", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(["asin"])
        writer.writerows((asin,) for asin in sorted(combined))
    print(f"PH={len(ph)}, SG={len(sg)}, overlap={len(ph & sg)}, union={len(combined)}")


if __name__ == "__main__":
    main()
