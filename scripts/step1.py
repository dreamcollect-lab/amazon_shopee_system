import re
import shutil
import time
import unicodedata
import os
from urllib.parse import unquote, urlparse
from datetime import datetime
from pathlib import Path

import pandas as pd


# =========================================================
# Amazon → Shopee投入前CSV 整形 STEP1 改良版
# =========================================================
# 重要修正:
# - カテゴリ名の「_」の数では判断しない。
# - 末尾の「_数字4〜8桁」だけを日付として外す。
# - @ がある場合だけ価格フィルターを使う。
# - @ がない場合は従来通り価格判定なし。
#
# ファイル名ルール:
# 通常:
#   cookware_0622.csv
#   action_cameras_noline_20260602.csv
#
# 価格あり:
#   cookware@3000-20000_20260623.csv
#   cookware@3000-_20260623.csv
#   cookware@-20000_20260623.csv
# =========================================================


BASE_DIR = Path(__file__).resolve().parents[1]

INPUT_DIR = BASE_DIR / "input"
WORKING_DIR = INPUT_DIR / "working"
OUTPUT_DIR = BASE_DIR / "output"
LOG_DIR = BASE_DIR / "logs"
PROCESSED_DIR = BASE_DIR / "processed"

SAFE_DIR = OUTPUT_DIR / "safe"
OUT_NG_DIR = OUTPUT_DIR / "out_ng"
OUT_DENY_DIR = OUTPUT_DIR / "out_deny"
OUT_DUPLICATE_DIR = OUTPUT_DIR / "out_duplicate"
OUT_PRICE_DIR = OUTPUT_DIR / "out_price"
CHECK_DIR = OUTPUT_DIR / "check"
REVIEW_SOURCE_DIR = OUTPUT_DIR / "review_source"
STANDARD_DIR = OUTPUT_DIR / "standard"

NG_MASTER_CSV = INPUT_DIR / "ng_master.csv"
CATEGORY_RULES_CSV = INPUT_DIR / "category_rules.csv"
SHOPEE_EXISTING_ASIN_CSV = INPUT_DIR / "shopee_existing_asin.csv"
SUMMARY_FILE = BASE_DIR / "summary.txt"
MOVE_TO_PROCESSED = os.environ.get("STEP1_MOVE_TO_PROCESSED", "").strip() == "1"

REVIEW_COLUMNS = [
    "source_file",
    "source_row",
    "category",
    "status",
    "asin",
    "title",
    "brand",
    "price_yen",
    "hit_type",
    "hit_value",
    "out_reason",
    "amazon_url",
    "image_url",
    "raw_text_for_ng",
    "all_asins",
]

for folder in [
    WORKING_DIR,
    OUTPUT_DIR,
    LOG_DIR,
    SAFE_DIR,
    OUT_NG_DIR,
    OUT_DENY_DIR,
    OUT_DUPLICATE_DIR,
    OUT_PRICE_DIR,
    CHECK_DIR,
    REVIEW_SOURCE_DIR,
    STANDARD_DIR,
]:
    folder.mkdir(exist_ok=True)

if MOVE_TO_PROCESSED:
    PROCESSED_DIR.mkdir(exist_ok=True)

LOG_FILE = LOG_DIR / "step1_log.txt"


# -------------------------
# ファイル名解析・価格抽出
# -------------------------

def parse_input_filename(csv_path):
    """
    入力CSVファイル名からカテゴリ名と価格条件を取得する。

    判定ルール:
    1. 拡張子を外す
    2. 末尾の _数字4〜8桁だけを日付として除去
    3. @ があれば価格指定として分離
    4. 残りをカテゴリ名にする
    """
    stem = unicodedata.normalize("NFKC", Path(csv_path).stem).strip().lower()

    # 末尾の _数字4〜8桁だけを日付として除去する
    # 例: action_cameras_noline_20260602 -> action_cameras_noline
    # 例: cookware_0622 -> cookware
    stem_without_date = re.sub(r"_[0-9]{4,8}$", "", stem).strip("_ ")

    price_min = None
    price_max = None

    if "@" in stem_without_date:
        category_name, price_part = stem_without_date.split("@", 1)
        category_name = category_name.strip("_ ")

        if not category_name:
            raise ValueError(f"カテゴリ名が取得できません: {csv_path.name}")

        if "-" not in price_part:
            raise ValueError(
                f"価格指定の形式が不正です: {csv_path.name} / 正: category@min-max_日付.csv"
            )

        min_part, max_part = price_part.split("-", 1)
        min_part = min_part.strip()
        max_part = max_part.strip()

        if min_part:
            if not min_part.isdigit():
                raise ValueError(f"価格下限が数字ではありません: {csv_path.name} / {min_part}")
            price_min = int(min_part)

        if max_part:
            if not max_part.isdigit():
                raise ValueError(f"価格上限が数字ではありません: {csv_path.name} / {max_part}")
            price_max = int(max_part)

        if price_min is not None and price_max is not None and price_min > price_max:
            raise ValueError(f"価格指定が不正です。下限が上限を超えています: {csv_path.name}")

    else:
        category_name = stem_without_date.strip("_ ")

    if not category_name:
        return "unknown", price_min, price_max

    if "@" in category_name:
        raise ValueError(f"カテゴリ名に @ が残っています: {csv_path.name}")

    return category_name, price_min, price_max


