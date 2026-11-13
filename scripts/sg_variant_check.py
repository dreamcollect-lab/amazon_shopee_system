"""SG listing similarity preflight for all categories, not just pens.

Index candidates by distinctive title tokens. Same brand alone never triggers.
Different model numbers (e.g. B650 vs B760) are protected from matching.
Variant-only differences (color, size, capacity, nib) are review candidates.
This is a risk signal, not Shopee's proprietary enforcement decision.
"""
import csv
import re
import unicodedata
from collections import defaultdict
from pathlib import Path

ASIN = re.compile(r"[A-Z0-9]{10}")
MODEL = re.compile(r"^(?=.*\d)[a-z0-9]{3,}$")
COLORS = set("black white red blue green yellow orange pink purple brown gray grey gold silver beige navy ivory clear transparent matte glossy charcoal midnight rose urban grand".split())
VARIANTS = set("xs s m l xl xxl small medium large extra fine ef f bb nib point mm cm inch inches gb tb ml litre liter liters kg g oz pack packs pcs piece pieces set sets size color colour variant edition".split())
# Distinct named product lines must not be merged merely because generic terms match.
DISTINCT_LINES = (frozenset({"master", "anywhere"}),)
STOP = set("the a an and or with for of in on to from by new genuine original official product item japan japanese imported compatible type model series".split())
# Distinctive technical model IDs should be kept even if they contain digits.
TOKEN = re.compile(r"[a-z]+[0-9a-z]*|[0-9]+[a-z][a-z0-9]*|[0-9]+|[一-龯ぁ-んァ-ヴー]{2,}")
PEN_FAMILIES = (
    ("platinum", "curidas"), ("platinum", "procyon"), ("platinum", "plaisir"),
    ("kaweco", "piston", "sport"), ("kaweco", "classic", "sport"),
    ("kaweco", "skyline", "sport"),
)

def title_tokens(title):
    text = unicodedata.normalize("NFKC", str(title or "")).lower()
    text = re.sub(r"(?<=\d)[-_/](?=\d)", " ", text)
    return TOKEN.findall(text)

def features(title):
    tokens = title_tokens(title)
    if not tokens:
        return None
    clean = [t for t in tokens if t not in COLORS | VARIANTS | STOP and len(t) > 1]
    # Capacity (16gb), dimensions and nib sizes may vary without changing the product.
    clean = [t for t in clean if not re.fullmatch(r"\d+(gb|tb|mm|cm|ml|kg|g|oz|inch|in)", t)]
    if len(set(clean)) < 2:
        return None
    models = {t for t in clean if MODEL.fullmatch(t) and t not in {"2026", "2025", "2024"}}
    return {"tokens": set(clean), "models": models, "ordered": tuple(clean)}

def pen_family(title):
    t = set(title_tokens(title))
    for family in PEN_FAMILIES:
        if set(family).issubset(t):
            if "mechanical" in t and "pencil" in t: kind = "mechanical_pencil"
            elif "ballpoint" in t: kind = "ballpoint"
            elif "rollerball" in t: kind = "rollerball"
            elif "fountain" in t and "pen" in t or "nib" in t: kind = "fountain_pen"
            else: return None
            return "|".join(family) + "|" + kind
    return None

def family_key(title):
    """Compatibility with previous pen-only matcher."""
    return pen_family(title)

def _model_conflict(a, b):
    # Different model identifiers protect distinct motherboards, PCs, etc.
    return bool(a["models"] and b["models"] and not a["models"].intersection(b["models"]))

def _score(a, b):
    if _model_conflict(a, b):
        return 0
    for lines in DISTINCT_LINES:
        left = a["tokens"] & lines
        right = b["tokens"] & lines
        if left and right and left != right:
            return 0
    intersection = len(a["tokens"] & b["tokens"])
    if intersection < 2:
        return 0
    similarity = intersection / max(len(a["tokens"]), len(b["tokens"]))
    # Two generic shared tokens alone must not trigger across categories.
    if intersection < 3 and a["tokens"] != b["tokens"]:
        return 0
    return similarity

class SgTitleIndex:
    def __init__(self):
        self.records = []
        self.by_token = defaultdict(set)
        self.by_pen = defaultdict(set)

    def add(self, asin, title, product_id=""):
        f = features(title)
        if not f:
            return
        idx = len(self.records)
        record = {"asin": str(asin).upper(), "title": title, "product_id": product_id,
                  "features": f, "pen": pen_family(title)}
        self.records.append(record)
        for token in f["tokens"]:
            self.by_token[token].add(idx)
        if record["pen"]:
            self.by_pen[record["pen"]].add(idx)

    def match(self, title, asin):
        f = features(title)
        if not f:
            return None
        pen = pen_family(title)
        candidates = set()
        for token in f["tokens"]:
            candidates.update(self.by_token.get(token, ()))
        if pen:
            candidates.update(self.by_pen.get(pen, ()))
        best = None
        for idx in candidates:
            row = self.records[idx]
            if row["asin"] == str(asin).upper():
                continue
            # Pen mechanism mismatch should not be grouped as a variation.
            if pen and row["pen"] and pen != row["pen"]:
                continue
            same_pen = bool(pen and row["pen"] == pen)
            score = _score(f, row["features"])
            if not same_pen and score < 0.80:
                continue
            rank = 1.0 if same_pen else score
            if best is None or rank > best[0]:
                best = (rank, row, "同一ペンシリーズ（色・ペン先等の違い）" if same_pen else "商品名の主要語句が酷似（色・サイズ等の違いを含む）")
        if not best:
            return None
        _, row, reason = best
        return {"hit_type": "sg_title_similarity_risk", "hit_value": reason,
                "out_reason": (f"SG重複出品リスク: {reason}。出品可否を確認。"
                               f" 比較ASIN={row['asin']}; 商品ID={row['product_id']};"
                               f" 比較商品名={row['title'][:150]}")}

    def __len__(self):
        return len(self.records)

def load_sg_catalog(path):
    if not Path(path).is_file():
        raise RuntimeError("SG商品名マスターがありません。")
    index = SgTitleIndex()
    with open(path, encoding="utf-8-sig", newline="") as file:
        reader = csv.DictReader(file)
        if not {"asin", "product_id", "title"}.issubset(reader.fieldnames or []):
            raise RuntimeError("SG商品名マスターの列が不足しています。")
        count = 0
        for row in reader:
            asin = (row.get("asin") or "").strip().upper()
            title = (row.get("title") or "").strip()
            if not ASIN.fullmatch(asin) or not title:
                raise RuntimeError("SG商品名マスターに不正なASINまたは空の商品名があります。")
            index.add(asin, title, row.get("product_id", ""))
            count += 1
    if not count:
        raise RuntimeError("SG商品名マスターが空です。")
    return index

def check_sg_variant(title, asin, index):
    return index.match(title, asin)
