"""Conservative SG listing-variant risk check. ASIN matching remains separate.

This deliberately targets recognizable pen families only. Generic brand-only matches
are not considered duplicates; uncertain candidates go to CHECK, never OUT_DUPLICATE.
"""
import csv
import re
import unicodedata
from collections import defaultdict
from pathlib import Path

FAMILIES = (
    (re.compile(r"\bplatinum\b.*\bcuridas\b", re.I), "platinum curidas"),
    (re.compile(r"\bkaweco\b.*\bpiston\s+sport\b", re.I), "kaweco piston sport"),
    (re.compile(r"\bkaweco\b.*\bclassic\s+sports?\b", re.I), "kaweco classic sport"),
    (re.compile(r"\bkaweco\b.*\bskyline\s+sport\b", re.I), "kaweco skyline sport"),
    (re.compile(r"\bplatinum\b.*\bprocyon\b", re.I), "platinum procyon"),
    (re.compile(r"\bplatinum\b.*\bplaisir\b", re.I), "platinum plaisir"),
)
PEN_WORDS = re.compile(r"\b(fountain pen|ballpoint|rollerball|mechanical pencil|nib|fine point)\b", re.I)
ASIN = re.compile(r"[A-Z0-9]{10}")


def family_key(title):
    normalized = unicodedata.normalize("NFKC", str(title or "")).lower()
    normalized = re.sub(r"[^a-z0-9]+", " ", normalized).strip()
    for pattern, family in FAMILIES:
        if pattern.search(normalized):
            # Do not group different pen mechanisms as variants.
            if "mechanical pencil" in normalized:
                kind = "mechanical pencil"
            elif "ballpoint" in normalized:
                kind = "ballpoint"
            elif "rollerball" in normalized:
                kind = "rollerball"
            elif "fountain pen" in normalized or "nib" in normalized or "fine point" in normalized:
                kind = "fountain pen"
            else:
                return None
            return family + "|" + kind
    return None


def load_sg_catalog(path):
    if not Path(path).is_file():
        raise RuntimeError("SG商品名マスターがありません。類似商品判定を実行できません。")
    with open(path, encoding="utf-8-sig", newline="") as file:
        reader = csv.DictReader(file)
        required = {"asin", "product_id", "title"}
        if not required.issubset(set(reader.fieldnames or [])):
            raise RuntimeError("SG商品名マスターの列が不足しています。")
        index = defaultdict(list)
        for row in reader:
            asin = (row.get("asin") or "").strip().upper()
            title = (row.get("title") or "").strip()
            if not ASIN.fullmatch(asin) or not title:
                raise RuntimeError("SG商品名マスターに不正なASINまたは空の商品名があります。")
            key = family_key(title)
            if key:
                index[key].append({"asin": asin, "title": title, "product_id": row.get("product_id", "")})
        return index


def check_sg_variant(title, asin, index):
    key = family_key(title)
    if not key:
        return None
    matches = [item for item in index.get(key, []) if item["asin"] != asin]
    if not matches:
        return None
    reference = matches[0]
    return {
        "hit_type": "sg_variant_risk",
        "hit_value": key,
        "out_reason": (
            "SG出品済み商品と同一ブランド・シリーズ・商品種別。"
            "色違い・ペン先違い等の可能性があるため要確認。"
            f" 既存ASIN={reference['asin']}; 商品ID={reference['product_id']};"
            f" 既存商品名={reference['title'][:150]}"
        ),
    }