def get_category_from_filename(csv_path):
    category_name, _, _ = parse_input_filename(csv_path)
    return category_name


def safe_filename_part(value):
    text = unicodedata.normalize("NFKC", str(value)).strip().lower()
    text = re.sub(r"[^0-9a-zA-Zぁ-んァ-ン一-龥_-]+", "_", text)
    text = re.sub(r"_+", "_", text).strip("_")
    return text or "unknown"


def format_price_filter(price_min, price_max):
    if price_min is None and price_max is None:
        return "なし"

    min_text = "なし" if price_min is None else str(price_min)
    max_text = "なし" if price_max is None else str(price_max)
    return f"min={min_text}, max={max_text}"


def ensure_review_columns(df):
    result = df.copy()
    for col in REVIEW_COLUMNS:
        if col not in result.columns:
            result[col] = ""

    other_cols = [col for col in result.columns if col not in REVIEW_COLUMNS]
    return result[REVIEW_COLUMNS + other_cols]


def parse_price_value(value):
    """
    Amazon CSV内の価格文字列を整数円に変換する。
    例:
    ￥5,000 -> 5000
    5,000 -> 5000
    価格、商品詳細ページ ￥4,669 -> 4669
    """
    if pd.isna(value):
        return None

    text = unicodedata.normalize("NFKC", str(value)).strip()
    if not text:
        return None

    matches = re.findall(r"[0-9][0-9,]*", text)
    if not matches:
        return None

    for match in matches:
        number_text = match.replace(",", "")
        if number_text.isdigit():
            number = int(number_text)
            if number > 0:
                return number

    return None


def find_best_price(row, amazon_df):
    """
    元CSVから商品価格を探す。
    """
    price_candidate_columns = [
        "price",
        "Price",
        "価格",
        "商品価格",
        "現在価格",
        "販売価格",
        "amazon_price",
        "price_yen",
        "a-price-whole",
        "a-offscreen",
        "aok-offscreen",
        "a-color-price",
    ]

    for col in price_candidate_columns:
        if col in amazon_df.columns:
            price = parse_price_value(row.get(col, ""))
            if price is not None:
                return price

    for value in row:
        price = parse_price_value(value)
        if price is not None:
            return price

    return None


def judge_price(row, price_min, price_max):
    """
    価格フィルター判定。
    @ がない場合は価格判定なし。
    SAFEになった商品だけに対して使う。
    """
    if price_min is None and price_max is None:
        return "SAFE", "", "", ""

    price = row.get("price_yen", None)

    if price is None or str(price).strip() == "":
        return "OUT_PRICE", "price_missing", "", "価格が取得できない"

    try:
        price_int = int(price)
    except Exception:
        return "OUT_PRICE", "price_invalid", str(price), "価格が数値ではない"

    if price_min is not None and price_int < price_min:
        return "OUT_PRICE", "price_min", str(price_int), f"価格下限未満: {price_int} < {price_min}"

    if price_max is not None and price_int > price_max:
        return "OUT_PRICE", "price_max", str(price_int), f"価格上限超過: {price_int} > {price_max}"

    return "SAFE", "", "", ""


# -------------------------
# 正規化・一致判定
# -------------------------

def normalize_text(value):
    """
    contains / exact 用の強め正規化。
    大文字小文字、全角半角、空白、記号、改行を吸収する。
    """
    if pd.isna(value):
        return ""

    text = str(value)
    text = unicodedata.normalize("NFKC", text)
    text = text.lower()

    remove_chars = [
        " ", "　", "\n", "\r", "\t",
        "-", "ー", "−", "_",
        "・", ".", ",", "，", "、", "。", "/", "\\",
        "(", ")", "（", "）", "[", "]", "【", "】",
        "{", "}", "｛", "｝",
        "&", "＆", "'", "’", '"', "“", "”",
        ":", "：", ";", "；",
        "|", "｜", "+", "＋", "*", "＊",
    ]

    for ch in remove_chars:
        text = text.replace(ch, "")

    return text


def normalize_loose(value):
    """
    word判定用の緩い正規化。
    記号を空白にして、単語境界を残す。
    """
    if pd.isna(value):
        return ""

    text = str(value)
    text = unicodedata.normalize("NFKC", text)
    text = text.lower()
    text = re.sub(r"[^0-9a-zA-Zぁ-んァ-ン一-龥]+", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def tokenize_text(value):
    text = normalize_loose(value)
    if not text:
        return []
    return [t.strip() for t in text.split() if t.strip()]


def is_short_english_or_code(value):
    raw = str(value).strip()
    raw_nfkc = unicodedata.normalize("NFKC", raw)
    compact = re.sub(r"[^0-9a-zA-Z]", "", raw_nfkc)
    if not compact:
        return False
    return bool(re.fullmatch(r"[0-9a-zA-Z]+", compact)) and len(compact) <= 4


def match_value(target_text, rule_value, match_mode="contains"):
    if not rule_value:
        return False

    mode = str(match_mode or "contains").strip().lower()
    normalized_target = normalize_text(target_text)
    normalized_value = normalize_text(rule_value)

    if not normalized_value:
        return False

    if mode == "exact":
        return normalized_target == normalized_value

    if mode == "word":
        target_tokens = [normalize_text(t) for t in tokenize_text(target_text)]
        value_tokens = [normalize_text(t) for t in tokenize_text(rule_value)]

        if len(value_tokens) == 1:
            return value_tokens[0] in target_tokens

        target_phrase = " ".join([normalize_text(t) for t in tokenize_text(target_text)])
        value_phrase = " ".join(value_tokens)
        return value_phrase in target_phrase

    return normalized_value in normalized_target


def safe_match_mode_for_ng(value):
    if is_short_english_or_code(value):
        return "word"
    return "contains"


# -------------------------
# Amazon CSV抽出
# -------------------------

def extract_asin(text):
    if pd.isna(text):
        return ""

    text = str(text)
    patterns = [
        r"/dp/([A-Z0-9]{10})",
        r"/gp/product/([A-Z0-9]{10})",
        r"asin=([A-Z0-9]{10})",
    ]

    for pattern in patterns:
        match = re.search(pattern, text)
        if match:
            return match.group(1)

    return ""


def find_all_asins(row):
    asins = []
    for value in row:
        asin = extract_asin(value)
        if asin and asin not in asins:
            asins.append(asin)
    return asins


def find_first_amazon_url(row):
    for value in row:
        if pd.isna(value):
            continue
        value = str(value)
        if "amazon.co.jp" in value and ("/dp/" in value or "/gp/product/" in value):
            return value
    return ""


def find_first_image_url(row):
    for value in row:
        if pd.isna(value):
            continue
        value = str(value)
        if "m.media-amazon.com" in value:
            return value
    return ""


def find_best_title(row, amazon_df):
    title_candidate_columns = [
        "a-size-base-plus 2",
        "title",
        "name",
        "product_name",
        "product title",
        "商品名",
        "a-size-base-plus",
    ]

    for col in title_candidate_columns:
        if col in amazon_df.columns:
            value = str(row.get(col, "")).strip()
            if value:
                return value

    candidates = []

    for value in row:
        if pd.isna(value):
            continue

        text = str(value).strip()
        if not text:
            continue

        lower_text = text.lower()
        if "amazon.co.jp" in lower_text:
            continue
        if "m.media-amazon.com" in lower_text:
            continue
        if re.fullmatch(r"[A-Z0-9]{10}", text):
            continue
        if re.fullmatch(r"[¥￥]?[0-9,]+", text):
            continue
        if len(text) < 10:
            continue

        candidates.append(text)

    if not candidates:
        return ""

    return max(candidates, key=len)


def find_best_brand(row, amazon_df, title):
    brand_candidate_columns = [
        "brand",
        "Brand",
        "ブランド",
        "メーカー",
        "manufacturer",
        "Manufacturer",
        "maker",
        "Maker",
    ]

    for col in brand_candidate_columns:
        if col in amazon_df.columns:
            value = str(row.get(col, "")).strip()
            if value:
                return value

    return ""


def is_noise_text(text):
    lower = str(text).lower()

    noise_markers = [
        "customer reviews",
        "ratings",
        "stars",
        "このブランドの製品は平均",
        "星です",
        "スポンサー",
        "sponsored",
        "おすすめ",
        "関連商品",
        "この商品を見た後に",
        "ほしい物リスト",
        "カートに入れる",
        "prime",
        "配送",
        "無料配送",
    ]

    if any(marker in lower for marker in noise_markers):
        return True

    if len(str(text)) > 300:
        return True

    return False


def decode_amazon_product_slug(url):
    if not url:
        return ""

    try:
        parsed = urlparse(str(url))
        path = unquote(parsed.path)
        parts = [p for p in path.split("/") if p]

        if "dp" in parts:
            dp_index = parts.index("dp")
            if dp_index > 0:
                return parts[dp_index - 1]

        if "gp" in parts and "product" in parts:
            product_index = parts.index("product")
            if product_index > 0:
                return parts[product_index - 1]

    except Exception:
        return ""

    return ""


def build_raw_text_for_ng(row):
    parts = []

    for value in row:
        if pd.isna(value):
            continue

        text = str(value).strip()
        if not text:
            continue

        lower_text = text.lower()

        if "m.media-amazon.com" in lower_text:
            continue

        if "amazon.co.jp" in lower_text:
            slug = decode_amazon_product_slug(text)
            if slug and not is_noise_text(slug):
                parts.append(slug)
            continue

        if is_noise_text(text):
            continue

        parts.append(text)

    return " ".join(parts)


def find_amazon_csv_files():
    csv_files = []
    excluded = {
        "ng_master.csv",
        "category_rules.csv",
        "shopee_existing_asin.csv",
    }

    for file in WORKING_DIR.glob("*.csv"):
        if file.name.lower() in excluded:
            continue
        csv_files.append(file)

    return sorted(csv_files)


# -------------------------
# マスタ読込
# -------------------------

def load_ng_master():
    empty = {
        "asin_set": set(),
        "jan_set": set(),
        "brand_ng": [],
        "keyword_ng": [],
        "description_ng": [],
        "category_ng": [],
        "count": 0,
    }

    if not NG_MASTER_CSV.exists():
        return empty

    ng_df = pd.read_csv(NG_MASTER_CSV, dtype=str, encoding="utf-8-sig").fillna("")

    column_map = {
        "ASIN": "asin",
        "JAN": "jan",
        "キーワード": "keyword",
        "商品説明": "description",
        "ブランド": "brand",
        "カテゴリ": "category",
    }

    asin_set = set()
    jan_set = set()
    brand_ng = []
    keyword_ng = []
    description_ng = []
    category_ng = []
    seen = set()

    for csv_col, ng_type in column_map.items():
        if csv_col not in ng_df.columns:
            continue

        for value in ng_df[csv_col].tolist():
            value = str(value).strip()
            if not value:
                continue

            normalized_value = normalize_text(value)
            if not normalized_value:
                continue

            key = (ng_type, normalized_value)
            if key in seen:
                continue
            seen.add(key)

            if ng_type == "asin":
                asin_set.add(value)
                continue

            if ng_type == "jan":
                jan_set.add(value)
                continue

            item = {
                "ng_type": ng_type,
                "ng_value": value,
                "normalized_value": normalized_value,
                "match_mode": safe_match_mode_for_ng(value),
            }

            if ng_type == "brand":
                brand_ng.append(item)
            elif ng_type == "keyword":
                keyword_ng.append(item)
            elif ng_type == "description":
                description_ng.append(item)
            elif ng_type == "category":
                category_ng.append(item)

    return {
        "asin_set": asin_set,
        "jan_set": jan_set,
        "brand_ng": brand_ng,
        "keyword_ng": keyword_ng,
        "description_ng": description_ng,
        "category_ng": category_ng,
        "count": len(asin_set) + len(jan_set) + len(brand_ng) + len(keyword_ng) + len(description_ng) + len(category_ng),
    }


def load_existing_asins():
    if not SHOPEE_EXISTING_ASIN_CSV.exists():
        return set()

    df = pd.read_csv(SHOPEE_EXISTING_ASIN_CSV, dtype=str, encoding="utf-8-sig").fillna("")

    if "asin" not in df.columns:
        return set()

    existing_asins = set()

    for value in df["asin"].tolist():
        asin = str(value).strip().upper()
        if re.fullmatch(r"[A-Z0-9]{10}", asin):
            existing_asins.add(asin)

    return existing_asins


def load_category_rules():
    if not CATEGORY_RULES_CSV.exists():
        return pd.DataFrame(columns=[
            "category",
            "rule_type",
            "value",
            "match_mode",
            "memo",
            "normalized_value",
        ])

    rule_df = pd.read_csv(CATEGORY_RULES_CSV, dtype=str, encoding="utf-8-sig").fillna("")

    required_cols = ["category", "rule_type", "value", "match_mode", "memo"]
    for col in required_cols:
        if col not in rule_df.columns:
            rule_df[col] = ""

    rule_df["category"] = rule_df["category"].str.strip().str.lower()
    rule_df["rule_type"] = rule_df["rule_type"].str.strip().str.lower()
    rule_df["value"] = rule_df["value"].str.strip()
    rule_df["match_mode"] = rule_df["match_mode"].str.strip().str.lower()
    rule_df.loc[rule_df["match_mode"] == "", "match_mode"] = "contains"

    rule_df = rule_df[rule_df["value"] != ""].copy()
    rule_df["normalized_value"] = rule_df["value"].apply(normalize_text)

    return rule_df


# -------------------------
# 判定
# -------------------------

def judge_ng(row, ng_data):
    asin = str(row.get("asin", "")).strip()
    jan = str(row.get("jan", "")).strip()

    title = str(row.get("title", "")).strip()
    brand = str(row.get("brand", "")).strip()
    category = str(row.get("category", "")).strip()
    raw_text_for_ng = str(row.get("raw_text_for_ng", "")).strip()

    if asin and asin in ng_data["asin_set"]:
        return "OUT_NG", "asin", asin, "NG ASINに完全一致"

    if jan and jan in ng_data["jan_set"]:
        return "OUT_NG", "jan", jan, "NG JANに完全一致"

    brand_target = " ".join([brand, title])
    product_text_target = " ".join([title, brand, raw_text_for_ng])
    category_target = " ".join([title, category])

    for ng in ng_data["brand_ng"]:
        if match_value(brand_target, ng["ng_value"], ng["match_mode"]):
            return "OUT_NG", "brand", ng["ng_value"], f"NGブランド一致({ng['match_mode']})"

    for ng in ng_data["keyword_ng"]:
        if match_value(product_text_target, ng["ng_value"], ng["match_mode"]):
            return "OUT_NG", "keyword", ng["ng_value"], f"NGキーワード一致({ng['match_mode']})"

    for ng in ng_data["description_ng"]:
        if match_value(product_text_target, ng["ng_value"], ng["match_mode"]):
            return "OUT_NG", "description", ng["ng_value"], f"NG商品説明一致({ng['match_mode']})"

    for ng in ng_data["category_ng"]:
        if match_value(category_target, ng["ng_value"], ng["match_mode"]):
            return "OUT_NG", "category", ng["ng_value"], f"NGカテゴリ一致({ng['match_mode']})"

    return "SAFE", "", "", ""


def judge_duplicate(row, existing_asin_set):
    asin = str(row.get("asin", "")).strip().upper()

    if asin and asin in existing_asin_set:
        return "OUT_DUPLICATE", "duplicate_asin", asin, "Shopee出品済みASINに一致"

    return "SAFE", "", "", ""


def judge_category(row, category_name, rule_df):
    title = str(row.get("title", "")).strip()

    rules = rule_df[rule_df["category"] == category_name].copy()

    if rules.empty:
        return "CHECK", "category_rule_missing", "", "カテゴリルール未設定"

    deny_rules = rules[rules["rule_type"] == "deny"]
    allow_rules = rules[rules["rule_type"] == "allow"]

    for _, rule in deny_rules.iterrows():
        value = rule["value"]
        match_mode = rule["match_mode"] or "contains"

        if match_value(title, value, match_mode):
            return "OUT_DENY", "category_deny", value, f"カテゴリ除外ワード一致({match_mode})"

    if not allow_rules.empty:
        for _, rule in allow_rules.iterrows():
            value = rule["value"]
            match_mode = rule["match_mode"] or "contains"

            if match_value(title, value, match_mode):
                return "SAFE", "category_allow", value, f"カテゴリ許可ワード一致({match_mode})"

        return "CHECK", "category_allow_missing", "", "カテゴリ許可ワードに該当なし"

    return "CHECK", "category_allow_missing", "", "allow未設定"


# -------------------------
# メイン処理
# -------------------------

def process_one_amazon_csv(amazon_csv, ng_data, existing_asin_set, category_rules_df, timestamp, logs):
    process_start = time.time()
    category_name, price_min, price_max = parse_input_filename(amazon_csv)

    logs.append("")
    logs.append("========================================")
    logs.append(f"処理ファイル: {amazon_csv.name}")
    logs.append(f"カテゴリ名: {category_name}")

    if price_min is None and price_max is None:
        logs.append("価格フィルター: なし")
    else:
        logs.append(f"価格フィルター: {format_price_filter(price_min, price_max)}")

    logs.append("========================================")

    t0 = time.time()
    amazon_df = pd.read_csv(amazon_csv, dtype=str, encoding="utf-8-sig").fillna("")
    t1 = time.time()
    logs.append(f"CSV読込時間: {t1 - t0:.2f}秒")

    t0 = time.time()
    output_rows = []

    for index, row in amazon_df.iterrows():
        all_asins = find_all_asins(row)
        asin = all_asins[0] if all_asins else ""

        amazon_url = find_first_amazon_url(row)
        image_url = find_first_image_url(row)
        title = find_best_title(row, amazon_df)
        brand = find_best_brand(row, amazon_df, title)
        price_yen = find_best_price(row, amazon_df)
        raw_text_for_ng = build_raw_text_for_ng(row)

        if not asin and not title:
            continue

        output_rows.append({
            "source_file": amazon_csv.name,
            "source_row": index + 1,
            "category": category_name,
            "asin": asin,
            "jan": "",
            "title": title,
            "brand": brand,
            "price_yen": price_yen if price_yen is not None else "",
            "amazon_url": amazon_url,
            "image_url": image_url,
            "raw_text_for_ng": raw_text_for_ng,
            "all_asins": ",".join(all_asins),
        })

    standard_df = pd.DataFrame(output_rows)

    if standard_df.empty:
        logs.append("抽出結果: 0件")
        process_end = time.time()
        return {
            "source_file": amazon_csv.name,
            "category": category_name,
            "price_filter": format_price_filter(price_min, price_max),
            "total": 0,
            "safe": 0,
            "check": 0,
            "out_deny": 0,
            "out_ng": 0,
            "out_duplicate": 0,
            "out_price": 0,
            "output_files": [],
            "duration": process_end - process_start,
        }

    standard_df = standard_df[standard_df["asin"] != ""].copy()
    standard_df = standard_df.drop_duplicates(subset=["asin"]).reset_index(drop=True)
    standard_df["status"] = "STANDARD"
    standard_df["hit_type"] = ""
    standard_df["hit_value"] = ""
    standard_df["out_reason"] = ""

    t1 = time.time()
    logs.append(f"標準化処理時間: {t1 - t0:.2f}秒")

    t0 = time.time()
    judged_rows = []

    for _, row in standard_df.iterrows():
        row_dict = row.to_dict()

        ng_status, ng_hit_type, ng_hit_value, ng_reason = judge_ng(row_dict, ng_data)
        if ng_status == "OUT_NG":
            row_dict["status"] = "OUT_NG"
            row_dict["hit_type"] = ng_hit_type
            row_dict["hit_value"] = ng_hit_value
            row_dict["out_reason"] = ng_reason
            judged_rows.append(row_dict)
            continue

        dup_status, dup_hit_type, dup_hit_value, dup_reason = judge_duplicate(row_dict, existing_asin_set)
        if dup_status == "OUT_DUPLICATE":
            row_dict["status"] = "OUT_DUPLICATE"
            row_dict["hit_type"] = dup_hit_type
            row_dict["hit_value"] = dup_hit_value
            row_dict["out_reason"] = dup_reason
            judged_rows.append(row_dict)
            continue

        cat_status, cat_hit_type, cat_hit_value, cat_reason = judge_category(
            row_dict,
            category_name,
            category_rules_df
        )

        row_dict["status"] = cat_status
        row_dict["hit_type"] = cat_hit_type
        row_dict["hit_value"] = cat_hit_value
        row_dict["out_reason"] = cat_reason

        # SAFEになった商品だけ価格判定する
        if row_dict["status"] == "SAFE":
            price_status, price_hit_type, price_hit_value, price_reason = judge_price(
                row_dict,
                price_min,
                price_max
            )
            if price_status == "OUT_PRICE":
                row_dict["status"] = "OUT_PRICE"
                row_dict["hit_type"] = price_hit_type
                row_dict["hit_value"] = price_hit_value
                row_dict["out_reason"] = price_reason

        judged_rows.append(row_dict)

    judged_df = pd.DataFrame(judged_rows, columns=standard_df.columns)

    safe_df = judged_df[judged_df["status"] == "SAFE"].copy()
    out_ng_df = judged_df[judged_df["status"] == "OUT_NG"].copy()
    out_deny_df = judged_df[judged_df["status"] == "OUT_DENY"].copy()
    out_duplicate_df = judged_df[judged_df["status"] == "OUT_DUPLICATE"].copy()
    out_price_df = judged_df[judged_df["status"] == "OUT_PRICE"].copy()
    check_df = judged_df[judged_df["status"] == "CHECK"].copy()

    t1 = time.time()
    logs.append(f"判定処理時間: {t1 - t0:.2f}秒")

    t0 = time.time()

    category_slug = safe_filename_part(category_name)

    standard_path = STANDARD_DIR / f"standard_{category_slug}_{timestamp}.csv"
    safe_path = SAFE_DIR / f"safe_{category_slug}_{timestamp}.csv"
    out_ng_path = OUT_NG_DIR / f"out_ng_{category_slug}_{timestamp}.csv"
    out_deny_path = OUT_DENY_DIR / f"out_deny_{category_slug}_{timestamp}.csv"
    out_duplicate_path = OUT_DUPLICATE_DIR / f"out_duplicate_{category_slug}_{timestamp}.csv"
    out_price_path = OUT_PRICE_DIR / f"out_price_{category_slug}_{timestamp}.csv"
    check_path = CHECK_DIR / f"check_{category_slug}_{timestamp}.csv"
    review_source_path = REVIEW_SOURCE_DIR / f"review_source_{category_slug}_{timestamp}.csv"

    standard_df = ensure_review_columns(standard_df)
    safe_df = ensure_review_columns(safe_df)
    out_ng_df = ensure_review_columns(out_ng_df)
    out_deny_df = ensure_review_columns(out_deny_df)
    out_duplicate_df = ensure_review_columns(out_duplicate_df)
    out_price_df = ensure_review_columns(out_price_df)
    check_df = ensure_review_columns(check_df)
    review_source_df = ensure_review_columns(judged_df)

    standard_df.to_csv(standard_path, index=False, encoding="utf-8-sig")
    safe_df.to_csv(safe_path, index=False, encoding="utf-8-sig")
    out_ng_df.to_csv(out_ng_path, index=False, encoding="utf-8-sig")
    out_deny_df.to_csv(out_deny_path, index=False, encoding="utf-8-sig")
    out_duplicate_df.to_csv(out_duplicate_path, index=False, encoding="utf-8-sig")
    out_price_df.to_csv(out_price_path, index=False, encoding="utf-8-sig")
    check_df.to_csv(check_path, index=False, encoding="utf-8-sig")
    review_source_df.to_csv(review_source_path, index=False, encoding="utf-8-sig")

    t1 = time.time()
    logs.append(f"CSV出力時間: {t1 - t0:.2f}秒")

    logs.append(f"標準化件数: {len(standard_df)}")
    logs.append(f"SAFE件数: {len(safe_df)}")
    logs.append(f"OUT_NG件数: {len(out_ng_df)}")
    logs.append(f"OUT_DENY件数: {len(out_deny_df)}")
    logs.append(f"OUT_DUPLICATE件数: {len(out_duplicate_df)}")
    logs.append(f"OUT_PRICE件数: {len(out_price_df)}")
    logs.append(f"CHECK件数: {len(check_df)}")
    logs.append(f"SAFE出力: {safe_path}")
    logs.append(f"OUT_NG出力: {out_ng_path}")
    logs.append(f"OUT_DENY出力: {out_deny_path}")
    logs.append(f"OUT_DUPLICATE出力: {out_duplicate_path}")
    logs.append(f"OUT_PRICE出力: {out_price_path}")
    logs.append(f"CHECK出力: {check_path}")
    logs.append(f"再チェック用元CSV: {review_source_path}")

    if MOVE_TO_PROCESSED:
        processed_path = PROCESSED_DIR / amazon_csv.name
        if processed_path.exists():
            processed_path = PROCESSED_DIR / f"{amazon_csv.stem}_{timestamp}{amazon_csv.suffix}"

        shutil.move(str(amazon_csv), str(processed_path))
        logs.append(f"処理済みに移動: {processed_path.name}")
    else:
        logs.append("処理済み移動: なし（STEP1_MOVE_TO_PROCESSED=1 の場合のみ移動）")

    process_end = time.time()
    logs.append(f"総処理時間: {process_end - process_start:.2f}秒")

    output_files = [
        safe_path,
        check_path,
        out_deny_path,
        out_ng_path,
        out_duplicate_path,
        out_price_path,
        standard_path,
        review_source_path,
    ]

    return {
        "source_file": amazon_csv.name,
        "category": category_name,
        "price_filter": format_price_filter(price_min, price_max),
        "total": len(judged_df),
        "safe": len(safe_df),
        "check": len(check_df),
        "out_deny": len(out_deny_df),
        "out_ng": len(out_ng_df),
        "out_duplicate": len(out_duplicate_df),
        "out_price": len(out_price_df),
        "output_files": output_files,
        "duration": process_end - process_start,
    }


def build_summary_text(timestamp, process_summaries, total_duration):
    lines = []
    lines.append("# STEP1 実行サマリー")
    lines.append("")
    lines.append(f"- 実行日時: {timestamp}")
    lines.append(f"- 入力フォルダ: {WORKING_DIR.relative_to(BASE_DIR)}")
    lines.append(f"- processed移動: {'有効' if MOVE_TO_PROCESSED else '無効'}")
    lines.append(f"- 全体処理時間: {total_duration:.2f}秒")
    lines.append(f"- LOG: {LOG_FILE.relative_to(BASE_DIR)}")
    lines.append(f"- SUMMARY: {SUMMARY_FILE.relative_to(BASE_DIR)}")
    lines.append("- 判定順序: NG → DUPLICATE → DENY → ALLOW → SAFE → PRICE")
    lines.append("- 確認優先順: SAFE → CHECK → OUT_DENY → OUT_NG → OUT_DUPLICATE → OUT_PRICE")
    lines.append("")

    if not process_summaries:
        lines.append("処理対象Amazon CSVはありません。")
        lines.append("")
        lines.append("Amazon CSVは `input/working/` に配置してください。")
        return "\n".join(lines)

    lines.append("## 優先確認")
    lines.append("")
    lines.append("1. SAFE CSV")
    lines.append("2. CHECK CSV")
    lines.append("3. OUT_DENY CSV")
    lines.append("4. OUT_NG CSV")
    lines.append("5. OUT_DUPLICATE CSV")
    lines.append("6. OUT_PRICE CSV")
    lines.append("")

    for item in process_summaries:
        lines.append(f"## {item['source_file']}")
        lines.append("")
        lines.append(f"- 対象Amazon CSV名: {item['source_file']}")
        lines.append(f"- category: {item['category']}")
        lines.append(f"- 価格フィルター: {item['price_filter']}")
        lines.append(f"- 対象件数: {item['total']}")
        lines.append(f"- SAFE件数: {item['safe']}")
        lines.append(f"- CHECK件数: {item['check']}")
        lines.append(f"- OUT_DENY件数: {item['out_deny']}")
        lines.append(f"- OUT_NG件数: {item['out_ng']}")
        lines.append(f"- OUT_DUPLICATE件数: {item['out_duplicate']}")
        lines.append(f"- OUT_PRICE件数: {item['out_price']}")
        lines.append(f"- 処理時間: {item['duration']:.2f}秒")
        lines.append("")
        lines.append("### 確認優先ファイル")
        lines.append("")
        for path in item["output_files"][:3]:
            lines.append(f"- {path.relative_to(BASE_DIR)}")
        lines.append("")
        lines.append("### 出力ファイル一覧")
        lines.append("")
        for path in item["output_files"]:
            lines.append(f"- {path.relative_to(BASE_DIR)}")
        lines.append("")

    return "\n".join(lines)


def main():
    total_start = time.time()

    logs = []
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")

    logs.append("===== Amazon Shopee CSV Filter Start =====")
    logs.append(f"実行日時: {timestamp}")
    logs.append(f"input: {INPUT_DIR}")
    logs.append(f"working: {WORKING_DIR}")
    logs.append(f"output: {OUTPUT_DIR}")
    logs.append(f"processed移動: {'有効' if MOVE_TO_PROCESSED else '無効'}")

    t0 = time.time()
    ng_data = load_ng_master()
    existing_asin_set = load_existing_asins()
    category_rules_df = load_category_rules()
    amazon_csv_files = find_amazon_csv_files()
    t1 = time.time()

    logs.append(f"マスタ読込時間: {t1 - t0:.2f}秒")
    logs.append(f"禁止ワード総数: {ng_data['count']}")
    logs.append(f"NG ASIN数: {len(ng_data['asin_set'])}")
    logs.append(f"NG JAN数: {len(ng_data['jan_set'])}")
    logs.append(f"NGブランド数: {len(ng_data['brand_ng'])}")
    logs.append(f"NGキーワード数: {len(ng_data['keyword_ng'])}")
    logs.append(f"NG商品説明数: {len(ng_data['description_ng'])}")
    logs.append(f"NGカテゴリ数: {len(ng_data['category_ng'])}")
    logs.append(f"Shopee出品済みASIN数: {len(existing_asin_set)}")
    logs.append(f"カテゴリルール数: {len(category_rules_df)}")
    logs.append(f"Amazon CSV数: {len(amazon_csv_files)}")

    if not amazon_csv_files:
        total_end = time.time()
        logs.append("処理対象CSVがありません。input/workingフォルダにAmazon CSVを入れてください。")
        summary_text = build_summary_text(timestamp, [], total_end - total_start)
        SUMMARY_FILE.write_text(summary_text, encoding="utf-8")
        LOG_FILE.write_text("\n".join(logs), encoding="utf-8")
        print("処理対象CSVがありません。")
        print(f"workingフォルダ: {WORKING_DIR}")
        print(f"summary: {SUMMARY_FILE}")
        return

    process_summaries = []
    for amazon_csv in amazon_csv_files:
        result = process_one_amazon_csv(
            amazon_csv=amazon_csv,
            ng_data=ng_data,
            existing_asin_set=existing_asin_set,
            category_rules_df=category_rules_df,
            timestamp=timestamp,
            logs=logs
        )
        if result:
            process_summaries.append(result)

    total_end = time.time()
    logs.append("")
    logs.append(f"全体処理時間: {total_end - total_start:.2f}秒")
    logs.append("===== Completed =====")

    summary_text = build_summary_text(timestamp, process_summaries, total_end - total_start)
    SUMMARY_FILE.write_text(summary_text, encoding="utf-8")
    LOG_FILE.write_text("\n".join(logs), encoding="utf-8")

    print("STEP1 完了")
    print(f"ログ: {LOG_FILE}")
    print(f"summary: {SUMMARY_FILE}")
    print(f"SAFE出力: {SAFE_DIR}")
    print(f"OUT_NG出力: {OUT_NG_DIR}")
    print(f"OUT_DENY出力: {OUT_DENY_DIR}")
    print(f"OUT_DUPLICATE出力: {OUT_DUPLICATE_DIR}")
    print(f"OUT_PRICE出力: {OUT_PRICE_DIR}")
    print(f"CHECK出力: {CHECK_DIR}")
    print(f"処理済み移動: {'有効' if MOVE_TO_PROCESSED else '無効'}")


if __name__ == "__main__":
    main()
