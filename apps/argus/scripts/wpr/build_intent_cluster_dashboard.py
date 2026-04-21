#!/usr/bin/env python3

from __future__ import annotations

import csv
import html
import json
import math
import os
import re
from collections import defaultdict
from pathlib import Path
from statistics import mean
from datetime import date, datetime

from common import resolve_wpr_paths

WPR_PATHS = resolve_wpr_paths()
DATA_ROOT = WPR_PATHS.wpr_root
WEEK_DIR_RE = re.compile(r"^Week (\d+) - (\d{4}-\d{2}-\d{2}) \(Sun\)(?: \(Partial\))?$")
ASIN_RE = re.compile(r"b0[a-z0-9]{8}$", re.IGNORECASE)
DEFAULT_COMPETITOR_ASIN = "B0DQDWV1SV"
DEFAULT_COMPETITOR_BRAND = "Axgatoxe"
COMPETITOR_ASIN = (os.environ.get("WPR_COMPETITOR_ASIN") or DEFAULT_COMPETITOR_ASIN).strip()
COMPETITOR_BRAND = (os.environ.get("WPR_COMPETITOR_BRAND") or DEFAULT_COMPETITOR_BRAND).strip()
COMPETITOR_CONFIG_SOURCE = (
    "env_override"
    if (
        (os.environ.get("WPR_COMPETITOR_ASIN") or "").strip()
        or (os.environ.get("WPR_COMPETITOR_BRAND") or "").strip()
    )
    else "default"
)


def parse_float(value: object) -> float:
    text = str(value or "").strip().replace(",", "")
    if not text or text in {"-", "None", "nan"}:
        return 0.0
    if text.endswith("%"):
        text = text[:-1]
    try:
        return float(text)
    except ValueError:
        return 0.0


def safe_div(numerator: float, denominator: float) -> float:
    return numerator / denominator if denominator else 0.0


def slugify(value: str) -> str:
    lowered = value.lower()
    lowered = re.sub(r"[^a-z0-9]+", "-", lowered)
    lowered = re.sub(r"-{2,}", "-", lowered).strip("-")
    return lowered or "cluster"


def clamp(value: float, lower: float, upper: float) -> float:
    return max(lower, min(value, upper))


def format_percent(value: float) -> str:
    return f"{value * 100:.1f}%"


def interpolate(sorted_values: list[float], position: float) -> float:
    if not sorted_values:
        return 0.0
    if len(sorted_values) == 1:
        return sorted_values[0]
    lower = int(math.floor(position))
    upper = int(math.ceil(position))
    lower = max(0, min(lower, len(sorted_values) - 1))
    upper = max(0, min(upper, len(sorted_values) - 1))
    if lower == upper:
        return sorted_values[lower]
    ratio = position - lower
    return sorted_values[lower] + (sorted_values[upper] - sorted_values[lower]) * ratio


def mean_or_none(values: list[float]) -> float | None:
    return mean(values) if values else None


def detect_week_folder(path: Path) -> tuple[int, str, str]:
    relative = path.relative_to(DATA_ROOT)
    match = WEEK_DIR_RE.match(relative.parts[0])
    if not match:
        raise ValueError(f"Unrecognized week folder: {relative.parts[0]}")
    week_number = int(match.group(1))
    start_date = match.group(2)
    return week_number, f"W{week_number:02d}", start_date


def normalize_token(token: str) -> str:
    direct_map = {
        "canva": "canvas",
        "clothe": "cloth",
        "deop": "drop",
        "platic": "plastic",
        "panting": "painting",
        "paintet": "painter",
        "voering": "covering",
        "painters": "painter",
        "painters'": "painter",
        "painter's": "painter",
        "cloths": "cloth",
        "covers": "cover",
        "coverings": "covering",
        "sheets": "sheet",
        "tarps": "tarp",
        "supplies": "supply",
        "protectors": "protector",
        "dropcloth": "dropcloth",
        "dropcloths": "dropcloth",
    }
    if token in direct_map:
        return direct_map[token]
    if token.endswith("ies") and len(token) > 4:
        return token[:-3] + "y"
    if token.endswith("s") and len(token) > 4 and not token.endswith(("ss", "us", "is")):
        return token[:-1]
    return token


def normalize_text(value: str) -> str:
    text = (value or "").lower().strip()
    replacements = {
        "dropcloths": "drop cloths",
        "dropcloth": "drop cloth",
        "painter's": "painter",
        "painters'": "painter",
        "&": " and ",
        "/": " ",
        "+": " ",
    }
    for old, new in replacements.items():
        text = text.replace(old, new)
    text = re.sub(r"[^a-z0-9]+", " ", text)
    tokens = [normalize_token(token) for token in text.split() if token]
    return " ".join(tokens)


def token_set(value: str) -> set[str]:
    return set(normalize_text(value).split())


def has_all(tokens: set[str], *items: str) -> bool:
    return all(item in tokens for item in items)


def has_any(tokens: set[str], *items: str) -> bool:
    return any(item in tokens for item in items)


def phrase_in(text: str, phrase: str) -> bool:
    padded_text = f" {text} "
    padded_phrase = f" {phrase} "
    return padded_phrase in padded_text


def assign_cluster(term: str) -> tuple[str, str]:
    text = normalize_text(term)
    tokens = token_set(term)

    if has_all(tokens, "dust", "barrier", "plastic"):
        return "Plastic", "Dust Barrier Plastic Sheeting"
    if has_all(tokens, "construction", "plastic", "dust"):
        return "Plastic", "Dust Barrier Plastic Sheeting"

    if "floor" in tokens:
        if has_any(tokens, "cover", "covering", "protector", "protection", "paint", "painting", "painter", "tarp", "plastic"):
            return "Floor", "Floor Covering for Painting"

    if "furniture" in tokens:
        if has_any(tokens, "cover", "covering", "protector", "protection", "dust", "drop", "cloth", "plastic", "tarp"):
            return "Furniture", "Plastic Covers for Furniture"
    if has_all(tokens, "dust", "cover"):
        return "Furniture", "Plastic Covers for Furniture"
    if has_all(tokens, "dust", "cloth"):
        return "Furniture", "Plastic Covers for Furniture"

    if "tarp" in tokens:
        if has_any(tokens, "paint", "painting", "painter"):
            return "Tarp", "Paint Tarp"
        if has_any(tokens, "clear", "plastic", "vinyl"):
            return "Tarp", "Clear Tarp"
        return "Tarp", "Clear Tarp"

    if has_all(tokens, "plastic", "sheeting"):
        return "Plastic", "Plastic Sheeting for Painting"
    if has_all(tokens, "plastic", "sheet"):
        return "Plastic", "Plastic Sheeting for Painting"
    if phrase_in(text, "painter plastic sheeting"):
        return "Plastic", "Plastic Sheeting for Painting"

    if has_all(tokens, "plastic", "cover"):
        if has_any(tokens, "paint", "painting", "painter", "protect", "protection", "wall", "construction"):
            return "Plastic", "Plastic Cover for Painting"
    if has_all(tokens, "paint", "cover"):
        return "Plastic", "Plastic Cover for Painting"
    if has_all(tokens, "painting", "cover"):
        return "Plastic", "Plastic Cover for Painting"
    if has_all(tokens, "cover", "painting"):
        return "Plastic", "Plastic Cover for Painting"
    if has_all(tokens, "plastic", "covering"):
        if has_any(tokens, "paint", "painting", "painter", "protect", "protection", "construction"):
            return "Plastic", "Plastic Cover for Painting"
        return "Furniture", "Plastic Covers for Furniture"

    if has_all(tokens, "plastic", "drop", "cloth"):
        return "Drop Cloth", "Plastic Drop Cloth"
    if phrase_in(text, "drop cloth plastic"):
        return "Drop Cloth", "Plastic Drop Cloth"
    if phrase_in(text, "painting drop cloth plastic"):
        return "Drop Cloth", "Plastic Drop Cloth"
    if phrase_in(text, "plastic paint drop cloth"):
        return "Drop Cloth", "Plastic Drop Cloth"
    if phrase_in(text, "paint drop cloth plastic"):
        return "Drop Cloth", "Plastic Drop Cloth"
    if phrase_in(text, "paint plastic drop cloth"):
        return "Drop Cloth", "Plastic Drop Cloth"
    if phrase_in(text, "painter plastic drop cloth"):
        return "Drop Cloth", "Plastic Drop Cloth"
    if phrase_in(text, "plastic painter drop cloth"):
        return "Drop Cloth", "Plastic Drop Cloth"

    if has_all(tokens, "paint", "drop", "cloth"):
        return "Drop Cloth", "Paint Drop Cloth"
    if phrase_in(text, "paint cloth drop cloth"):
        return "Drop Cloth", "Paint Drop Cloth"

    if has_all(tokens, "painter", "drop", "cloth"):
        return "Drop Cloth", "Painters Drop Cloth"
    if phrase_in(text, "painter cloth drop cloth"):
        return "Drop Cloth", "Painters Drop Cloth"

    if has_all(tokens, "drop", "cloth"):
        if has_any(tokens, "paint", "painting"):
            return "Drop Cloth", "Drop Cloth for Painting"
        return "Drop Cloth", "Drop Cloth"

    if has_all(tokens, "plastic", "painter"):
        return "Plastic", "Painters Plastic"
    if has_all(tokens, "plastic", "painting"):
        return "Plastic", "Painters Plastic"
    if has_all(tokens, "plastic", "paint"):
        return "Plastic", "Painters Plastic"
    if "plastic" in tokens:
        return "Plastic", "Painters Plastic"

    if has_any(tokens, "paint", "painting", "painter") and has_any(tokens, "cover", "covering", "protector", "protection"):
        return "Plastic", "Plastic Cover for Painting"
    return "Other", "Unclustered"


def should_skip_ppc_term(term: str) -> bool:
    compact = term.replace(" ", "")
    if not compact:
        return True
    if ASIN_RE.fullmatch(compact):
        return True
    return not re.search(r"[a-z]", compact)


WEEK_FOLDER_GLOBS = ("Week * (Sun)", "Week * (Sun) (Partial)")
WEEK_FOLDER_PREFIX = "Week * (Sun)/"


def discover_week_folders_by_label() -> dict[str, Path]:
    candidates: list[Path] = []
    for pattern in WEEK_FOLDER_GLOBS:
        candidates.extend(path for path in DATA_ROOT.glob(pattern) if path.is_dir())
    ordered = sorted(
        candidates,
        key=lambda path: (
            detect_week_folder(path)[0],
            1 if "(Partial)" in path.name else 0,
        ),
    )
    folders: dict[str, Path] = {}
    for folder in ordered:
        _, week_label, _ = detect_week_folder(folder)
        folders.setdefault(week_label, folder)
    return folders


def discover_files(pattern: str) -> list[Path]:
    if pattern.startswith(WEEK_FOLDER_PREFIX):
        suffix = pattern[len(WEEK_FOLDER_PREFIX) :]
        paths: list[Path] = []
        for folder in discover_week_folders_by_label().values():
            paths.extend(folder.glob(suffix))
        return sorted(path for path in paths if path.is_file())
    paths = sorted(DATA_ROOT.glob(pattern))
    return [path for path in paths if path.is_file()]


SOURCE_TYPES: list[dict[str, str]] = [
    {"group": "Brand Analytics", "name": "SQP", "pattern": "Brand Analytics (API)/SQP - Search Query Performance (API)"},
    {"group": "Brand Analytics", "name": "TST", "pattern": "Brand Analytics (API)/TST - Top Search Terms (API)"},
    {"group": "Brand Analytics", "name": "SCP", "pattern": "Brand Analytics (API)/SCP - Search Catalog Performance (API)"},
    {"group": "Ad Console", "name": "SP Search Term", "pattern": "Ad Console/SP - Sponsored Products (API)/SP - Search Term Report (API)"},
    {"group": "Ad Console", "name": "SP Advertised Product", "pattern": "Ad Console/SP - Sponsored Products (API)/SP - Advertised Product Report (API)"},
    {"group": "Ad Console", "name": "SP Campaign", "pattern": "Ad Console/SP - Sponsored Products (API)/SP - Campaign Report (API)"},
    {"group": "Ad Console", "name": "SP Placement", "pattern": "Ad Console/SP - Sponsored Products (API)/SP - Placement Report (API)"},
    {"group": "Ad Console", "name": "SP Purchased Product", "pattern": "Ad Console/SP - Sponsored Products (API)/SP - Purchased Product Report (API)"},
    {"group": "Ad Console", "name": "SP Targeting", "pattern": "Ad Console/SP - Sponsored Products (API)/SP - Targeting Report (API)"},
    {"group": "Ad Console", "name": "Brand Metrics", "pattern": "Ad Console/Brand Metrics (Browser)"},
    {"group": "Datadive", "name": "Rank Radar", "pattern": "Datadive (API)/Rank Radar - Datadive Rank Radar (API)"},
    {"group": "Datadive", "name": "DD-Keywords", "pattern": "Datadive (API)/DD-Keywords - Datadive Keywords (API)"},
    {"group": "Datadive", "name": "DD-Competitors", "pattern": "Datadive (API)/DD-Competitors - Datadive Competitors (API)"},
    {"group": "ScaleInsights", "name": "Keyword Ranking", "pattern": "ScaleInsights/KeywordRanking (Browser)"},
    {"group": "Business Reports", "name": "Sales & Traffic", "pattern": "Business Reports (API)/Sales & Traffic (API)"},
    {"group": "Sellerboard", "name": "SB Dashboard", "pattern": "Sellerboard (API)/SB - Dashboard Report (API)"},
    {"group": "Sellerboard", "name": "SB Orders", "pattern": "Sellerboard (API)/SB - Orders Report (API)"},
    {"group": "Other", "name": "POE", "pattern": "Product Opportunity Explorer (Browser)"},
    {"group": "Other", "name": "Category Insights", "pattern": "Category Insights (Browser)"},
    {"group": "Other", "name": "Account Health", "pattern": "Account Health Dashboard (API)"},
    {"group": "Other", "name": "Listing Attributes", "pattern": "Listing Attributes (API)"},
    {"group": "Other", "name": "Voice of Customer", "pattern": "Voice of the Customer (Manual)"},
]

CRITICAL_SOURCES = {"SQP", "Rank Radar", "SP Search Term"}

MEANINGFUL_CHANGE_FIELDS = {
    "status",
    "title",
    "brand",
    "manufacturer",
    "model_number",
    "product_type",
    "item_classification",
    "color",
    "size",
    "material",
    "variation_theme",
    "bullet_points",
    "description",
    "backend_terms",
    "image_count",
    "image_urls",
    "landed_price",
    "listing_price",
    "shipping_price",
    "list_price",
    "buy_box_landed_price",
    "buy_box_listing_price",
    "buy_box_shipping_price",
    "total_offer_count",
    "offers_any",
    "offers_new",
    "offers_fba",
    "offers_mfn",
    "buybox_eligible_offer_count",
    "buybox_winner_seller_id",
    "buybox_winner_is_fba",
    "buybox_winner_is_prime",
    "buybox_winner_is_featured",
    "own_offer_b2c_price",
    "own_offer_b2b_price",
    "own_offer_types",
    "own_offer_audiences",
    "own_fulfillment_channels",
    "own_issue_codes",
    "parent_asins",
    "child_asins",
    "related_asins",
}

PRICE_CHANGE_FIELDS = {
    "landed_price",
    "listing_price",
    "shipping_price",
    "list_price",
    "buy_box_landed_price",
    "buy_box_listing_price",
    "buy_box_shipping_price",
    "own_offer_b2c_price",
    "own_offer_b2b_price",
}

MEDIA_CHANGE_FIELDS = {"image_count", "image_urls"}
CONTENT_CHANGE_FIELDS = {"title", "bullet_points", "description", "backend_terms"}
CATALOG_CHANGE_FIELDS = {
    "status",
    "brand",
    "manufacturer",
    "model_number",
    "product_type",
    "item_classification",
    "color",
    "size",
    "material",
    "variation_theme",
    "parent_asins",
    "child_asins",
    "related_asins",
}
OFFER_CHANGE_FIELDS = {
    "total_offer_count",
    "offers_any",
    "offers_new",
    "offers_fba",
    "offers_mfn",
    "buybox_eligible_offer_count",
    "buybox_winner_seller_id",
    "buybox_winner_is_fba",
    "buybox_winner_is_prime",
    "buybox_winner_is_featured",
    "own_offer_types",
    "own_offer_audiences",
    "own_fulfillment_channels",
    "own_issue_codes",
}

CHANGE_FIELD_LABELS = {
    "status": "Status",
    "title": "Title",
    "brand": "Brand",
    "manufacturer": "Manufacturer",
    "model_number": "Model number",
    "product_type": "Product type",
    "item_classification": "Item classification",
    "color": "Color",
    "size": "Size",
    "material": "Material",
    "variation_theme": "Variation theme",
    "bullet_points": "Bullet points",
    "description": "Description",
    "backend_terms": "Backend terms",
    "image_count": "Image count",
    "image_urls": "Images",
    "landed_price": "Landed price",
    "listing_price": "Listing price",
    "shipping_price": "Shipping price",
    "list_price": "List price",
    "buy_box_landed_price": "Buy box landed price",
    "buy_box_listing_price": "Buy box listing price",
    "buy_box_shipping_price": "Buy box shipping price",
    "total_offer_count": "Offer count",
    "offers_any": "Any offers",
    "offers_new": "New offers",
    "offers_fba": "FBA offers",
    "offers_mfn": "MFN offers",
    "buybox_eligible_offer_count": "Buy box eligible offers",
    "buybox_winner_seller_id": "Buy box winner",
    "buybox_winner_is_fba": "Buy box FBA",
    "buybox_winner_is_prime": "Buy box Prime",
    "buybox_winner_is_featured": "Buy box featured",
    "own_offer_b2c_price": "Our B2C price",
    "own_offer_b2b_price": "Our B2B price",
    "own_offer_types": "Our offer types",
    "own_offer_audiences": "Our offer audiences",
    "own_fulfillment_channels": "Fulfillment channels",
    "own_issue_codes": "Issue codes",
    "parent_asins": "Parent ASINs",
    "child_asins": "Child ASINs",
    "related_asins": "Related ASINs",
}

SAMPLE_RECENT_WEEKS = 4
SQP_FIELDS = (
    "market_impressions",
    "asin_impressions",
    "market_clicks",
    "asin_clicks",
    "market_cart_adds",
    "asin_cart_adds",
    "market_purchases",
    "asin_purchases",
    "query_volume",
)
PPC_FIELDS = (
    "ppc_impressions",
    "ppc_clicks",
    "ppc_spend",
    "ppc_sales",
    "ppc_orders",
)
SCP_FIELDS = (
    "impressions",
    "clicks",
    "cart_adds",
    "purchases",
    "sales",
)
BUSINESS_REPORT_SUM_FIELDS = (
    "sessions",
    "page_views",
    "order_items",
    "units_ordered",
    "sales",
    "buy_box_page_views_weighted",
)


def detect_target_asin_from_sqp_files() -> str:
    asins: set[str] = set()
    for path in discover_files("Week * (Sun)/input/Brand Analytics (API)/SQP - Search Query Performance (API)/*.csv"):
        with path.open(newline="", encoding="utf-8-sig") as handle:
            reader = csv.DictReader(handle)
            for row in reader:
                asin = str(row.get("asin", "")).strip()
                if asin:
                    asins.add(asin)
    if len(asins) != 1:
        raise ValueError(f"Expected exactly one target SQP ASIN, found {sorted(asins)}")
    return next(iter(asins))


def make_term_info() -> dict[str, object]:
    return {
        "family": "",
        "cluster": "",
        "weeks_sqp": set(),
        "weeks_rank": set(),
        "weeks_ppc": set(),
        "has_sqp": False,
        "has_rank": False,
        "has_ppc": False,
    }


def ensure_term_info(
    term_info: dict[str, dict[str, object]],
    term: str,
    family: str,
    cluster: str,
) -> dict[str, object]:
    info = term_info.setdefault(term, make_term_info())
    if not info["family"]:
        info["family"] = family
    if not info["cluster"]:
        info["cluster"] = cluster
    return info


def make_rank_term_week() -> dict[str, object]:
    return {"ranks": [], "search_volume": 0.0}


def scan_sources(week_meta: dict[str, dict[str, object]]) -> dict[str, object]:
    matrix: list[dict[str, object]] = []
    week_folders = list(discover_week_folders_by_label().values())
    week_labels: list[str] = []
    weeks_with_data: list[str] = []

    for folder in week_folders:
        match = WEEK_DIR_RE.match(folder.name)
        if not match:
            continue
        week_number = int(match.group(1))
        week_label = f"W{week_number:02d}"
        week_labels.append(week_label)
        input_dir = folder / "input"
        has_any = False

        for source_type in SOURCE_TYPES:
            source_dir = input_dir / source_type["pattern"]
            files = []
            if source_dir.is_dir():
                files = [
                    f for f in source_dir.iterdir()
                    if f.is_file() and f.suffix in {".csv", ".xlsx", ".json", ".txt"}
                    and not f.name.startswith(".")
                ]
            entry = next(
                (item for item in matrix if item["name"] == source_type["name"]),
                None,
            )
            if entry is None:
                entry = {"group": source_type["group"], "name": source_type["name"], "weeks": {}}
                matrix.append(entry)
            entry["weeks"][week_label] = {
                "present": len(files) > 0,
                "file_count": len(files),
                "files": [f.name for f in files[:3]],
            }
            if files:
                has_any = True

        if has_any:
            weeks_with_data.append(week_label)

    latest_week = weeks_with_data[-1] if weeks_with_data else ""
    latest_present = 0
    latest_total = len(SOURCE_TYPES)
    critical_gaps: list[str] = []

    if latest_week:
        for entry in matrix:
            week_data = entry["weeks"].get(latest_week, {})
            if week_data.get("present"):
                latest_present += 1
            elif entry["name"] in CRITICAL_SOURCES:
                critical_gaps.append(entry["name"])

    return {
        "week_labels": week_labels,
        "weeks_with_data": len(weeks_with_data),
        "latest_week": latest_week,
        "source_completeness": f"{latest_present}/{latest_total}",
        "critical_gaps": critical_gaps,
        "matrix": matrix,
    }


def parse_iso_datetime(value: str) -> datetime | None:
    text = value.strip()
    if text == "":
        return None
    normalized = text
    if normalized.endswith("Z"):
        normalized = normalized[:-1] + "+00:00"
    try:
        return datetime.fromisoformat(normalized)
    except ValueError:
        return None


def format_change_log_date_label(value: datetime | str) -> str:
    if isinstance(value, datetime):
        date_value = value.date()
    else:
        timestamp_value = parse_iso_datetime(value)
        if timestamp_value is not None:
            date_value = timestamp_value.date()
        else:
            date_value = date.fromisoformat(value)
    return date_value.strftime("%d %b %Y (%A)")


def format_chart_day_label(value: date | str) -> str:
    if isinstance(value, date):
        date_value = value
    else:
        date_value = date.fromisoformat(value)
    return date_value.strftime("%d %b")


def format_chart_day_weekday(value: date | str) -> str:
    if isinstance(value, date):
        date_value = value
    else:
        date_value = date.fromisoformat(value)
    return date_value.strftime("%a")


def normalize_change_log_day(value: str) -> str:
    timestamp_value = parse_iso_datetime(value)
    if timestamp_value is not None:
        return timestamp_value.date().isoformat()
    return date.fromisoformat(value).isoformat()


def infer_week_from_timestamp(timestamp_value: datetime, week_meta: dict[str, dict[str, object]]) -> tuple[str, int]:
    ordered_weeks = sorted(
        (
            (label, int(meta["week_number"]), date.fromisoformat(str(meta["start_date"])))
             for label, meta in week_meta.items()
        ),
        key=lambda item: item[1],
    )
    timestamp_date = timestamp_value.date()
    selected_label = ordered_weeks[0][0]
    selected_number = ordered_weeks[0][1]
    for label, week_number, start_date_value in ordered_weeks:
        if start_date_value <= timestamp_date:
            selected_label = label
            selected_number = week_number
    return selected_label, selected_number


def classify_change_fields(fields: list[str]) -> str:
    field_set = set(fields)
    if field_set.issubset(PRICE_CHANGE_FIELDS):
        return "Pricing"
    if field_set.issubset(MEDIA_CHANGE_FIELDS):
        return "Images"
    if field_set.issubset(CONTENT_CHANGE_FIELDS):
        return "Content"
    if field_set.issubset(CATALOG_CHANGE_FIELDS):
        return "Catalog"
    if field_set.issubset(OFFER_CHANGE_FIELDS):
        return "Offer"
    return "Mixed"


def build_listing_change_title(category: str, fields: list[str], asin_count: int) -> str:
    if category == "Catalog" and set(fields) == {"product_type"}:
        title = "Product type change"
    elif category == "Images":
        title = "Image update"
    elif category == "Pricing":
        title = "Price update"
    elif category == "Offer":
        title = "Offer / buy box update"
    elif category == "Content":
        title = "Content update"
    elif category == "Catalog":
        title = "Catalog attribute update"
    else:
        title = "Listing change"
    if asin_count > 1:
        title += f" across {asin_count} ASINs"
    return title


def summarize_field_labels(fields: list[str], limit: int = 5) -> str:
    labels = [CHANGE_FIELD_LABELS.get(field, field.replace("_", " ").title()) for field in fields]
    visible = labels[:limit]
    if len(labels) > limit:
        visible.append(f"+{len(labels) - limit} more")
    return ", ".join(visible)


def load_listing_change_entries(week_meta: dict[str, dict[str, object]]) -> list[dict[str, object]]:
    aggregated: dict[tuple[str, tuple[str, ...]], dict[str, object]] = {}
    for path in discover_files("Week * (Sun)/input/Listing Attributes (API)/Listings-Changes-History.csv"):
        with path.open(newline="", encoding="utf-8-sig") as handle:
            reader = csv.DictReader(handle)
            for row in reader:
                owner_type = row.get("owner_type", "").strip()
                changed = row.get("changed", "").strip()
                if owner_type != "our":
                    continue
                if changed != "yes":
                    continue
                timestamp_text = row.get("snapshot_timestamp_utc", "").strip()
                if timestamp_text == "":
                    continue
                timestamp_value = parse_iso_datetime(timestamp_text)
                if timestamp_value is None:
                    continue
                raw_fields = [item.strip() for item in row.get("changed_fields", "").split(",") if item.strip()]
                normalized_fields = []
                for item in raw_fields:
                    field_name = item.removesuffix("_changed")
                    if field_name in MEANINGFUL_CHANGE_FIELDS:
                        normalized_fields.append(field_name)
                if not normalized_fields:
                    continue
                unique_fields = sorted(set(normalized_fields))
                key = (timestamp_text, tuple(unique_fields))
                existing = aggregated.get(key)
                if existing is None:
                    week_label, week_number = infer_week_from_timestamp(timestamp_value, week_meta)
                    aggregated[key] = {
                        "kind": "listing",
                        "source": "Listing Attributes",
                        "timestamp": timestamp_text,
                        "timestamp_dt": timestamp_value,
                        "week_label": week_label,
                        "week_number": week_number,
                        "category": classify_change_fields(unique_fields),
                        "fields": unique_fields,
                        "asins": set(),
                    }
                    existing = aggregated[key]
                asin = row.get("asin", "").strip()
                if asin != "":
                    existing["asins"].add(asin)

    entries: list[dict[str, object]] = []
    for key, item in aggregated.items():
        fields = list(item["fields"])
        asins = sorted(item["asins"])
        title = build_listing_change_title(str(item["category"]), fields, len(asins))
        entries.append(
            {
                "id": slugify(f"listing-{item['timestamp']}-{title}"),
                "kind": "listing",
                "source": "Listing Attributes",
                "week_label": item["week_label"],
                "week_number": item["week_number"],
                "timestamp": item["timestamp"],
                "date_label": format_change_log_date_label(item["timestamp_dt"]),
                "title": title,
                "summary": summarize_field_labels(fields),
                "category": item["category"],
                "asins": asins,
                "field_labels": [CHANGE_FIELD_LABELS.get(field, field.replace("_", " ").title()) for field in fields],
            }
        )
    entries.sort(key=lambda entry: entry["timestamp"], reverse=True)
    return entries


def parse_markdown_change_log(path: Path, week_meta: dict[str, dict[str, object]]) -> dict[str, object]:
    week_number, week_label, start_date_text = detect_week_folder(path)
    text = path.read_text(encoding="utf-8")
    lines = text.splitlines()

    def match_metadata(label: str) -> str | None:
        pattern = rf"^{re.escape(label)}:\s*(.+)$"
        for line in lines:
            stripped = line.strip()
            match = re.match(pattern, stripped, flags=re.IGNORECASE)
            if match is not None:
                return match.group(1).strip()
        return None

    def extract_section(name: str) -> list[str]:
        inside = False
        section_lines: list[str] = []
        for line in lines:
            stripped = line.strip()
            if stripped == f"## {name}":
                inside = True
                continue
            if inside and stripped.startswith("## "):
                break
            if inside:
                section_lines.append(line.rstrip())
        return section_lines

    title = path.stem.replace("_", " ")
    for line in lines:
        stripped = line.strip()
        if stripped.startswith("# "):
            title = stripped[2:].strip()
            break

    date_label = start_date_text
    entry_date = match_metadata("Entry date")
    if entry_date is not None and re.match(r"^\d{4}-\d{2}-\d{2}$", entry_date):
        date_label = entry_date
    else:
        week_ending = match_metadata("Week ending")
        if week_ending is not None and re.match(r"^\d{4}-\d{2}-\d{2}$", week_ending):
            date_label = week_ending

    summary = ""
    change_summary_lines = extract_section("Change Summary")
    for line in change_summary_lines:
        stripped = line.strip()
        if stripped == "":
            if summary != "":
                break
            continue
        summary += (" " if summary != "" else "") + stripped

    observed_lines = extract_section("What Changed (Observed)")
    observed_bullets = []
    for line in observed_lines:
        stripped = line.strip()
        if stripped.startswith("- "):
            observed_bullets.append(stripped[2:].strip())
        elif re.match(r"^\d+\.\s+", stripped):
            observed_bullets.append(re.sub(r"^\d+\.\s+", "", stripped))

    if summary == "" and observed_bullets:
        summary = " | ".join(observed_bullets[:2])
    if summary == "":
        for line in lines:
            stripped = line.strip()
            if stripped == "":
                continue
            if stripped.startswith("#"):
                continue
            if stripped.startswith("- "):
                summary = stripped[2:].strip()
                break

    highlights = observed_bullets[:4]
    if not highlights:
        for line in lines:
            stripped = line.strip()
            if stripped.startswith("- ["):
                continue
            if stripped.startswith("- "):
                highlights.append(stripped[2:].strip())
            elif re.match(r"^\d+\.\s+", stripped):
                highlights.append(re.sub(r"^\d+\.\s+", "", stripped))
            if len(highlights) >= 4:
                break

    asin_metadata = match_metadata("ASINs")
    if asin_metadata is not None:
        asins = [asin.strip().upper() for asin in asin_metadata.split(",") if asin.strip()]
    else:
        asins = sorted(set(re.findall(r"B0[A-Z0-9]{8}", text, flags=re.IGNORECASE)))

    field_labels = []
    field_metadata = match_metadata("Fields")
    if field_metadata is not None and field_metadata != "—":
        field_labels = [field.strip() for field in field_metadata.split(",") if field.strip()]

    source = match_metadata("Source")
    if source is None:
        source = "Plan Log"

    category = match_metadata("Type")
    if category is None:
        category = "Manual"
    return {
        "id": slugify(f"manual-{week_label}-{title}"),
        "kind": "manual",
        "source": source,
        "week_label": week_label,
        "week_number": week_number,
        "timestamp": date_label,
        "date_label": format_change_log_date_label(date_label),
        "title": title,
        "summary": summary,
        "category": category,
        "asins": asins,
        "field_labels": field_labels,
        "highlights": highlights,
    }


def load_manual_change_logs(week_meta: dict[str, dict[str, object]]) -> list[dict[str, object]]:
    entries = []
    for path in discover_files("Week * (Sun)/output/Plans/*Log*.md"):
        entries.append(parse_markdown_change_log(path, week_meta))
    entries.sort(key=lambda entry: str(entry["timestamp"]), reverse=True)
    return entries


def build_change_log_by_week(week_order: list[str], week_meta: dict[str, dict[str, object]]) -> dict[str, list[dict[str, object]]]:
    entries = load_listing_change_entries(week_meta) + load_manual_change_logs(week_meta)
    entries.sort(key=lambda entry: str(entry["timestamp"]), reverse=True)
    by_week: dict[str, list[dict[str, object]]] = {}
    for anchor_week in week_order:
        anchor_number = int(week_meta[anchor_week]["week_number"])
        by_week[anchor_week] = [
            entry
            for entry in entries
            if int(entry["week_number"]) <= anchor_number
        ]
    return by_week


def load_sqp(
    cluster_week: dict[tuple[str, str, str], dict[str, float]],
    cluster_terms: dict[tuple[str, str], set[str]],
    term_rollup: dict[str, dict[str, float]],
    week_meta: dict[str, dict[str, object]],
    term_info: dict[str, dict[str, object]] | None = None,
    sqp_term_week: dict[tuple[str, str], dict[str, float]] | None = None,
) -> None:
    for path in discover_files("Week * (Sun)/input/Brand Analytics (API)/SQP - Search Query Performance (API)/*.csv"):
        week_number, week_label, start_date = detect_week_folder(path)
        week_meta.setdefault(
            week_label,
            {"week_number": week_number, "week_label": week_label, "start_date": start_date},
        )
        with path.open(newline="", encoding="utf-8-sig") as handle:
            reader = csv.DictReader(handle)
            for row in reader:
                term = normalize_text(row.get("searchQueryData.searchQuery", ""))
                if not term:
                    continue
                family, cluster = assign_cluster(term)
                cluster_terms[(family, cluster)].add(term)
                if term_info is not None:
                    info = ensure_term_info(term_info, term, family, cluster)
                    info["weeks_sqp"].add(week_label)
                    info["has_sqp"] = True
                metrics = cluster_week[(week_label, family, cluster)]
                market_impressions = parse_float(row.get("impressionData.totalQueryImpressionCount"))
                asin_impressions = parse_float(row.get("impressionData.asinImpressionCount"))
                market_clicks = parse_float(row.get("clickData.totalClickCount"))
                market_purchases = parse_float(row.get("purchaseData.totalPurchaseCount"))
                asin_clicks = parse_float(row.get("clickData.asinClickCount"))
                asin_purchases = parse_float(row.get("purchaseData.asinPurchaseCount"))
                market_cart_adds = parse_float(row.get("cartAddData.totalCartAddCount"))
                asin_cart_adds = parse_float(row.get("cartAddData.asinCartAddCount"))
                metrics["market_impressions"] += market_impressions
                metrics["asin_impressions"] += asin_impressions
                metrics["market_clicks"] += market_clicks
                metrics["market_purchases"] += market_purchases
                metrics["asin_clicks"] += asin_clicks
                metrics["asin_purchases"] += asin_purchases
                metrics["market_cart_adds"] += market_cart_adds
                metrics["asin_cart_adds"] += asin_cart_adds
                metrics["query_volume"] += parse_float(row.get("searchQueryData.searchQueryVolume"))
                if sqp_term_week is not None:
                    weekly = sqp_term_week[(week_label, term)]
                    weekly["market_impressions"] += market_impressions
                    weekly["asin_impressions"] += asin_impressions
                    weekly["market_clicks"] += market_clicks
                    weekly["market_purchases"] += market_purchases
                    weekly["asin_clicks"] += asin_clicks
                    weekly["asin_purchases"] += asin_purchases
                    weekly["market_cart_adds"] += market_cart_adds
                    weekly["asin_cart_adds"] += asin_cart_adds
                    weekly["query_volume"] += parse_float(row.get("searchQueryData.searchQueryVolume"))
                rollup = term_rollup[term]
                rollup["market_impressions"] += market_impressions
                rollup["asin_impressions"] += asin_impressions
                rollup["market_purchases"] += market_purchases
                rollup["asin_purchases"] += asin_purchases
                rollup["market_clicks"] += market_clicks
                rollup["asin_clicks"] += asin_clicks
                rollup["market_cart_adds"] += market_cart_adds
                rollup["asin_cart_adds"] += asin_cart_adds
                rollup["query_volume"] += parse_float(row.get("searchQueryData.searchQueryVolume"))
                rollup["family"] = family
                rollup["cluster"] = cluster


def load_rank_radar(
    cluster_week: dict[tuple[str, str, str], dict[str, float]],
    cluster_terms: dict[tuple[str, str], set[str]],
    term_rollup: dict[str, dict[str, float]],
    week_meta: dict[str, dict[str, object]],
    term_info: dict[str, dict[str, object]] | None = None,
    rank_term_week_detail: dict[tuple[str, str], dict[str, object]] | None = None,
) -> None:
    rank_term_week: dict[tuple[str, str], dict[str, object]] = defaultdict(make_rank_term_week)
    for path in discover_files("Week * (Sun)/input/Datadive (API)/Rank Radar - Datadive Rank Radar (API)/*.csv"):
        week_number, week_label, start_date = detect_week_folder(path)
        week_meta.setdefault(
            week_label,
            {"week_number": week_number, "week_label": week_label, "start_date": start_date},
        )
        with path.open(newline="", encoding="utf-8-sig") as handle:
            reader = csv.DictReader(handle)
            for row in reader:
                term = normalize_text(row.get("Keyword", ""))
                if not term:
                    continue
                rank_text = str(row.get("Organic Rank", "") or "").strip()
                if not rank_text:
                    continue
                if rank_text == "97+":
                    rank_value = 97.0
                else:
                    rank_value = parse_float(rank_text)
                if not rank_value:
                    continue
                payload = rank_term_week[(week_label, term)]
                payload["ranks"].append(rank_value)
                payload["search_volume"] = max(payload["search_volume"], parse_float(row.get("Search Volume")))
                family, cluster = assign_cluster(term)
                if term_info is not None:
                    info = ensure_term_info(term_info, term, family, cluster)
                    info["weeks_rank"].add(week_label)
                    info["has_rank"] = True
                term_rollup[term]["search_volume"] = max(term_rollup[term]["search_volume"], parse_float(row.get("Search Volume")))
                term_rollup[term]["family"] = family
                term_rollup[term]["cluster"] = cluster
                if rank_term_week_detail is not None:
                    detail = rank_term_week_detail[(week_label, term)]
                    detail["ranks"].append(rank_value)
                    detail["search_volume"] = max(float(detail["search_volume"]), parse_float(row.get("Search Volume")))

    for (week_label, term), payload in rank_term_week.items():
        ranks = payload["ranks"]
        if not ranks:
            continue
        family, cluster = assign_cluster(term)
        cluster_terms[(family, cluster)].add(term)
        metrics = cluster_week[(week_label, family, cluster)]
        weight = float(payload["search_volume"]) or float(len(ranks))
        avg_rank = mean(ranks)
        rank_span = max(ranks) - min(ranks)
        metrics["rank_weight"] += weight
        metrics["rank_sum"] += avg_rank * weight
        metrics["rank_span_sum"] += rank_span * weight
        metrics["rank_term_count"] += 1.0


def load_ppc(
    cluster_week: dict[tuple[str, str, str], dict[str, float]],
    cluster_terms: dict[tuple[str, str], set[str]],
    term_rollup: dict[str, dict[str, float]],
    week_meta: dict[str, dict[str, object]],
    term_info: dict[str, dict[str, object]] | None = None,
    ppc_term_week: dict[tuple[str, str], dict[str, float]] | None = None,
) -> None:
    for path in discover_files(
        "Week * (Sun)/input/Ad Console/SP - Sponsored Products (API)/SP - Search Term Report (API)/*.csv"
    ):
        week_number, week_label, start_date = detect_week_folder(path)
        week_meta.setdefault(
            week_label,
            {"week_number": week_number, "week_label": week_label, "start_date": start_date},
        )
        with path.open(newline="", encoding="utf-8-sig") as handle:
            reader = csv.DictReader(handle)
            for row in reader:
                term = normalize_text(row.get("searchTerm", ""))
                if should_skip_ppc_term(term):
                    continue
                family, cluster = assign_cluster(term)
                cluster_terms[(family, cluster)].add(term)
                if term_info is not None:
                    info = ensure_term_info(term_info, term, family, cluster)
                    info["weeks_ppc"].add(week_label)
                    info["has_ppc"] = True
                metrics = cluster_week[(week_label, family, cluster)]
                ppc_clicks = parse_float(row.get("clicks"))
                ppc_spend = parse_float(row.get("cost"))
                ppc_sales = parse_float(row.get("sales7d"))
                ppc_orders = parse_float(row.get("purchases7d"))
                metrics["ppc_impressions"] += parse_float(row.get("impressions"))
                metrics["ppc_clicks"] += ppc_clicks
                metrics["ppc_spend"] += ppc_spend
                metrics["ppc_sales"] += ppc_sales
                metrics["ppc_orders"] += ppc_orders
                if ppc_term_week is not None:
                    weekly = ppc_term_week[(week_label, term)]
                    weekly["ppc_impressions"] += parse_float(row.get("impressions"))
                    weekly["ppc_clicks"] += ppc_clicks
                    weekly["ppc_spend"] += ppc_spend
                    weekly["ppc_sales"] += ppc_sales
                    weekly["ppc_orders"] += ppc_orders
                rollup = term_rollup[term]
                rollup["ppc_spend"] += ppc_spend
                rollup["ppc_sales"] += ppc_sales
                rollup["family"] = family
                rollup["cluster"] = cluster


def load_brand_metrics(
    week_meta: dict[str, dict[str, object]],
) -> dict[str, dict[str, float]]:
    brand_metrics: dict[str, dict[str, float]] = {}
    for path in discover_files("Week * (Sun)/input/Ad Console/Brand Metrics (Browser)/*.csv"):
        file_week_number, file_week_label, file_start_date = detect_week_folder(path)
        with path.open(newline="", encoding="utf-8-sig") as handle:
            reader = csv.DictReader(handle)
            headers = reader.fieldnames
            if not headers:
                continue
            week_columns: list[str] = []
            for header in headers:
                if re.match(r"Week \d+", header):
                    week_columns.append(header)
            for row in reader:
                brand = (row.get("Brand") or "").strip()
                if brand != "Caelum Star":
                    continue
                stage = (row.get("Funnel Stage") or "").strip()
                stage_key = None
                if "Awareness" in stage and "Shoppers" in stage:
                    stage_key = "awareness"
                elif "Consideration" in stage and "Shoppers" in stage:
                    stage_key = "consideration"
                elif "Purchase" in stage and "Shoppers" in stage:
                    stage_key = "purchase"
                if not stage_key:
                    continue
                for col_header in week_columns:
                    value = parse_float(row.get(col_header))
                    col_match = re.match(r"Week (\d+)", col_header)
                    if not col_match:
                        continue
                    col_week_offset = int(col_match.group(1))
                    target_week_number = file_week_number - (len(week_columns) - col_week_offset)
                    target_label = f"W{target_week_number:02d}"
                    if target_label not in week_meta:
                        continue
                    if target_label not in brand_metrics:
                        brand_metrics[target_label] = {"awareness": 0.0, "consideration": 0.0, "purchase": 0.0}
                    brand_metrics[target_label][stage_key] = max(brand_metrics[target_label][stage_key], value)
    return brand_metrics


def make_scp_metrics() -> dict[str, float]:
    return {
        "impressions": 0.0,
        "clicks": 0.0,
        "cart_adds": 0.0,
        "purchases": 0.0,
        "sales": 0.0,
    }


def add_scp_metrics(target: dict[str, float], source: dict[str, float]) -> None:
    for field in SCP_FIELDS:
        target[field] += float(source[field])


def finalize_scp_metrics(metrics: dict[str, float]) -> dict[str, float]:
    finalized = {field: float(metrics[field]) for field in SCP_FIELDS}
    finalized["ctr"] = safe_div(finalized["clicks"], finalized["impressions"])
    finalized["atc_rate"] = safe_div(finalized["cart_adds"], finalized["clicks"])
    finalized["purchase_rate"] = safe_div(finalized["purchases"], finalized["cart_adds"])
    finalized["cvr"] = safe_div(finalized["purchases"], finalized["clicks"])
    return finalized


def make_business_report_metrics() -> dict[str, float]:
    return {
        "sessions": 0.0,
        "page_views": 0.0,
        "order_items": 0.0,
        "units_ordered": 0.0,
        "sales": 0.0,
        "buy_box_page_views_weighted": 0.0,
    }


def add_business_report_metrics(target: dict[str, float], source: dict[str, float]) -> None:
    for field in BUSINESS_REPORT_SUM_FIELDS:
        target[field] += float(source[field])


def finalize_business_report_metrics(metrics: dict[str, float]) -> dict[str, float]:
    finalized = {
        "sessions": float(metrics["sessions"]),
        "page_views": float(metrics["page_views"]),
        "order_items": float(metrics["order_items"]),
        "units_ordered": float(metrics["units_ordered"]),
        "sales": float(metrics["sales"]),
    }
    finalized["order_item_session_percentage"] = safe_div(finalized["order_items"], finalized["sessions"])
    finalized["unit_session_percentage"] = safe_div(finalized["units_ordered"], finalized["sessions"])
    finalized["buy_box_percentage"] = safe_div(
        float(metrics["buy_box_page_views_weighted"]),
        finalized["page_views"],
    )
    return finalized


def load_scp(
    week_meta: dict[str, dict[str, object]],
) -> dict[tuple[str, str], dict[str, float]]:
    scp_week_asin: dict[tuple[str, str], dict[str, float]] = defaultdict(make_scp_metrics)
    for path in discover_files("Week * (Sun)/input/Brand Analytics (API)/SCP - Search Catalog Performance (API)/*.csv"):
        week_number, week_label, start_date = detect_week_folder(path)
        week_meta.setdefault(
            week_label,
            {"week_number": week_number, "week_label": week_label, "start_date": start_date},
        )
        with path.open(newline="", encoding="utf-8-sig") as handle:
            reader = csv.DictReader(handle)
            for row in reader:
                asin = str(row.get("asin", "")).strip()
                if asin == "":
                    continue
                metrics = scp_week_asin[(week_label, asin)]
                metrics["impressions"] += parse_float(row.get("impressionData.impressionCount"))
                metrics["clicks"] += parse_float(row.get("clickData.clickCount"))
                metrics["cart_adds"] += parse_float(row.get("cartAddData.cartAddCount"))
                metrics["purchases"] += parse_float(row.get("purchaseData.purchaseCount"))
                metrics["sales"] += parse_float(row.get("purchaseData.searchTrafficSales.amount"))
    return scp_week_asin


def load_business_reports(
    week_meta: dict[str, dict[str, object]],
) -> dict[tuple[str, str], dict[str, float]]:
    business_week_asin: dict[tuple[str, str], dict[str, float]] = defaultdict(make_business_report_metrics)
    for path in discover_files("Week * (Sun)/input/Business Reports (API)/Sales & Traffic (API)/*ByAsin.csv"):
        week_number, week_label, start_date = detect_week_folder(path)
        week_meta.setdefault(
            week_label,
            {"week_number": week_number, "week_label": week_label, "start_date": start_date},
        )
        with path.open(newline="", encoding="utf-8-sig") as handle:
            reader = csv.DictReader(handle)
            for row in reader:
                asin = str(row["childAsin"]).strip()
                if asin == "":
                    continue
                page_views = parse_float(row["trafficByAsin.pageViews"])
                buy_box_percentage = parse_float(row["trafficByAsin.buyBoxPercentage"]) / 100.0
                metrics = business_week_asin[(week_label, asin)]
                metrics["sessions"] += parse_float(row["trafficByAsin.sessions"])
                metrics["page_views"] += page_views
                metrics["order_items"] += parse_float(row["salesByAsin.totalOrderItems"])
                metrics["units_ordered"] += parse_float(row["salesByAsin.unitsOrdered"])
                metrics["sales"] += parse_float(row["salesByAsin.orderedProductSales.amount"])
                metrics["buy_box_page_views_weighted"] += buy_box_percentage * page_views
    return business_week_asin


def load_business_reports_daily(
    week_meta: dict[str, dict[str, object]],
) -> dict[tuple[str, str], dict[str, float]]:
    business_day_metrics: dict[tuple[str, str], dict[str, float]] = defaultdict(make_business_report_metrics)
    for path in discover_files("Week * (Sun)/input/Business Reports (API)/Sales & Traffic (API)/*ByDate.csv"):
        week_number, week_label, start_date = detect_week_folder(path)
        week_meta.setdefault(
            week_label,
            {"week_number": week_number, "week_label": week_label, "start_date": start_date},
        )
        with path.open(newline="", encoding="utf-8-sig") as handle:
            reader = csv.DictReader(handle)
            for row in reader:
                day = str(row.get("date", "")).strip()
                if day == "":
                    continue
                page_views = parse_float(row.get("trafficByDate.pageViews"))
                buy_box_percentage = parse_float(row.get("trafficByDate.buyBoxPercentage")) / 100.0
                metrics = business_day_metrics[(week_label, day)]
                metrics["sessions"] += parse_float(row.get("trafficByDate.sessions"))
                metrics["page_views"] += page_views
                metrics["order_items"] += parse_float(row.get("salesByDate.totalOrderItems"))
                metrics["units_ordered"] += parse_float(row.get("salesByDate.unitsOrdered"))
                metrics["sales"] += parse_float(row.get("salesByDate.orderedProductSales.amount"))
                metrics["buy_box_page_views_weighted"] += buy_box_percentage * page_views
    return business_day_metrics


def make_tst_term_week() -> dict[str, float]:
    return {
        "present": 0.0,
        "row_count": 0.0,
        "search_frequency_rank": 0.0,
        "click_share_total": 0.0,
        "conversion_share_total": 0.0,
        "our_click_share": 0.0,
        "our_conversion_share": 0.0,
        "competitor_click_share": 0.0,
        "competitor_conversion_share": 0.0,
    }


def load_tst(
    week_meta: dict[str, dict[str, object]],
    cluster_terms: dict[tuple[str, str], set[str]],
    target_asin: str,
    term_info: dict[str, dict[str, object]] | None = None,
) -> dict[tuple[str, str], dict[str, float]]:
    tst_term_week: dict[tuple[str, str], dict[str, float]] = defaultdict(make_tst_term_week)
    for path in discover_files("Week * (Sun)/input/Brand Analytics (API)/TST - Top Search Terms (API)/*.csv"):
        week_number, week_label, start_date = detect_week_folder(path)
        week_meta.setdefault(
            week_label,
            {"week_number": week_number, "week_label": week_label, "start_date": start_date},
        )
        with path.open(newline="", encoding="utf-8-sig") as handle:
            reader = csv.DictReader(handle)
            for row in reader:
                term = normalize_text(row.get("searchTerm", ""))
                if not term:
                    continue
                family, cluster = assign_cluster(term)
                cluster_terms[(family, cluster)].add(term)
                if term_info is not None:
                    ensure_term_info(term_info, term, family, cluster)
                payload = tst_term_week[(week_label, term)]
                payload["present"] = 1.0
                payload["row_count"] += 1.0
                search_frequency_rank = parse_float(row.get("searchFrequencyRank"))
                if payload["search_frequency_rank"] == 0.0:
                    payload["search_frequency_rank"] = search_frequency_rank
                elif search_frequency_rank > 0.0:
                    payload["search_frequency_rank"] = min(float(payload["search_frequency_rank"]), search_frequency_rank)
                click_share = parse_float(row.get("clickShare"))
                conversion_share = parse_float(row.get("conversionShare"))
                payload["click_share_total"] += click_share
                payload["conversion_share_total"] += conversion_share
                clicked_asin = str(row.get("clickedAsin", "")).strip()
                if clicked_asin == target_asin:
                    payload["our_click_share"] += click_share
                    payload["our_conversion_share"] += conversion_share
                if clicked_asin == COMPETITOR_ASIN:
                    payload["competitor_click_share"] += click_share
                    payload["competitor_conversion_share"] += conversion_share
    return tst_term_week


def load_dd_keywords(
    week_meta: dict[str, dict[str, object]],
) -> dict[tuple[str, str], float]:
    competitor_ranks: dict[tuple[str, str], float] = {}
    for path in discover_files(
        "Week * (Sun)/input/Datadive (API)/DD-Keywords - Datadive Keywords (API)/*.csv"
    ):
        week_number, week_label, _ = detect_week_folder(path)
        week_meta.setdefault(
            week_label,
            {"week_number": week_number, "week_label": week_label, "start_date": ""},
        )
        with path.open(newline="", encoding="utf-8-sig") as handle:
            reader = csv.DictReader(handle)
            headers = reader.fieldnames
            if not headers or COMPETITOR_ASIN not in headers:
                continue
            for row in reader:
                keyword = normalize_text(row.get("keyword", ""))
                if not keyword:
                    continue
                rank_text = str(row.get(COMPETITOR_ASIN, "") or "").strip()
                if not rank_text:
                    continue
                rank_value = parse_float(rank_text)
                if rank_value <= 0:
                    continue
                existing = competitor_ranks.get((week_label, keyword))
                if existing is None or rank_value < existing:
                    competitor_ranks[(week_label, keyword)] = rank_value
    return competitor_ranks


def rank_to_impression_share(rank: float) -> float:
    if rank <= 0:
        return 0.0
    if rank <= 1:
        return 0.25
    if rank <= 3:
        return 0.15
    if rank <= 5:
        return 0.08
    if rank <= 10:
        return 0.04
    if rank <= 20:
        return 0.015
    if rank <= 50:
        return 0.005
    return 0.001


def load_competitors(
    week_meta: dict[str, dict[str, object]],
) -> dict[str, dict[str, float]]:
    competitor_weekly: dict[str, dict[str, float]] = {}
    for path in discover_files(
        "Week * (Sun)/input/Datadive (API)/DD-Competitors - Datadive Competitors (API)/*.csv"
    ):
        week_number, week_label, _ = detect_week_folder(path)
        with path.open(newline="", encoding="utf-8-sig") as handle:
            reader = csv.DictReader(handle)
            for row in reader:
                asin = (row.get("asin") or "").strip()
                if asin != COMPETITOR_ASIN:
                    continue
                competitor_weekly[week_label] = {
                    "sales": parse_float(row.get("sales")),
                    "revenue": parse_float(row.get("revenue")),
                    "price": parse_float(row.get("price")),
                    "kw_ranked_p1": parse_float(row.get("kwRankedOnP1")),
                    "kw_ranked_p1_pct": parse_float(row.get("kwRankedOnP1Percent")),
                    "sv_ranked_p1_pct": parse_float(row.get("svRankedOnP1Percent")),
                    "advertised_kws_pct": parse_float(row.get("advertisedKwsPercent")),
                    "tos_kws_ads_pct": parse_float(row.get("tosKwsAdsPercent")),
                    "tos_sv_ads_pct": parse_float(row.get("tosSvAdsPercent")),
                    "listing_juice": parse_float(row.get("listingRankingJuice.value")),
                    "title_juice": parse_float(row.get("listingRankingJuice.contribution.title.rankingJuice")),
                    "bullets_juice": parse_float(row.get("listingRankingJuice.contribution.bullets.rankingJuice")),
                    "description_juice": parse_float(row.get("listingRankingJuice.contribution.description.rankingJuice")),
                }
    return competitor_weekly


def competitor_identity_payload() -> dict[str, str]:
    return {
        "brand": COMPETITOR_BRAND,
        "asin": COMPETITOR_ASIN,
        "config_source": COMPETITOR_CONFIG_SOURCE,
    }


def summarize_competitor_term_window(
    term: str,
    weeks: list[str],
    competitor_ranks: dict[tuple[str, str], float],
) -> dict[str, object]:
    weeks_present = [week_label for week_label in weeks if (week_label, term) in competitor_ranks]
    ranks = [float(competitor_ranks[(week_label, term)]) for week_label in weeks_present]
    visibility_values = [rank_to_impression_share(rank) for rank in ranks]
    return {
        "weeks_present": weeks_present,
        "weeks_keywords": len(weeks_present),
        "avg_rank": mean_or_none(ranks),
        "best_rank": min(ranks) if ranks else None,
        "visibility_est": mean_or_none(visibility_values),
    }


def build_term_competitor_benchmark(
    term: str,
    recent_observed: dict[str, float | int | None],
    baseline_observed: dict[str, float | int | None],
    competitor_ranks: dict[tuple[str, str], float],
    recent_weeks: list[str],
    baseline_weeks: list[str],
) -> dict[str, object]:
    recent_summary = summarize_competitor_term_window(term, recent_weeks, competitor_ranks)
    baseline_summary = summarize_competitor_term_window(term, baseline_weeks, competitor_ranks)
    recent_avg = recent_summary["avg_rank"]
    recent_best = recent_summary["best_rank"]
    baseline_avg = baseline_summary["avg_rank"]
    recent_gap = (
        float(recent_observed["avg_rank"]) - float(recent_avg)
        if recent_observed["avg_rank"] is not None and recent_avg is not None
        else None
    )
    recent_best_gap = (
        float(recent_observed["avg_rank"]) - float(recent_best)
        if recent_observed["avg_rank"] is not None and recent_best is not None
        else None
    )
    baseline_gap = (
        float(baseline_observed["avg_rank"]) - float(baseline_avg)
        if baseline_observed["avg_rank"] is not None and baseline_avg is not None
        else None
    )
    benchmark_available = bool(recent_summary["weeks_keywords"])
    recent_rank_coverage_strength = "none"
    if recent_summary["weeks_keywords"] >= 2:
        recent_rank_coverage_strength = "strong"
    elif benchmark_available:
        recent_rank_coverage_strength = "thin"
    return {
        "competitor": {
            "identity": competitor_identity_payload(),
            "coverage": {
                "weeks_keywords_recent_4w": recent_summary["weeks_keywords"],
                "weeks_keywords_baseline_13w": baseline_summary["weeks_keywords"],
                "recent_rank_coverage_strength": recent_rank_coverage_strength,
                "benchmark_available": benchmark_available,
            },
            "raw_input": {
                "recent_4w": recent_summary,
                "baseline_13w": baseline_summary,
            },
            "estimated_output": {
                "recent_4w": {
                    "visibility_est": recent_summary["visibility_est"],
                },
                "baseline_13w": {
                    "visibility_est": baseline_summary["visibility_est"],
                },
            },
            "gap_to_target": {
                "rank_recent_4w": recent_gap if benchmark_available else None,
                "rank_best_recent_4w": recent_best_gap if benchmark_available else None,
                "rank_baseline_13w": baseline_gap,
            },
            "benchmark_available": benchmark_available,
        }
    }


def summarize_competitor_catalog_for_weeks(
    competitor_weekly: dict[str, dict[str, float]],
    weeks: list[str],
) -> dict[str, float]:
    weeks_present = 0.0
    sales_units = 0.0
    revenue_total = 0.0
    weighted_price_total = 0.0
    for week_label in weeks:
        week_data = competitor_weekly.get(week_label)
        if not week_data:
            continue
        weeks_present += 1.0
        price = float(week_data.get("price", 0.0))
        sales = float(week_data.get("sales", 0.0))
        revenue = float(week_data.get("revenue", 0.0))
        sales_units += sales
        revenue_total += revenue
        if price > 0:
            weighted_price_total += price * sales
    return {
        "weeks_present": weeks_present,
        "sales_units": sales_units,
        "revenue": revenue_total,
        "avg_price": safe_div(weighted_price_total, sales_units),
    }


def estimate_competitor_window_for_terms(
    terms: list[str],
    term_profiles: dict[str, dict[str, object]],
    competitor_weekly: dict[str, dict[str, float]],
    window_key: str,
    weeks: list[str],
) -> dict[str, object]:
    cluster_market_impressions = 0.0
    cluster_market_clicks = 0.0
    cluster_market_cart_adds = 0.0
    cluster_market_purchases = 0.0
    cluster_query_volume = 0.0
    competitor_impressions_est = 0.0
    competitor_clicks_est = 0.0
    competitor_cart_adds_est = 0.0
    competitor_purchases_est = 0.0
    weighted_rank_numerator = 0.0
    weighted_rank_denominator = 0.0
    weighted_visibility_numerator = 0.0
    weighted_visibility_denominator = 0.0
    target_best_rank = None
    weeks_with_keyword_rank: set[str] = set()
    terms_with_rank = 0

    for term in terms:
        profile = term_profiles[term]
        observed = profile["observed"][window_key]
        benchmark = profile["benchmark"]["competitor"]
        rank_input = benchmark["raw_input"][window_key]
        estimated = benchmark["estimated_output"][window_key]

        cluster_market_impressions += float(observed["market_impressions"])
        cluster_market_clicks += float(observed["market_clicks"])
        cluster_market_cart_adds += float(observed["market_cart_adds"])
        cluster_market_purchases += float(observed["market_purchases"])
        cluster_query_volume += float(observed["query_volume"])

        avg_rank = rank_input["avg_rank"]
        best_rank = rank_input["best_rank"]
        visibility_est = estimated["visibility_est"]
        if avg_rank is None or best_rank is None:
            continue

        terms_with_rank += 1
        weeks_with_keyword_rank.update(str(week) for week in rank_input["weeks_present"])
        term_weight = max(
            float(observed["query_volume"]),
            float(profile["observed"]["baseline_13w"]["query_volume"]),
            1.0,
        )
        weighted_rank_numerator += float(avg_rank) * term_weight
        weighted_rank_denominator += term_weight
        weighted_visibility_numerator += float(visibility_est) * term_weight
        weighted_visibility_denominator += term_weight
        target_best_rank = float(best_rank) if target_best_rank is None else min(float(best_rank), target_best_rank)

        term_impressions_est = float(observed["market_impressions"]) * float(visibility_est)
        term_clicks_est = term_impressions_est * float(observed["market_ctr"])
        term_cart_adds_est = term_clicks_est * float(observed["cart_add_rate"])
        term_purchases_est = term_clicks_est * float(observed["market_cvr"])
        competitor_impressions_est += term_impressions_est
        competitor_clicks_est += term_clicks_est
        competitor_cart_adds_est += term_cart_adds_est
        competitor_purchases_est += term_purchases_est

    avg_rank_est = (
        weighted_rank_numerator / weighted_rank_denominator
        if weighted_rank_denominator
        else None
    )
    visibility_est = (
        weighted_visibility_numerator / weighted_visibility_denominator
        if weighted_visibility_denominator
        else 0.0
    )
    return {
        "coverage": {
            "weeks_keywords": len(weeks_with_keyword_rank),
            "weeks_competitor": sum(1 for week_label in weeks if week_label in competitor_weekly),
            "terms_with_rank": terms_with_rank,
        },
        "raw_input": {
            "avg_rank": avg_rank_est,
            "best_rank": target_best_rank,
            "visibility_est": visibility_est,
        },
        "estimated_output": {
            "impressions_est": competitor_impressions_est,
            "clicks_est": competitor_clicks_est,
            "cart_adds_est": competitor_cart_adds_est,
            "purchases_est": competitor_purchases_est,
            "ctr_est": safe_div(competitor_clicks_est, competitor_impressions_est),
            "cart_add_rate_est": safe_div(competitor_cart_adds_est, competitor_clicks_est),
            "cvr_est": safe_div(competitor_purchases_est, competitor_clicks_est),
            "impression_share_est": safe_div(competitor_impressions_est, cluster_market_impressions),
            "click_share_est": safe_div(competitor_clicks_est, cluster_market_clicks),
            "cart_add_share_est": safe_div(competitor_cart_adds_est, cluster_market_cart_adds),
            "purchase_share_est": safe_div(competitor_purchases_est, cluster_market_purchases),
        },
    }


def build_competitor_weekly_series(
    week_order: list[str],
    competitor_weekly: dict[str, dict[str, float]],
) -> list[dict[str, object]]:
    series: list[dict[str, object]] = []
    for week_label in week_order:
        week_data = competitor_weekly.get(week_label, {})
        series.append(
            {
                "week_label": week_label,
                "present": bool(week_data),
                "sales": float(week_data.get("sales", 0.0)),
                "price": float(week_data.get("price", 0.0)),
                "kw_ranked_p1_pct": float(week_data.get("kw_ranked_p1_pct", 0.0)),
                "sv_ranked_p1_pct": float(week_data.get("sv_ranked_p1_pct", 0.0)),
                "listing_juice": float(week_data.get("listing_juice", 0.0)),
            }
        )
    return series


def attach_competitor_benchmarks(
    summaries: list[dict[str, object]],
    primary_terms_by_cluster: dict[tuple[str, str], list[str]],
    term_profiles: dict[str, dict[str, object]],
    competitor_weekly: dict[str, dict[str, float]],
    recent_weeks: list[str],
    baseline_weeks: list[str],
) -> None:
    recent_catalog_context = summarize_competitor_catalog_for_weeks(competitor_weekly, recent_weeks)
    baseline_catalog_context = summarize_competitor_catalog_for_weeks(competitor_weekly, baseline_weeks)

    for summary in summaries:
        terms = [
            term
            for term in primary_terms_by_cluster.get((str(summary["family"]), str(summary["cluster"])), [])
            if term_profiles[term]["coverage"]["has_sqp"]
        ]
        recent_window_est = estimate_competitor_window_for_terms(
            terms,
            term_profiles,
            competitor_weekly,
            "recent_4w",
            recent_weeks,
        )
        baseline_window_est = estimate_competitor_window_for_terms(
            terms,
            term_profiles,
            competitor_weekly,
            "baseline_13w",
            baseline_weeks,
        )
        benchmark_available = bool(
            recent_window_est["coverage"]["terms_with_rank"]
            and recent_window_est["coverage"]["weeks_keywords"]
            and recent_window_est["coverage"]["weeks_competitor"]
        )
        rank_gap = (
            float(summary["avg_rank"]) - float(recent_window_est["raw_input"]["avg_rank"])
            if summary["avg_rank"] is not None and recent_window_est["raw_input"]["avg_rank"] is not None and benchmark_available
            else None
        )
        best_rank_gap = (
            float(summary["avg_rank"]) - float(recent_window_est["raw_input"]["best_rank"])
            if summary["avg_rank"] is not None and recent_window_est["raw_input"]["best_rank"] is not None and benchmark_available
            else None
        )
        recent_rank_coverage_strength = (
            "strong"
            if recent_window_est["coverage"]["weeks_keywords"] >= 2
            and recent_window_est["coverage"]["terms_with_rank"] >= 2
            and recent_window_est["coverage"]["weeks_competitor"] >= 1
            else "thin"
            if benchmark_available
            else "none"
        )
        benchmark_signals: list[str] = []
        if rank_gap is not None and rank_gap >= 10:
            benchmark_signals.append("Target gap")
        if benchmark_available and float(recent_window_est["estimated_output"]["impression_share_est"]) > float(summary["impression_share"]) * 1.5:
            benchmark_signals.append("Competitor dominance")
        if benchmark_available and rank_gap is not None and rank_gap <= -5:
            benchmark_signals.append("Benchmark ahead")

        summary["benchmark"] = {
            "competitor": {
                "identity": competitor_identity_payload(),
                "coverage": {
                    "weeks_keywords_recent_4w": recent_window_est["coverage"]["weeks_keywords"],
                    "weeks_keywords_baseline_13w": baseline_window_est["coverage"]["weeks_keywords"],
                    "weeks_competitor_recent_4w": recent_window_est["coverage"]["weeks_competitor"],
                    "weeks_competitor_baseline_13w": baseline_window_est["coverage"]["weeks_competitor"],
                    "terms_with_rank_recent_4w": recent_window_est["coverage"]["terms_with_rank"],
                    "terms_with_rank_baseline_13w": baseline_window_est["coverage"]["terms_with_rank"],
                    "recent_rank_coverage_strength": recent_rank_coverage_strength,
                    "benchmark_available": benchmark_available,
                },
                "raw_input": {
                    "recent_4w": recent_window_est["raw_input"],
                    "baseline_13w": baseline_window_est["raw_input"],
                },
                "estimated_output": {
                    "recent_4w": recent_window_est["estimated_output"],
                    "baseline_13w": baseline_window_est["estimated_output"],
                },
                "catalog_context": {
                    "recent_4w": recent_catalog_context,
                    "baseline_13w": baseline_catalog_context,
                },
                "estimation": {
                    "method": "rank_visibility_x_market_funnel",
                    "sales_field_source": "dd_competitors_sales_units",
                    "sales_used_in_funnel_estimate": False,
                },
                "gap_to_target": {
                    "rank_recent_4w": rank_gap,
                    "rank_best_recent_4w": best_rank_gap,
                    "purchase_share_recent_4w": (
                        float(recent_window_est["estimated_output"]["purchase_share_est"]) - float(summary["purchase_share"])
                    ) if benchmark_available else None,
                },
                "benchmark_available": benchmark_available,
            }
        }
        summary["derived"]["benchmark_signals"] = benchmark_signals[:3]


def build_tst_window_compare(
    terms: list[str],
    tst_term_week: dict[tuple[str, str], dict[str, float]],
    weeks: list[str],
) -> dict[str, object]:
    total_click_pool_share = 0.0
    total_purchase_pool_share = 0.0
    total_our_click_share = 0.0
    total_our_purchase_share = 0.0
    total_competitor_click_share = 0.0
    total_competitor_purchase_share = 0.0
    weeks_present: set[str] = set()
    term_rows: list[dict[str, object]] = []
    term_week_rows = 0.0

    for term in terms:
        term_click_pool_share = 0.0
        term_purchase_pool_share = 0.0
        term_our_click_share = 0.0
        term_our_purchase_share = 0.0
        term_competitor_click_share = 0.0
        term_competitor_purchase_share = 0.0
        term_search_frequency_rank = 0.0
        term_weeks_present: set[str] = set()

        for week_label in weeks:
            tst_metrics = tst_term_week.get((week_label, term))
            if tst_metrics is None:
                continue

            term_weeks_present.add(week_label)
            weeks_present.add(week_label)
            term_week_rows += 1.0
            click_share_total = float(tst_metrics.get("click_share_total", 0.0))
            conversion_share_total = float(tst_metrics.get("conversion_share_total", 0.0))
            our_click_share = float(tst_metrics.get("our_click_share", 0.0))
            our_conversion_share = float(tst_metrics.get("our_conversion_share", 0.0))
            competitor_click_share = float(tst_metrics.get("competitor_click_share", 0.0))
            competitor_conversion_share = float(tst_metrics.get("competitor_conversion_share", 0.0))
            search_frequency_rank = float(tst_metrics.get("search_frequency_rank", 0.0))

            term_click_pool_share += click_share_total
            term_purchase_pool_share += conversion_share_total
            term_our_click_share += our_click_share
            term_our_purchase_share += our_conversion_share
            term_competitor_click_share += competitor_click_share
            term_competitor_purchase_share += competitor_conversion_share
            total_click_pool_share += click_share_total
            total_purchase_pool_share += conversion_share_total
            total_our_click_share += our_click_share
            total_our_purchase_share += our_conversion_share
            total_competitor_click_share += competitor_click_share
            total_competitor_purchase_share += competitor_conversion_share
            if term_search_frequency_rank == 0.0:
                term_search_frequency_rank = search_frequency_rank
            elif search_frequency_rank > 0.0:
                term_search_frequency_rank = min(term_search_frequency_rank, search_frequency_rank)

        if term_weeks_present:
            term_count = float(len(term_weeks_present))
            term_rows.append({
                "term": term,
                "weeks_present": len(term_weeks_present),
                "search_frequency_rank": term_search_frequency_rank,
                "click_pool_share": term_click_pool_share,
                "purchase_pool_share": term_purchase_pool_share,
                "avg_click_pool_share": safe_div(term_click_pool_share, term_count),
                "avg_purchase_pool_share": safe_div(term_purchase_pool_share, term_count),
                "our_click_share": safe_div(term_our_click_share, term_count),
                "our_purchase_share": safe_div(term_our_purchase_share, term_count),
                "competitor_click_share": safe_div(term_competitor_click_share, term_count),
                "competitor_purchase_share": safe_div(term_competitor_purchase_share, term_count),
                "other_click_share": safe_div(max(term_click_pool_share - term_our_click_share - term_competitor_click_share, 0.0), term_count),
                "other_purchase_share": safe_div(max(term_purchase_pool_share - term_our_purchase_share - term_competitor_purchase_share, 0.0), term_count),
                "click_gap": safe_div(term_our_click_share - term_competitor_click_share, term_count),
                "purchase_gap": safe_div(term_our_purchase_share - term_competitor_purchase_share, term_count),
            })

    term_rows.sort(
        key=lambda item: (
            float(item["avg_click_pool_share"]),
            float(item["avg_purchase_pool_share"]),
            -float(item["search_frequency_rank"]) if float(item["search_frequency_rank"]) > 0 else 0.0,
        ),
        reverse=True,
    )

    return {
        "source": "TST",
        "method": "observed_top_clicked_asin_pool",
        "coverage": {
            "terms_total": len(terms),
            "terms_covered": len(term_rows),
            "weeks_present": len(weeks_present),
            "term_weeks_covered": int(term_week_rows),
            "avg_click_pool_share": safe_div(total_click_pool_share, term_week_rows),
            "avg_purchase_pool_share": safe_div(total_purchase_pool_share, term_week_rows),
        },
        "observed": {
            "total_click_pool_share": total_click_pool_share,
            "total_purchase_pool_share": total_purchase_pool_share,
            "our_click_share_points": total_our_click_share,
            "our_purchase_share_points": total_our_purchase_share,
            "competitor_click_share_points": total_competitor_click_share,
            "competitor_purchase_share_points": total_competitor_purchase_share,
            "other_click_share_points": max(total_click_pool_share - total_our_click_share - total_competitor_click_share, 0.0),
            "other_purchase_share_points": max(total_purchase_pool_share - total_our_purchase_share - total_competitor_purchase_share, 0.0),
            "our_click_share": safe_div(total_our_click_share, total_click_pool_share),
            "our_purchase_share": safe_div(total_our_purchase_share, total_purchase_pool_share),
            "competitor_click_share": safe_div(total_competitor_click_share, total_click_pool_share),
            "competitor_purchase_share": safe_div(total_competitor_purchase_share, total_purchase_pool_share),
            "other_click_share": safe_div(max(total_click_pool_share - total_our_click_share - total_competitor_click_share, 0.0), total_click_pool_share),
            "other_purchase_share": safe_div(max(total_purchase_pool_share - total_our_purchase_share - total_competitor_purchase_share, 0.0), total_purchase_pool_share),
            "click_gap": safe_div(total_our_click_share, total_click_pool_share) - safe_div(total_competitor_click_share, total_click_pool_share),
            "purchase_gap": safe_div(total_our_purchase_share, total_purchase_pool_share) - safe_div(total_competitor_purchase_share, total_purchase_pool_share),
        },
        "term_rows": term_rows,
        "top_terms": term_rows,
    }


def build_tst_weekly_series(
    terms: list[str],
    tst_term_week: dict[tuple[str, str], dict[str, float]],
    weeks: list[str],
    week_meta: dict[str, dict[str, object]],
) -> list[dict[str, object]]:
    series: list[dict[str, object]] = []
    for week_label in weeks:
        week_compare = build_tst_window_compare(terms, tst_term_week, [week_label])
        week_compare["week_label"] = week_label
        week_compare["week_number"] = int(week_meta[week_label]["week_number"])
        week_compare["start_date"] = str(week_meta[week_label]["start_date"])
        series.append(week_compare)
    return series


def attach_tst_compare(
    summaries: list[dict[str, object]],
    cluster_terms: dict[tuple[str, str], set[str]],
    tst_term_week: dict[tuple[str, str], dict[str, float]],
    recent_weeks: list[str],
    baseline_weeks: list[str],
    week_meta: dict[str, dict[str, object]],
) -> None:
    for summary in summaries:
        family = str(summary["family"])
        cluster = str(summary["cluster"])
        terms = sorted(cluster_terms[(family, cluster)])
        summary["tstCompare"] = {
            "competitor": competitor_identity_payload(),
            "recent_4w": build_tst_window_compare(terms, tst_term_week, recent_weeks),
            "baseline_13w": build_tst_window_compare(terms, tst_term_week, baseline_weeks),
            "weekly": build_tst_weekly_series(terms, tst_term_week, baseline_weeks, week_meta),
        }


def build_week_records(
    cluster_week: dict[tuple[str, str, str], dict[str, float]],
    week_meta: dict[str, dict[str, object]],
) -> list[dict[str, object]]:
    records: list[dict[str, object]] = []
    for (week_label, family, cluster), metrics in cluster_week.items():
        avg_rank = None
        rank_volatility = None
        rank_weight = metrics.get("rank_weight", 0.0)
        if rank_weight:
            avg_rank = metrics["rank_sum"] / rank_weight
            rank_volatility = metrics["rank_span_sum"] / rank_weight
        record = {
            "week_label": week_label,
            "week_number": week_meta[week_label]["week_number"],
            "start_date": week_meta[week_label]["start_date"],
            "family": family,
            "cluster": cluster,
            "market_impressions": metrics.get("market_impressions", 0.0),
            "asin_impressions": metrics.get("asin_impressions", 0.0),
            "market_clicks": metrics.get("market_clicks", 0.0),
            "market_cart_adds": metrics.get("market_cart_adds", 0.0),
            "asin_cart_adds": metrics.get("asin_cart_adds", 0.0),
            "market_purchases": metrics.get("market_purchases", 0.0),
            "asin_clicks": metrics.get("asin_clicks", 0.0),
            "asin_purchases": metrics.get("asin_purchases", 0.0),
            "query_volume": metrics.get("query_volume", 0.0),
            "ppc_impressions": metrics.get("ppc_impressions", 0.0),
            "ppc_clicks": metrics.get("ppc_clicks", 0.0),
            "ppc_spend": metrics.get("ppc_spend", 0.0),
            "ppc_sales": metrics.get("ppc_sales", 0.0),
            "ppc_orders": metrics.get("ppc_orders", 0.0),
            "rank_weight": rank_weight,
            "avg_rank": avg_rank,
            "rank_volatility": rank_volatility,
        }
        record["market_cvr"] = safe_div(record["market_purchases"], record["market_clicks"])
        record["asin_ctr"] = safe_div(record["asin_clicks"], record["asin_impressions"])
        record["asin_cvr"] = safe_div(record["asin_purchases"], record["asin_clicks"])
        record["impression_share"] = safe_div(record["asin_impressions"], record["market_impressions"])
        record["click_share"] = safe_div(record["asin_clicks"], record["market_clicks"])
        record["purchase_share"] = safe_div(record["asin_purchases"], record["market_purchases"])
        record["cart_add_rate"] = safe_div(record["market_cart_adds"], record["market_clicks"])
        record["asin_cart_add_rate"] = safe_div(record["asin_cart_adds"], record["asin_clicks"])
        record["cart_add_share"] = safe_div(record["asin_cart_adds"], record["market_cart_adds"])
        record["ppc_acos"] = safe_div(record["ppc_spend"], record["ppc_sales"])
        records.append(record)
    records.sort(key=lambda item: (int(item["week_number"]), item["family"], item["cluster"]))
    return records


def top_terms_for_cluster(
    terms: set[str],
    term_rollup: dict[str, dict[str, float]],
    limit: int = 4,
) -> list[str]:
    ranked_terms = sorted(
        terms,
        key=lambda term: (
            term_rollup[term]["market_purchases"],
            term_rollup[term]["search_volume"],
            term_rollup[term]["ppc_spend"],
        ),
        reverse=True,
    )
    return ranked_terms[:limit]


def summarize_clusters(
    week_records: list[dict[str, object]],
    cluster_terms: dict[tuple[str, str], set[str]],
    term_rollup: dict[str, dict[str, float]],
    week_order: list[str],
) -> list[dict[str, object]]:
    records_by_cluster: dict[tuple[str, str], list[dict[str, object]]] = defaultdict(list)
    for record in week_records:
        records_by_cluster[(str(record["family"]), str(record["cluster"]))].append(record)

    summaries: list[dict[str, object]] = []
    for (family, cluster), records in records_by_cluster.items():
        records.sort(key=lambda item: int(item["week_number"]))
        total_market_impressions = sum(float(item["market_impressions"]) for item in records)
        total_asin_impressions = sum(float(item["asin_impressions"]) for item in records)
        total_market_clicks = sum(float(item["market_clicks"]) for item in records)
        total_market_cart_adds = sum(float(item["market_cart_adds"]) for item in records)
        total_asin_cart_adds = sum(float(item["asin_cart_adds"]) for item in records)
        total_market_purchases = sum(float(item["market_purchases"]) for item in records)
        total_asin_clicks = sum(float(item["asin_clicks"]) for item in records)
        total_asin_purchases = sum(float(item["asin_purchases"]) for item in records)
        total_query_volume = sum(float(item["query_volume"]) for item in records)
        total_ppc_spend = sum(float(item["ppc_spend"]) for item in records)
        total_ppc_sales = sum(float(item["ppc_sales"]) for item in records)
        total_ppc_clicks = sum(float(item["ppc_clicks"]) for item in records)
        rank_records = [item for item in records if item["avg_rank"] is not None]
        rank_weight_total = sum(float(item["rank_weight"]) for item in rank_records)
        avg_rank = (
            sum(float(item["avg_rank"]) * float(item["rank_weight"]) for item in rank_records) / rank_weight_total
            if rank_weight_total
            else None
        )
        rank_volatility = (
            sum(float(item["rank_volatility"]) * float(item["rank_weight"]) for item in rank_records) / rank_weight_total
            if rank_weight_total
            else None
        )
        rank_history = [float(item["avg_rank"]) for item in rank_records]
        recent_rank = mean(rank_history[-4:]) if rank_history else None
        prior_rank = mean(rank_history[:-4]) if len(rank_history) > 4 else (mean(rank_history[:-1]) if len(rank_history) > 1 else None)
        rank_change = (recent_rank - prior_rank) if recent_rank is not None and prior_rank is not None else None
        top_terms = top_terms_for_cluster(cluster_terms[(family, cluster)], term_rollup)
        search_volume = sum(term_rollup[term]["search_volume"] for term in cluster_terms[(family, cluster)])
        summary = {
            "id": slugify(f"{family}-{cluster}"),
            "family": family,
            "cluster": cluster,
            "terms_count": len(cluster_terms[(family, cluster)]),
            "weeks_covered": len(records),
            "rank_weeks": len(rank_records),
            "market_impressions": total_market_impressions,
            "asin_impressions": total_asin_impressions,
            "market_clicks": total_market_clicks,
            "market_cart_adds": total_market_cart_adds,
            "asin_cart_adds": total_asin_cart_adds,
            "market_purchases": total_market_purchases,
            "asin_clicks": total_asin_clicks,
            "asin_purchases": total_asin_purchases,
            "query_volume": total_query_volume,
            "search_volume": search_volume,
            "ppc_spend": total_ppc_spend,
            "ppc_sales": total_ppc_sales,
            "ppc_clicks": total_ppc_clicks,
            "asin_ctr": safe_div(total_asin_clicks, total_asin_impressions),
            "asin_cvr": safe_div(total_asin_purchases, total_asin_clicks),
            "market_cvr": safe_div(total_market_purchases, total_market_clicks),
            "impression_share": safe_div(total_asin_impressions, total_market_impressions),
            "click_share": safe_div(total_asin_clicks, total_market_clicks),
            "cart_add_rate": safe_div(total_market_cart_adds, total_market_clicks),
            "asin_cart_add_rate": safe_div(total_asin_cart_adds, total_asin_clicks),
            "cart_add_share": safe_div(total_asin_cart_adds, total_market_cart_adds),
            "purchase_share": safe_div(total_asin_purchases, total_market_purchases),
            "ppc_acos": safe_div(total_ppc_spend, total_ppc_sales),
            "ppc_cvr": safe_div(sum(float(item["ppc_orders"]) for item in records), total_ppc_clicks),
            "avg_rank": avg_rank,
            "rank_volatility": rank_volatility,
            "rank_change": rank_change,
            "top_terms": top_terms,
            "weekly": [
                {
                    "week_label": str(item["week_label"]),
                    "week_number": int(item["week_number"]),
                    "avg_rank": item["avg_rank"],
                    "rank_volatility": item["rank_volatility"],
                    "impression_share": float(item["impression_share"]),
                    "purchase_share": float(item["purchase_share"]),
                    "click_share": float(item["click_share"]),
                    "ppc_spend": float(item["ppc_spend"]),
                    "ppc_acos": float(item["ppc_acos"]),
                    "asin_ctr": float(item["asin_ctr"]),
                    "asin_cvr": float(item["asin_cvr"]),
                    "market_ctr": safe_div(float(item["market_clicks"]), float(item["market_impressions"])),
                    "market_cvr": float(item["market_cvr"]),
                    "market_cart_adds": float(item["market_cart_adds"]),
                    "asin_cart_adds": float(item["asin_cart_adds"]),
                    "cart_add_share": safe_div(float(item["asin_cart_adds"]), float(item["market_cart_adds"])),
                    "asin_cart_add_rate": safe_div(float(item["asin_cart_adds"]), float(item["asin_clicks"])),
                }
                for item in records
            ],
        }
        summary["core"] = (
            cluster != "Unclustered"
            and (
                summary["market_purchases"] >= 200
                or summary["rank_weeks"] >= 3
                or summary["ppc_spend"] >= 300
            )
        )
        summaries.append(summary)

    summaries.sort(key=lambda item: (item["market_purchases"], item["search_volume"]), reverse=True)
    return summaries


def annotate_rank_mismatch(summaries: list[dict[str, object]]) -> None:
    focus = [
        item
        for item in summaries
        if item["core"]
        and item["avg_rank"] is not None
        and item["rank_weeks"] >= 3
        and item["asin_clicks"] >= 20
    ]
    if not focus:
        for item in summaries:
            item["cvr_score"] = None
            item["rank_score"] = None
            item["misalignment"] = None
            item["expected_rank"] = None
            item["rank_gap"] = None
        return

    cvr_sorted = sorted(focus, key=lambda item: (float(item["asin_cvr"]), float(item["market_purchases"])))
    rank_sorted = sorted(focus, key=lambda item: (float(item["avg_rank"]), -float(item["market_purchases"])))
    rank_values = [float(item["avg_rank"]) for item in rank_sorted]
    cvr_pos = {item["id"]: index for index, item in enumerate(cvr_sorted)}
    rank_pos = {item["id"]: index for index, item in enumerate(rank_sorted)}
    denominator = max(len(focus) - 1, 1)

    for item in summaries:
        if item["id"] not in cvr_pos or item["id"] not in rank_pos:
            item["cvr_score"] = None
            item["rank_score"] = None
            item["misalignment"] = None
            item["expected_rank"] = None
            item["rank_gap"] = None
            continue
        cvr_score = cvr_pos[item["id"]] / denominator
        rank_score = 1 - (rank_pos[item["id"]] / denominator)
        expected_rank_position = (1 - cvr_score) * (len(rank_values) - 1)
        expected_rank = interpolate(rank_values, expected_rank_position)
        item["cvr_score"] = cvr_score
        item["rank_score"] = rank_score
        item["misalignment"] = cvr_score - rank_score
        item["expected_rank"] = expected_rank
        item["rank_gap"] = float(item["avg_rank"]) - expected_rank


def linear_regression(points: list[dict[str, object]]) -> dict[str, float] | None:
    usable = [point for point in points if point["avg_rank"] is not None]
    if len(usable) < 3:
        return None
    weights = [max(float(point["market_clicks"]), 1.0) for point in usable]
    xs = [float(point["asin_cvr"]) * 100 for point in usable]
    ys = [float(point["avg_rank"]) for point in usable]
    weight_sum = sum(weights)
    if not weight_sum:
        return None
    x_bar = sum(weight * x for weight, x in zip(weights, xs)) / weight_sum
    y_bar = sum(weight * y for weight, y in zip(weights, ys)) / weight_sum
    sxx = sum(weight * (x - x_bar) ** 2 for weight, x in zip(weights, xs))
    if sxx <= 1e-9:
        return None
    sxy = sum(weight * (x - x_bar) * (y - y_bar) for weight, x, y in zip(weights, xs, ys))
    slope = sxy / sxx
    intercept = y_bar - slope * x_bar
    return {"slope": slope, "intercept": intercept}


def write_summary_csv(
    path: Path,
    summaries: list[dict[str, object]],
    anchor_week: str,
    recent_weeks: list[str],
    baseline_weeks: list[str],
) -> None:
    headers = [
        "anchor_week",
        "recent_window",
        "baseline_window",
        "family",
        "cluster",
        "top_terms",
        "weeks_sqp",
        "weeks_rank",
        "weeks_ppc",
        "terms_total",
        "terms_sqp",
        "terms_rank",
        "terms_ppc",
        "rank_eligible",
        "selection_confidence",
        "competitor_brand",
        "competitor_rank_coverage",
        "competitor_benchmark_available",
        "competitor_target_rank_recent_4w",
        "competitor_rank_gap_recent_4w",
        "market_clicks",
        "market_purchases",
        "asin_clicks",
        "asin_purchases",
        "asin_cvr",
        "market_cvr",
        "impression_share",
        "click_share",
        "purchase_share",
        "avg_rank",
        "expected_rank",
        "rank_gap",
        "rank_volatility",
        "rank_change",
        "ppc_spend",
        "ppc_sales",
        "ppc_acos",
    ]
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle)
        writer.writerow(headers)
        for item in summaries:
            recent = item["observed"]["recent_4w"]
            coverage = item["coverage"]
            eligibility = item["eligibility"]
            derived = item["derived"]
            competitor = item.get("benchmark", {}).get("competitor", {})
            competitor_coverage = competitor.get("coverage", {})
            competitor_recent = competitor.get("raw_input", {}).get("recent_4w", {})
            competitor_gap = competitor.get("gap_to_target", {})
            writer.writerow(
                [
                    anchor_week,
                    ",".join(recent_weeks),
                    ",".join(baseline_weeks),
                    item["family"],
                    item["cluster"],
                    " | ".join(item["top_terms"]),
                    coverage["weeks_sqp"],
                    coverage["weeks_rank"],
                    coverage["weeks_ppc"],
                    coverage["terms_total"],
                    coverage["terms_sqp"],
                    coverage["terms_rank"],
                    coverage["terms_ppc"],
                    str(bool(eligibility["rank_eligible"])).lower(),
                    eligibility["selection_confidence"],
                    competitor.get("identity", {}).get("brand", ""),
                    competitor_coverage.get("weeks_keywords_recent_4w", 0),
                    str(bool(competitor_coverage.get("benchmark_available"))).lower(),
                    "" if competitor_recent.get("avg_rank") is None else f"{float(competitor_recent['avg_rank']):.2f}",
                    "" if competitor_gap.get("rank_recent_4w") is None else f"{float(competitor_gap['rank_recent_4w']):.2f}",
                    f"{float(recent['market_clicks']):.2f}",
                    f"{float(recent['market_purchases']):.2f}",
                    f"{float(recent['asin_clicks']):.2f}",
                    f"{float(recent['asin_purchases']):.2f}",
                    f"{float(recent['asin_cvr']):.4f}",
                    f"{float(recent['market_cvr']):.4f}",
                    f"{float(recent['impression_share']):.4f}",
                    f"{float(recent['click_share']):.4f}",
                    f"{float(recent['purchase_share']):.4f}",
                    "" if recent["avg_rank"] is None else f"{float(recent['avg_rank']):.2f}",
                    "" if derived["expected_rank"] is None else f"{float(derived['expected_rank']):.2f}",
                    "" if derived["rank_gap"] is None else f"{float(derived['rank_gap']):.2f}",
                    "" if recent["rank_volatility"] is None else f"{float(recent['rank_volatility']):.2f}",
                    "" if derived["rank_change"] is None else f"{float(derived['rank_change']):.2f}",
                    f"{float(recent['ppc_spend']):.2f}",
                    f"{float(recent['ppc_sales']):.2f}",
                    f"{float(recent['ppc_acos']):.4f}",
                ]
            )


WINDOW_ROLLUP_FIELDS = SQP_FIELDS + PPC_FIELDS + (
    "rank_weight",
    "rank_sum",
    "rank_span_sum",
    "rank_term_count",
)


def recent_window(week_order: list[str]) -> list[str]:
    return week_order[-SAMPLE_RECENT_WEEKS:]


def recent_window_for_anchor(week_order: list[str], anchor_week: str) -> list[str]:
    anchor_index = week_order.index(anchor_week)
    start_index = max(0, anchor_index - SAMPLE_RECENT_WEEKS + 1)
    return week_order[start_index : anchor_index + 1]


def baseline_window_for_anchor(week_order: list[str], anchor_week: str) -> list[str]:
    anchor_index = week_order.index(anchor_week)
    return week_order[: anchor_index + 1]


def build_brand_metrics_window(
    brand_metrics: dict[str, dict[str, float]],
    baseline_weeks: list[str],
) -> dict[str, dict[str, float]]:
    return {
        week_label: {
            "awareness": float(brand_metrics.get(week_label, {}).get("awareness", 0.0)),
            "consideration": float(brand_metrics.get(week_label, {}).get("consideration", 0.0)),
            "purchase": float(brand_metrics.get(week_label, {}).get("purchase", 0.0)),
        }
        for week_label in baseline_weeks
    }


def build_scp_window(
    scp_week_asin: dict[tuple[str, str], dict[str, float]],
    week_meta: dict[str, dict[str, object]],
    anchor_week: str,
    recent_weeks: list[str],
    baseline_weeks: list[str],
    target_asin: str,
) -> dict[str, object]:
    asins = sorted({asin for _, asin in scp_week_asin.keys()})
    current_totals = make_scp_metrics()
    recent_totals = make_scp_metrics()
    baseline_totals = make_scp_metrics()
    weekly: list[dict[str, object]] = []

    for week_label in baseline_weeks:
        week_rollup = make_scp_metrics()
        asin_count = 0
        for asin in asins:
            metrics = scp_week_asin.get((week_label, asin))
            if metrics is None:
                continue
            add_scp_metrics(week_rollup, metrics)
            if sum(float(metrics[field]) for field in SCP_FIELDS) > 0:
                asin_count += 1
        week_payload = finalize_scp_metrics(week_rollup)
        week_payload["week_label"] = week_label
        week_payload["week_number"] = int(week_meta[week_label]["week_number"])
        week_payload["start_date"] = str(week_meta[week_label]["start_date"])
        week_payload["asin_count"] = asin_count
        weekly.append(week_payload)
        add_scp_metrics(baseline_totals, week_rollup)
        if week_label == anchor_week:
            add_scp_metrics(current_totals, week_rollup)
        if week_label in recent_weeks:
            add_scp_metrics(recent_totals, week_rollup)

    current_final = finalize_scp_metrics(current_totals)
    recent_final = finalize_scp_metrics(recent_totals)
    baseline_final = finalize_scp_metrics(baseline_totals)
    asin_rows: list[dict[str, object]] = []

    for asin in asins:
        current_rollup = make_scp_metrics()
        recent_rollup = make_scp_metrics()
        baseline_rollup = make_scp_metrics()
        asin_weekly: list[dict[str, object]] = []
        selected_week_present = 0
        baseline_weeks_present = 0
        for week_label in baseline_weeks:
            metrics = scp_week_asin.get((week_label, asin))
            if metrics is None:
                metrics = make_scp_metrics()
            else:
                baseline_weeks_present += 1
            if week_label == anchor_week and scp_week_asin.get((week_label, asin)) is not None:
                selected_week_present += 1
            add_scp_metrics(baseline_rollup, metrics)
            if week_label == anchor_week:
                add_scp_metrics(current_rollup, metrics)
            if week_label in recent_weeks:
                add_scp_metrics(recent_rollup, metrics)
            weekly_payload = finalize_scp_metrics(metrics)
            weekly_payload["week_label"] = week_label
            weekly_payload["week_number"] = int(week_meta[week_label]["week_number"])
            weekly_payload["start_date"] = str(week_meta[week_label]["start_date"])
            asin_weekly.append(weekly_payload)

        current_payload = finalize_scp_metrics(current_rollup)
        recent_payload = finalize_scp_metrics(recent_rollup)
        baseline_payload = finalize_scp_metrics(baseline_rollup)
        current_payload["impression_share"] = safe_div(float(current_payload["impressions"]), float(current_final["impressions"]))
        current_payload["click_share"] = safe_div(float(current_payload["clicks"]), float(current_final["clicks"]))
        current_payload["cart_add_share"] = safe_div(float(current_payload["cart_adds"]), float(current_final["cart_adds"]))
        current_payload["purchase_share"] = safe_div(float(current_payload["purchases"]), float(current_final["purchases"]))
        current_payload["sales_share"] = safe_div(float(current_payload["sales"]), float(current_final["sales"]))
        recent_payload["impression_share"] = safe_div(float(recent_payload["impressions"]), float(recent_final["impressions"]))
        recent_payload["click_share"] = safe_div(float(recent_payload["clicks"]), float(recent_final["clicks"]))
        recent_payload["cart_add_share"] = safe_div(float(recent_payload["cart_adds"]), float(recent_final["cart_adds"]))
        recent_payload["purchase_share"] = safe_div(float(recent_payload["purchases"]), float(recent_final["purchases"]))
        recent_payload["sales_share"] = safe_div(float(recent_payload["sales"]), float(recent_final["sales"]))
        asin_rows.append(
            {
                "id": asin,
                "asin": asin,
                "is_target": asin == target_asin,
                "weeks_present_selected_week": selected_week_present,
                "weeks_present_baseline": baseline_weeks_present,
                "current_week": current_payload,
                "recent_4w": recent_payload,
                "baseline_to_anchor": baseline_payload,
                "weekly": asin_weekly,
                "impressions": float(current_payload["impressions"]),
                "clicks": float(current_payload["clicks"]),
                "cart_adds": float(current_payload["cart_adds"]),
                "purchases": float(current_payload["purchases"]),
                "sales": float(current_payload["sales"]),
                "ctr": float(current_payload["ctr"]),
                "atc_rate": float(current_payload["atc_rate"]),
                "purchase_rate": float(current_payload["purchase_rate"]),
                "cvr": float(current_payload["cvr"]),
                "impression_share": float(current_payload["impression_share"]),
                "click_share": float(current_payload["click_share"]),
                "cart_add_share": float(current_payload["cart_add_share"]),
                "purchase_share": float(current_payload["purchase_share"]),
                "sales_share": float(current_payload["sales_share"]),
            }
        )

    asin_rows.sort(
        key=lambda item: (
            float(item["purchases"]),
            float(item["clicks"]),
            float(item["impressions"]),
            float(item["sales"]),
        ),
        reverse=True,
    )
    current_final["asin_count"] = len([row for row in asin_rows if float(row["impressions"]) > 0 or float(row["clicks"]) > 0])
    recent_final["asin_count"] = len([row for row in asin_rows if float(row["recent_4w"]["impressions"]) > 0 or float(row["recent_4w"]["clicks"]) > 0])
    baseline_final["asin_count"] = len(asins)
    return {
        "meta": {
            "targetAsin": target_asin,
            "recentWindow": [anchor_week],
            "baselineWindow": baseline_weeks,
        },
        "current_week": current_final,
        "recent_4w": recent_final,
        "baseline_to_anchor": baseline_final,
        "weekly": weekly,
        "asins": asin_rows,
    }


def build_business_report_change_days(
    available_weeks: list[str],
    change_log_by_week: dict[str, list[dict[str, object]]],
) -> dict[str, dict[str, dict[str, object]]]:
    change_days: dict[str, dict[str, dict[str, object]]] = {}
    for week_label in available_weeks:
        day_map: dict[str, dict[str, object]] = {}
        for entry in change_log_by_week.get(week_label, []):
            if str(entry["week_label"]) != week_label:
                continue
            day = normalize_change_log_day(str(entry["timestamp"]))
            payload = day_map.setdefault(
                day,
                {
                    "change_count": 0,
                    "change_titles": [],
                },
            )
            payload["change_count"] += 1
            if len(payload["change_titles"]) < 4:
                payload["change_titles"].append(str(entry["title"]))
        change_days[week_label] = day_map
    return change_days


def build_business_reports_window(
    business_week_asin: dict[tuple[str, str], dict[str, float]],
    business_day_metrics: dict[tuple[str, str], dict[str, float]],
    week_meta: dict[str, dict[str, object]],
    anchor_week: str,
    baseline_weeks: list[str],
    target_asin: str,
    change_log_by_week: dict[str, list[dict[str, object]]],
) -> dict[str, object]:
    asins = sorted({asin for _, asin in business_week_asin.keys()})
    available_weeks = [
        week_label
        for week_label in baseline_weeks
        if any((week_label, asin) in business_week_asin for asin in asins)
    ]
    change_days = build_business_report_change_days(available_weeks, change_log_by_week)
    current_totals = make_business_report_metrics()
    baseline_totals = make_business_report_metrics()
    weekly: list[dict[str, object]] = []
    daily_by_week: dict[str, list[dict[str, object]]] = {}

    for week_label in available_weeks:
        week_rollup = make_business_report_metrics()
        asin_count = 0
        for asin in asins:
            metrics = business_week_asin.get((week_label, asin))
            if metrics is None:
                continue
            add_business_report_metrics(week_rollup, metrics)
            if (
                float(metrics["sessions"]) > 0.0
                or float(metrics["order_items"]) > 0.0
                or float(metrics["units_ordered"]) > 0.0
                or float(metrics["sales"]) > 0.0
            ):
                asin_count += 1
        week_payload = finalize_business_report_metrics(week_rollup)
        week_payload["week_label"] = week_label
        week_payload["week_number"] = int(week_meta[week_label]["week_number"])
        week_payload["start_date"] = str(week_meta[week_label]["start_date"])
        week_payload["asin_count"] = asin_count
        weekly.append(week_payload)
        add_business_report_metrics(baseline_totals, week_rollup)
        if week_label == anchor_week:
            add_business_report_metrics(current_totals, week_rollup)

        day_rows: list[dict[str, object]] = []
        day_keys = sorted(day for label, day in business_day_metrics.keys() if label == week_label)
        for day in day_keys:
            metrics = finalize_business_report_metrics(business_day_metrics[(week_label, day)])
            change_info = change_days.get(week_label, {}).get(
                day,
                {"change_count": 0, "change_titles": []},
            )
            day_rows.append(
                {
                    "date": day,
                    "date_label": format_change_log_date_label(day),
                    "day_label": format_chart_day_label(day),
                    "weekday_label": format_chart_day_weekday(day),
                    "sessions": float(metrics["sessions"]),
                    "page_views": float(metrics["page_views"]),
                    "order_items": float(metrics["order_items"]),
                    "units_ordered": float(metrics["units_ordered"]),
                    "sales": float(metrics["sales"]),
                    "order_item_session_percentage": float(metrics["order_item_session_percentage"]),
                    "unit_session_percentage": float(metrics["unit_session_percentage"]),
                    "buy_box_percentage": float(metrics["buy_box_percentage"]),
                    "change_count": int(change_info["change_count"]),
                    "change_titles": list(change_info["change_titles"]),
                }
            )
        daily_by_week[week_label] = day_rows

    current_final = finalize_business_report_metrics(current_totals)
    baseline_final = finalize_business_report_metrics(baseline_totals)
    asin_rows: list[dict[str, object]] = []

    for asin in asins:
        current_rollup = make_business_report_metrics()
        baseline_rollup = make_business_report_metrics()
        asin_weekly: list[dict[str, object]] = []
        selected_week_present = 0
        baseline_weeks_present = 0
        for week_label in available_weeks:
            metrics = business_week_asin.get((week_label, asin))
            if metrics is None:
                metrics = make_business_report_metrics()
            else:
                baseline_weeks_present += 1
            if week_label == anchor_week and business_week_asin.get((week_label, asin)) is not None:
                selected_week_present += 1
            add_business_report_metrics(baseline_rollup, metrics)
            if week_label == anchor_week:
                add_business_report_metrics(current_rollup, metrics)
            weekly_payload = finalize_business_report_metrics(metrics)
            weekly_payload["week_label"] = week_label
            weekly_payload["week_number"] = int(week_meta[week_label]["week_number"])
            weekly_payload["start_date"] = str(week_meta[week_label]["start_date"])
            asin_weekly.append(weekly_payload)

        current_payload = finalize_business_report_metrics(current_rollup)
        baseline_payload = finalize_business_report_metrics(baseline_rollup)
        asin_rows.append(
            {
                "id": asin,
                "asin": asin,
                "is_target": asin == target_asin,
                "weeks_present_selected_week": selected_week_present,
                "weeks_present_baseline": baseline_weeks_present,
                "current_week": current_payload,
                "baseline_to_anchor": baseline_payload,
                "weekly": asin_weekly,
                "sessions": float(current_payload["sessions"]),
                "page_views": float(current_payload["page_views"]),
                "order_items": float(current_payload["order_items"]),
                "units_ordered": float(current_payload["units_ordered"]),
                "sales": float(current_payload["sales"]),
                "order_item_session_percentage": float(current_payload["order_item_session_percentage"]),
                "unit_session_percentage": float(current_payload["unit_session_percentage"]),
                "buy_box_percentage": float(current_payload["buy_box_percentage"]),
            }
        )

    asin_rows.sort(
        key=lambda item: (
            float(item["sessions"]),
            float(item["order_items"]),
            float(item["units_ordered"]),
            float(item["sales"]),
        ),
        reverse=True,
    )
    current_final["asin_count"] = len([row for row in asin_rows if float(row["sessions"]) > 0 or float(row["order_items"]) > 0])
    baseline_final["asin_count"] = len(asins)
    return {
        "meta": {
            "targetAsin": target_asin,
            "selectedWeek": anchor_week,
            "availableWeeks": available_weeks,
        },
        "current_week": current_final,
        "baseline_to_anchor": baseline_final,
        "weekly": weekly,
        "dailyByWeek": daily_by_week,
        "asins": asin_rows,
    }


def empty_rollup() -> dict[str, float]:
    return {field: 0.0 for field in WINDOW_ROLLUP_FIELDS}


def finalize_rollup(
    rollup: dict[str, float],
    rank_weeks: int = 0,
    weeks_in_window: int = 0,
) -> dict[str, float | int | None]:
    payload: dict[str, float | int | None] = {
        field: float(rollup.get(field, 0.0))
        for field in WINDOW_ROLLUP_FIELDS
    }
    payload["rank_weeks"] = int(rank_weeks)
    payload["weeks_in_window"] = int(weeks_in_window)
    rank_weight = float(payload["rank_weight"])
    payload["avg_rank"] = payload["rank_sum"] / rank_weight if rank_weight else None
    payload["rank_volatility"] = payload["rank_span_sum"] / rank_weight if rank_weight else None
    payload["market_ctr"] = safe_div(float(payload["market_clicks"]), float(payload["market_impressions"]))
    payload["market_cvr"] = safe_div(float(payload["market_purchases"]), float(payload["market_clicks"]))
    payload["asin_ctr"] = safe_div(float(payload["asin_clicks"]), float(payload["asin_impressions"]))
    payload["asin_cvr"] = safe_div(float(payload["asin_purchases"]), float(payload["asin_clicks"]))
    payload["impression_share"] = safe_div(float(payload["asin_impressions"]), float(payload["market_impressions"]))
    payload["click_share"] = safe_div(float(payload["asin_clicks"]), float(payload["market_clicks"]))
    payload["cart_add_rate"] = safe_div(float(payload["market_cart_adds"]), float(payload["market_clicks"]))
    payload["asin_cart_add_rate"] = safe_div(float(payload["asin_cart_adds"]), float(payload["asin_clicks"]))
    payload["cart_add_share"] = safe_div(float(payload["asin_cart_adds"]), float(payload["market_cart_adds"]))
    payload["purchase_share"] = safe_div(float(payload["asin_purchases"]), float(payload["market_purchases"]))
    payload["ppc_acos"] = safe_div(float(payload["ppc_spend"]), float(payload["ppc_sales"]))
    payload["ppc_cvr"] = safe_div(float(payload["ppc_orders"]), float(payload["ppc_clicks"]))
    return payload


def build_rank_week_rollup(
    terms: list[str],
    week_label: str,
    rank_term_week_detail: dict[tuple[str, str], dict[str, object]],
) -> dict[str, float]:
    rollup = empty_rollup()
    for term in terms:
        detail = rank_term_week_detail.get((week_label, term))
        if not detail:
            continue
        ranks = detail.get("ranks") or []
        if not ranks:
            continue
        avg_rank = mean(ranks)
        rank_span = max(ranks) - min(ranks)
        weight = float(detail.get("search_volume", 0.0)) or float(len(ranks))
        rollup["rank_weight"] += weight
        rollup["rank_sum"] += avg_rank * weight
        rollup["rank_span_sum"] += rank_span * weight
        rollup["rank_term_count"] += 1.0
    return rollup


def build_window_rollup_for_terms(
    terms: list[str],
    weeks: list[str],
    sqp_term_week: dict[tuple[str, str], dict[str, float]],
    ppc_term_week: dict[tuple[str, str], dict[str, float]],
    rank_term_week_detail: dict[tuple[str, str], dict[str, object]],
) -> dict[str, float | int | None]:
    rollup = empty_rollup()
    rank_weeks = 0
    for week_label in weeks:
        for term in terms:
            sqp_metrics = sqp_term_week.get((week_label, term))
            if sqp_metrics:
                for field in SQP_FIELDS:
                    rollup[field] += float(sqp_metrics.get(field, 0.0))
            ppc_metrics = ppc_term_week.get((week_label, term))
            if ppc_metrics:
                for field in PPC_FIELDS:
                    rollup[field] += float(ppc_metrics.get(field, 0.0))
        rank_rollup = build_rank_week_rollup(terms, week_label, rank_term_week_detail)
        if rank_rollup["rank_weight"]:
            rank_weeks += 1
        for field in ("rank_weight", "rank_sum", "rank_span_sum", "rank_term_count"):
            rollup[field] += rank_rollup[field]
    return finalize_rollup(rollup, rank_weeks=rank_weeks, weeks_in_window=len(weeks))


def build_cluster_week_records_primary(
    cluster_terms: dict[tuple[str, str], set[str]],
    term_info: dict[str, dict[str, object]],
    sqp_term_week: dict[tuple[str, str], dict[str, float]],
    ppc_term_week: dict[tuple[str, str], dict[str, float]],
    rank_term_week_detail: dict[tuple[str, str], dict[str, object]],
    week_meta: dict[str, dict[str, object]],
    week_order: list[str],
) -> tuple[dict[tuple[str, str], list[dict[str, object]]], dict[tuple[str, str], list[str]]]:
    records_by_cluster: dict[tuple[str, str], list[dict[str, object]]] = {}
    primary_terms_by_cluster: dict[tuple[str, str], list[str]] = {}

    for key, terms in cluster_terms.items():
        primary_terms = sorted(term for term in terms if term_info.get(term, {}).get("has_sqp"))
        primary_terms_by_cluster[key] = primary_terms
        if not primary_terms:
            continue
        family, cluster = key
        records: list[dict[str, object]] = []
        for week_label in week_order:
            rollup = empty_rollup()
            for term in primary_terms:
                sqp_metrics = sqp_term_week.get((week_label, term))
                if sqp_metrics:
                    for field in SQP_FIELDS:
                        rollup[field] += float(sqp_metrics.get(field, 0.0))
                ppc_metrics = ppc_term_week.get((week_label, term))
                if ppc_metrics:
                    for field in PPC_FIELDS:
                        rollup[field] += float(ppc_metrics.get(field, 0.0))
            rank_rollup = build_rank_week_rollup(primary_terms, week_label, rank_term_week_detail)
            for field in ("rank_weight", "rank_sum", "rank_span_sum", "rank_term_count"):
                rollup[field] += rank_rollup[field]
            record = {
                "week_label": week_label,
                "week_number": int(week_meta[week_label]["week_number"]),
                "start_date": str(week_meta[week_label]["start_date"]),
                "family": family,
                "cluster": cluster,
            }
            record.update(finalize_rollup(rollup, rank_weeks=1 if rank_rollup["rank_weight"] else 0, weeks_in_window=1))
            records.append(record)
        records_by_cluster[key] = records
    return records_by_cluster, primary_terms_by_cluster


def selection_confidence_label(
    terms_total: int,
    terms_sqp: int,
    weeks_sqp: int,
) -> str:
    ratio = safe_div(float(terms_sqp), float(terms_total))
    if weeks_sqp >= 4 and ratio >= 0.35:
        return "high"
    if weeks_sqp >= 2 and ratio >= 0.15:
        return "medium"
    return "low"


def sort_primary_terms(
    terms: list[str],
    term_profiles: dict[str, dict[str, object]],
) -> list[str]:
    return sorted(
        terms,
        key=lambda term: (
            float(term_profiles[term]["observed"]["current_week"]["query_volume"]),
            float(term_profiles[term]["observed"]["baseline_13w"]["query_volume"]),
            float(term_profiles[term]["observed"]["baseline_13w"]["market_purchases"]),
        ),
        reverse=True,
    )


def build_term_weekly_series(
    term: str,
    baseline_weeks: list[str],
    week_meta: dict[str, dict[str, object]],
    sqp_term_week: dict[tuple[str, str], dict[str, float]],
    ppc_term_week: dict[tuple[str, str], dict[str, float]],
    rank_term_week_detail: dict[tuple[str, str], dict[str, object]],
) -> list[dict[str, object]]:
    series: list[dict[str, object]] = []
    for week_label in baseline_weeks:
        observed = build_window_rollup_for_terms(
            [term],
            [week_label],
            sqp_term_week,
            ppc_term_week,
            rank_term_week_detail,
        )
        weekly_record = {
            "week_label": week_label,
            "week_number": int(week_meta[week_label]["week_number"]),
            "start_date": str(week_meta[week_label]["start_date"]),
        }
        weekly_record.update(observed)
        series.append(weekly_record)
    return series


def build_term_profiles(
    term_info: dict[str, dict[str, object]],
    sqp_term_week: dict[tuple[str, str], dict[str, float]],
    ppc_term_week: dict[tuple[str, str], dict[str, float]],
    rank_term_week_detail: dict[tuple[str, str], dict[str, object]],
    anchor_week: str,
    recent_weeks: list[str],
    baseline_weeks: list[str],
    week_meta: dict[str, dict[str, object]],
    competitor_ranks: dict[tuple[str, str], float],
) -> dict[str, dict[str, object]]:
    recent_week_set = set(recent_weeks)
    baseline_week_set = set(baseline_weeks)
    profiles: dict[str, dict[str, object]] = {}
    for term, info in term_info.items():
        current_observed = build_window_rollup_for_terms([term], [anchor_week], sqp_term_week, ppc_term_week, rank_term_week_detail)
        recent_observed = build_window_rollup_for_terms([term], recent_weeks, sqp_term_week, ppc_term_week, rank_term_week_detail)
        baseline_observed = build_window_rollup_for_terms([term], baseline_weeks, sqp_term_week, ppc_term_week, rank_term_week_detail)
        weeks_sqp_recent = sorted(baseline_week_set.intersection(recent_week_set.intersection(set(info["weeks_sqp"]))))
        weeks_rank_recent = sorted(baseline_week_set.intersection(recent_week_set.intersection(set(info["weeks_rank"]))))
        weeks_ppc_recent = sorted(baseline_week_set.intersection(recent_week_set.intersection(set(info["weeks_ppc"]))))
        weeks_sqp_baseline = sorted(baseline_week_set.intersection(set(info["weeks_sqp"])))
        weeks_rank_baseline = sorted(baseline_week_set.intersection(set(info["weeks_rank"])))
        weeks_ppc_baseline = sorted(baseline_week_set.intersection(set(info["weeks_ppc"])))
        rank_search_volume = max(
            [
                float(rank_term_week_detail.get((week_label, term), {}).get("search_volume", 0.0))
                for week_label in baseline_weeks
            ],
            default=0.0,
        )
        coverage = {
            "weeks_sqp": len(weeks_sqp_baseline),
            "weeks_rank": len(weeks_rank_baseline),
            "weeks_ppc": len(weeks_ppc_baseline),
            "has_sqp": bool(weeks_sqp_baseline),
            "has_rank": bool(weeks_rank_baseline),
            "has_ppc": bool(weeks_ppc_baseline),
            "recent_4w": {
                "weeks_sqp": len(weeks_sqp_recent),
                "weeks_rank": len(weeks_rank_recent),
                "weeks_ppc": len(weeks_ppc_recent),
                "has_sqp": bool(weeks_sqp_recent),
                "has_rank": bool(weeks_rank_recent),
                "has_ppc": bool(weeks_ppc_recent),
            },
            "baseline_to_anchor": {
                "weeks_sqp": len(weeks_sqp_baseline),
                "weeks_rank": len(weeks_rank_baseline),
                "weeks_ppc": len(weeks_ppc_baseline),
            },
        }
        profiles[term] = {
            "term": term,
            "family": info["family"],
            "cluster": info["cluster"],
            "observed": {
                "current_week": current_observed,
                "recent_4w": recent_observed,
                "baseline_13w": baseline_observed,
            },
            "weekly": build_term_weekly_series(
                term,
                baseline_weeks,
                week_meta,
                sqp_term_week,
                ppc_term_week,
                rank_term_week_detail,
            ),
            "coverage": coverage,
            "selection_volume_selected_week": float(current_observed["query_volume"]),
            "selection_volume_baseline_13w": float(baseline_observed["query_volume"]),
            "display_context": {
                "rank_search_volume": rank_search_volume,
            },
            "selection_status": "excluded",
            "selection_reason": "No SQP backing in selected baseline window",
            "benchmark": build_term_competitor_benchmark(
                term,
                recent_observed,
                baseline_observed,
                competitor_ranks,
                recent_weeks,
                baseline_weeks,
            ),
        }
    return profiles


def build_verified_summaries(
    cluster_terms: dict[tuple[str, str], set[str]],
    term_info: dict[str, dict[str, object]],
    term_profiles: dict[str, dict[str, object]],
    cluster_week_records: dict[tuple[str, str], list[dict[str, object]]],
    primary_terms_by_cluster: dict[tuple[str, str], list[str]],
    anchor_week: str,
    recent_weeks: list[str],
    baseline_weeks: list[str],
) -> list[dict[str, object]]:
    recent_week_set = set(recent_weeks)
    baseline_week_set = set(baseline_weeks)
    summaries: list[dict[str, object]] = []

    for (family, cluster), terms in cluster_terms.items():
        primary_terms = [
            term
            for term in primary_terms_by_cluster.get((family, cluster), [])
            if term_profiles[term]["coverage"]["has_sqp"]
        ]
        if not primary_terms:
            continue
        records = [
            record
            for record in cluster_week_records[(family, cluster)]
            if str(record["week_label"]) in baseline_week_set
        ]
        recent_records = [record for record in records if str(record["week_label"]) in recent_week_set]
        prior_records = [record for record in records if str(record["week_label"]) not in recent_week_set]
        current_records = [record for record in records if str(record["week_label"]) == anchor_week]
        current_observed = finalize_rollup(
            {
                field: sum(float(record.get(field, 0.0)) for record in current_records)
                for field in WINDOW_ROLLUP_FIELDS
            },
            rank_weeks=sum(1 for record in current_records if record["avg_rank"] is not None),
            weeks_in_window=len(current_records),
        )
        recent_observed = finalize_rollup(
            {
                field: sum(float(record.get(field, 0.0)) for record in recent_records)
                for field in WINDOW_ROLLUP_FIELDS
            },
            rank_weeks=sum(1 for record in recent_records if record["avg_rank"] is not None),
            weeks_in_window=len(recent_weeks),
        )
        baseline_observed = finalize_rollup(
            {
                field: sum(float(record.get(field, 0.0)) for record in records)
                for field in WINDOW_ROLLUP_FIELDS
            },
            rank_weeks=sum(1 for record in records if record["avg_rank"] is not None),
            weeks_in_window=len(baseline_weeks),
        )
        prior_observed = finalize_rollup(
            {
                field: sum(float(record.get(field, 0.0)) for record in prior_records)
                for field in WINDOW_ROLLUP_FIELDS
            },
            rank_weeks=sum(1 for record in prior_records if record["avg_rank"] is not None),
            weeks_in_window=len(prior_records),
        )

        all_terms = sorted(terms)
        baseline_sqp_weeks = {
            week
            for term in all_terms
            for week in term_info[term]["weeks_sqp"]
            if week in baseline_week_set
        }
        baseline_rank_weeks = {
            week
            for term in all_terms
            for week in term_info[term]["weeks_rank"]
            if week in baseline_week_set
        }
        baseline_ppc_weeks = {
            week
            for term in all_terms
            for week in term_info[term]["weeks_ppc"]
            if week in baseline_week_set
        }
        recent_sqp_weeks = {
            week
            for term in all_terms
            for week in term_info[term]["weeks_sqp"]
            if week in recent_week_set
        }
        recent_rank_weeks = {
            week
            for term in all_terms
            for week in term_info[term]["weeks_rank"]
            if week in recent_week_set
        }
        recent_ppc_weeks = {
            week
            for term in all_terms
            for week in term_info[term]["weeks_ppc"]
            if week in recent_week_set
        }
        coverage = {
            "weeks_sqp": len(baseline_sqp_weeks),
            "weeks_rank": len(baseline_rank_weeks),
            "weeks_ppc": len(baseline_ppc_weeks),
            "terms_total": len(all_terms),
            "terms_sqp": sum(1 for term in all_terms if term_profiles[term]["coverage"]["has_sqp"]),
            "terms_rank": sum(1 for term in all_terms if term_profiles[term]["coverage"]["has_rank"]),
            "terms_ppc": sum(1 for term in all_terms if term_profiles[term]["coverage"]["has_ppc"]),
            "excluded_non_sqp_terms": sum(1 for term in all_terms if not term_profiles[term]["coverage"]["has_sqp"]),
            "excluded_ppc_only_terms": sum(
                1 for term in all_terms
                if term_profiles[term]["coverage"]["has_ppc"]
                and not term_profiles[term]["coverage"]["has_sqp"]
                and not term_profiles[term]["coverage"]["has_rank"]
            ),
            "excluded_rank_only_terms": sum(
                1 for term in all_terms
                if term_profiles[term]["coverage"]["has_rank"]
                and not term_profiles[term]["coverage"]["has_sqp"]
                and not term_profiles[term]["coverage"]["has_ppc"]
            ),
            "recent_4w": {
                "weeks_sqp": len(recent_sqp_weeks),
                "weeks_rank": len(recent_rank_weeks),
                "weeks_ppc": len(recent_ppc_weeks),
                "terms_sqp": sum(1 for term in all_terms if term_profiles[term]["coverage"]["recent_4w"]["has_sqp"]),
                "terms_rank": sum(1 for term in all_terms if term_profiles[term]["coverage"]["recent_4w"]["has_rank"]),
                "terms_ppc": sum(1 for term in all_terms if term_profiles[term]["coverage"]["recent_4w"]["has_ppc"]),
            },
        }
        eligibility = {
            "rank_eligible": int(recent_observed["rank_weeks"]) >= 4 and float(recent_observed["asin_clicks"]) >= 20,
            "watchlist_eligible": any((
                float(recent_observed["market_clicks"]) > 0,
                float(recent_observed["ppc_clicks"]) > 0,
            )),
            "selection_confidence": selection_confidence_label(
                coverage["terms_total"],
                coverage["terms_sqp"],
                coverage["weeks_sqp"],
            ),
        }
        top_terms = sort_primary_terms(primary_terms, term_profiles)[:4]
        rank_change = None
        if recent_observed["avg_rank"] is not None and prior_observed["avg_rank"] is not None:
            rank_change = float(recent_observed["avg_rank"]) - float(prior_observed["avg_rank"])
        summary = {
            "id": slugify(f"{family}-{cluster}"),
            "family": family,
            "cluster": cluster,
            "core": cluster != "Unclustered" and (
                float(baseline_observed["market_purchases"]) >= 200
                or float(recent_observed["market_purchases"]) >= 40
                or float(recent_observed["query_volume"]) >= 1500
            ),
            "terms_count": coverage["terms_sqp"],
            "top_terms": top_terms,
            "weekly": records,
            "observed": {
                "current_week": current_observed,
                "recent_4w": recent_observed,
                "baseline_13w": baseline_observed,
            },
            "coverage": coverage,
            "eligibility": eligibility,
            "derived": {
                "rank_change": rank_change,
                "purchase_share_delta": (
                    float(recent_observed["purchase_share"]) - float(prior_observed["purchase_share"])
                    if prior_records
                    else None
                ),
                "fit_gap": float(recent_observed["asin_cvr"]) - float(recent_observed["market_cvr"]),
                "share_leak": float(recent_observed["click_share"]) - float(recent_observed["purchase_share"]),
                "expected_rank": None,
                "rank_gap": None,
                "benchmark_signals": [],
                "coverage_note": "",
            },
            "benchmark": {
                "competitor": {
                    "identity": competitor_identity_payload(),
                    "coverage": {
                        "weeks_keywords_recent_4w": 0,
                        "weeks_keywords_baseline_13w": 0,
                        "weeks_competitor_recent_4w": 0,
                        "weeks_competitor_baseline_13w": 0,
                        "terms_with_rank_recent_4w": 0,
                        "terms_with_rank_baseline_13w": 0,
                        "recent_rank_coverage_strength": "none",
                        "benchmark_available": False,
                    },
                    "raw_input": {
                        "recent_4w": {"avg_rank": None, "best_rank": None, "visibility_est": 0.0},
                        "baseline_13w": {"avg_rank": None, "best_rank": None, "visibility_est": 0.0},
                    },
                    "estimated_output": {
                        "recent_4w": {
                            "impressions_est": 0.0,
                            "clicks_est": 0.0,
                            "cart_adds_est": 0.0,
                            "purchases_est": 0.0,
                            "ctr_est": 0.0,
                            "cart_add_rate_est": 0.0,
                            "cvr_est": 0.0,
                            "impression_share_est": 0.0,
                            "click_share_est": 0.0,
                            "cart_add_share_est": 0.0,
                            "purchase_share_est": 0.0,
                        },
                        "baseline_13w": {
                            "impressions_est": 0.0,
                            "clicks_est": 0.0,
                            "cart_adds_est": 0.0,
                            "purchases_est": 0.0,
                            "ctr_est": 0.0,
                            "cart_add_rate_est": 0.0,
                            "cvr_est": 0.0,
                            "impression_share_est": 0.0,
                            "click_share_est": 0.0,
                            "cart_add_share_est": 0.0,
                            "purchase_share_est": 0.0,
                        },
                    },
                    "catalog_context": {
                        "recent_4w": {"weeks_present": 0.0, "sales_units": 0.0, "revenue": 0.0, "avg_price": 0.0},
                        "baseline_13w": {"weeks_present": 0.0, "sales_units": 0.0, "revenue": 0.0, "avg_price": 0.0},
                    },
                    "estimation": {
                        "method": "rank_visibility_x_market_funnel",
                        "sales_field_source": "dd_competitors_sales_units",
                        "sales_used_in_funnel_estimate": False,
                    },
                    "gap_to_target": {
                        "rank_recent_4w": None,
                        "rank_best_recent_4w": None,
                        "purchase_share_recent_4w": None,
                    },
                    "benchmark_available": False,
                }
            },
        }
        # top-level selected-week aliases to minimize frontend changes
        summary.update({
            "market_impressions": current_observed["market_impressions"],
            "asin_impressions": current_observed["asin_impressions"],
            "market_clicks": current_observed["market_clicks"],
            "market_cart_adds": current_observed["market_cart_adds"],
            "asin_cart_adds": current_observed["asin_cart_adds"],
            "market_purchases": current_observed["market_purchases"],
            "asin_clicks": current_observed["asin_clicks"],
            "asin_purchases": current_observed["asin_purchases"],
            "query_volume": current_observed["query_volume"],
            "search_volume": current_observed["query_volume"],
            "ppc_spend": current_observed["ppc_spend"],
            "ppc_sales": current_observed["ppc_sales"],
            "ppc_clicks": current_observed["ppc_clicks"],
            "ppc_cvr": current_observed["ppc_cvr"],
            "market_ctr": current_observed["market_ctr"],
            "asin_ctr": current_observed["asin_ctr"],
            "asin_cvr": current_observed["asin_cvr"],
            "market_cvr": current_observed["market_cvr"],
            "cart_add_rate": current_observed["cart_add_rate"],
            "asin_cart_add_rate": current_observed["asin_cart_add_rate"],
            "cart_add_share": current_observed["cart_add_share"],
            "impression_share": current_observed["impression_share"],
            "click_share": current_observed["click_share"],
            "purchase_share": current_observed["purchase_share"],
            "ppc_acos": current_observed["ppc_acos"],
            "avg_rank": current_observed["avg_rank"],
            "rank_volatility": current_observed["rank_volatility"],
            "rank_change": rank_change,
            "rank_weeks": current_observed["rank_weeks"],
            "weeks_covered": 1 if float(current_observed["query_volume"]) > 0 else 0,
        })
        summaries.append(summary)

    summaries.sort(key=lambda item: (float(item["market_purchases"]), float(item["query_volume"])), reverse=True)
    return summaries


def apply_expected_rank_secondary(summaries: list[dict[str, object]]) -> dict[str, float] | None:
    usable = [
        item for item in summaries
        if item["core"]
        and item["eligibility"]["rank_eligible"]
        and item["avg_rank"] is not None
        and float(item["asin_clicks"]) >= 20
    ]
    regression = linear_regression(usable)
    if not regression:
        return None
    for item in usable:
        expected_rank = regression["intercept"] + regression["slope"] * (float(item["asin_cvr"]) * 100)
        item["derived"]["expected_rank"] = expected_rank
        item["derived"]["rank_gap"] = float(item["avg_rank"]) - expected_rank
        item["expected_rank"] = expected_rank
        item["rank_gap"] = float(item["avg_rank"]) - expected_rank
    return regression


def attach_observation_metadata(summary: dict[str, object]) -> None:
    recent = summary["observed"]["recent_4w"]
    baseline = summary["observed"]["baseline_13w"]
    eligibility = summary["eligibility"]
    summary["derived"]["purchase_share_delta"] = float(recent["purchase_share"]) - float(baseline["purchase_share"])
    summary["derived"]["coverage_note"] = (
        "Recent organic-rank coverage is limited."
        if not eligibility["rank_eligible"]
        else "Recent organic-rank coverage is sufficient."
    )


def build_sqp_term_rows_verified(
    core: list[dict[str, object]],
    cluster_terms: dict[tuple[str, str], set[str]],
    term_profiles: dict[str, dict[str, object]],
) -> tuple[list[dict[str, object]], dict[str, list[str]], list[str], dict[str, list[dict[str, object]]]]:
    term_rows: list[dict[str, object]] = []
    cluster_term_ids: dict[str, list[str]] = {}
    cluster_audit_terms: dict[str, list[dict[str, object]]] = {}

    for cluster in core:
        key = (str(cluster["family"]), str(cluster["cluster"]))
        sqp_terms = [
            term for term in cluster_terms[key]
            if term_profiles[term]["coverage"]["has_sqp"]
        ]
        primary_terms = [
            term for term in sqp_terms
            if float(term_profiles[term]["selection_volume_selected_week"]) > 0
        ]
        historical_terms = [
            term for term in sqp_terms
            if float(term_profiles[term]["selection_volume_selected_week"]) <= 0
            and float(term_profiles[term]["selection_volume_baseline_13w"]) > 0
        ]
        primary_terms = sort_primary_terms(primary_terms, term_profiles)
        historical_terms = sorted(
            historical_terms,
            key=lambda term: (
                float(term_profiles[term]["selection_volume_baseline_13w"]),
                float(term_profiles[term]["observed"]["baseline_13w"]["market_purchases"]),
            ),
            reverse=True,
        )
        selected_terms = list(primary_terms[:18])
        if len(selected_terms) < 8:
            for term in historical_terms:
                if term not in selected_terms:
                    selected_terms.append(term)
                if len(selected_terms) >= 18:
                    break
        ids: list[str] = []
        audit_rows: list[dict[str, object]] = []
        selected_set = set(selected_terms)
        for term in sqp_terms:
            profile = term_profiles[term]
            if term in selected_set:
                profile["selection_status"] = "primary" if float(profile["selection_volume_selected_week"]) > 0 else "historical"
                profile["selection_reason"] = "Selected-week SQP volume" if profile["selection_status"] == "primary" else "13-week SQP volume"
            else:
                profile["selection_status"] = "excluded"
                profile["selection_reason"] = "Outside top SQP-backed selector terms"
            audit_rows.append({
                "term": term,
                "selection_status": profile["selection_status"],
                "selection_reason": profile["selection_reason"],
                "selection_volume_selected_week": profile["selection_volume_selected_week"],
                "selection_volume_baseline_13w": profile["selection_volume_baseline_13w"],
            })
        for term in sqp_terms:
            profile = term_profiles[term]
            current_observed = profile["observed"]["current_week"]
            baseline_observed = profile["observed"]["baseline_13w"]
            term_id = slugify(f"{cluster['id']}-{term}")
            ids.append(term_id)
            term_rows.append({
                "id": term_id,
                "term": term,
                "family": cluster["family"],
                "cluster": cluster["cluster"],
                "cluster_id": cluster["id"],
                "weekly": profile["weekly"],
                "selection_status": profile["selection_status"],
                "selection_reason": profile["selection_reason"],
                "selection_volume_selected_week": profile["selection_volume_selected_week"],
                "selection_volume_baseline_13w": profile["selection_volume_baseline_13w"],
                "display_context": profile["display_context"],
                "coverage": profile["coverage"],
                "observed": profile["observed"],
                "benchmark": profile["benchmark"],
                # top-level selected-week aliases
                "search_volume": float(profile["display_context"]["rank_search_volume"]),
                "query_volume": float(current_observed["query_volume"]),
                "query_volume_baseline": float(baseline_observed["query_volume"]),
                "volume_score": float(profile["selection_volume_selected_week"]),
                "market_impressions": float(current_observed["market_impressions"]),
                "asin_impressions": float(current_observed["asin_impressions"]),
                "market_clicks": float(current_observed["market_clicks"]),
                "asin_clicks": float(current_observed["asin_clicks"]),
                "market_purchases": float(current_observed["market_purchases"]),
                "asin_purchases": float(current_observed["asin_purchases"]),
                "market_ctr": float(current_observed["market_ctr"]),
                "market_cvr": float(current_observed["market_cvr"]),
                "asin_ctr": float(current_observed["asin_ctr"]),
                "asin_cvr": float(current_observed["asin_cvr"]),
                "impression_share": float(current_observed["impression_share"]),
                "click_share": float(current_observed["click_share"]),
                "cart_add_share": float(current_observed["cart_add_share"]),
                "asin_cart_add_rate": float(current_observed["asin_cart_add_rate"]),
                "purchase_share": float(current_observed["purchase_share"]),
                "competitor_rank": profile["benchmark"]["competitor"]["raw_input"]["recent_4w"]["avg_rank"],
                "competitor_visibility": profile["benchmark"]["competitor"]["estimated_output"]["recent_4w"]["visibility_est"],
            })
        cluster_term_ids[str(cluster["id"])] = ids
        cluster_audit_terms[str(cluster["id"])] = audit_rows

    term_rows.sort(
        key=lambda item: (
            float(item["selection_volume_selected_week"]),
            float(item["selection_volume_baseline_13w"]),
            float(item["market_purchases"]),
        ),
        reverse=True,
    )
    global_ids = [item["id"] for item in term_rows[:24]]
    return term_rows, cluster_term_ids, global_ids, cluster_audit_terms


def build_audit_output(
    summaries: list[dict[str, object]],
    term_profiles: dict[str, dict[str, object]],
    cluster_selector_audit: dict[str, list[dict[str, object]]],
    anchor_week: str,
    recent_weeks: list[str],
    baseline_weeks: list[str],
) -> dict[str, object]:
    cluster_audit = []
    warnings: list[str] = []
    for cluster in summaries:
        cluster_audit.append({
            "id": cluster["id"],
            "family": cluster["family"],
            "cluster": cluster["cluster"],
            "coverage": cluster["coverage"],
            "eligibility": cluster["eligibility"],
            "selector_terms": cluster_selector_audit.get(cluster["id"], []),
            "derived": cluster["derived"],
            "benchmark": cluster.get("benchmark", {}),
            "tst_compare": cluster.get("tstCompare", {}),
        })
        if cluster["coverage"]["terms_sqp"] < max(3, math.ceil(cluster["coverage"]["terms_total"] * 0.15)):
            warnings.append(f"{cluster['cluster']}: low SQP term backing relative to total clustered terms")
        if not cluster["eligibility"]["rank_eligible"]:
            warnings.append(f"{cluster['cluster']}: insufficient recent rank coverage")
        if any(row["selection_status"] == "historical" for row in cluster_selector_audit.get(cluster["id"], [])):
            warnings.append(f"{cluster['cluster']}: SQP term selector used historical fallback terms")
        competitor = cluster.get("benchmark", {}).get("competitor", {})
        competitor_coverage = competitor.get("coverage", {})
        if competitor_coverage.get("benchmark_available") and competitor_coverage.get("recent_rank_coverage_strength") == "thin":
            warnings.append(f"{cluster['cluster']}: competitor benchmark is visible but recent competitor rank coverage is thin")

    term_audit = []
    for term, profile in sorted(term_profiles.items()):
        term_audit.append({
            "term": term,
            "family": profile["family"],
            "cluster": profile["cluster"],
            "coverage": profile["coverage"],
            "selection_status": profile["selection_status"],
            "selection_reason": profile["selection_reason"],
            "selection_volume_selected_week": profile["selection_volume_selected_week"],
            "selection_volume_baseline_13w": profile["selection_volume_baseline_13w"],
            "display_context": profile["display_context"],
            "benchmark": profile.get("benchmark", {}),
        })

    return {
        "meta": {
            "anchor_week": anchor_week,
            "recent_window": recent_weeks,
            "baseline_window": baseline_weeks,
            "competitor": competitor_identity_payload(),
            "field_classification": {
                "observed_primary": [
                    "observed.recent_4w",
                    "coverage",
                    "eligibility",
                ],
                "raw_benchmark": [
                    "benchmark.competitor.catalog_context",
                    "benchmark.competitor.raw_input",
                ],
                "modeled_benchmark": [
                    "benchmark.competitor.estimated_output",
                ],
                "observed_compare": [
                    "tstCompare",
                ],
            },
        },
        "warnings": warnings,
        "clusters": cluster_audit,
        "terms": term_audit,
    }


def build_window_bundle(
    anchor_week: str,
    week_order: list[str],
    week_meta: dict[str, dict[str, object]],
    cluster_terms: dict[tuple[str, str], set[str]],
    term_info: dict[str, dict[str, object]],
    sqp_term_week: dict[tuple[str, str], dict[str, float]],
    tst_term_week: dict[tuple[str, str], dict[str, float]],
    ppc_term_week: dict[tuple[str, str], dict[str, float]],
    rank_term_week_detail: dict[tuple[str, str], dict[str, object]],
    cluster_week_records: dict[tuple[str, str], list[dict[str, object]]],
    primary_terms_by_cluster: dict[tuple[str, str], list[str]],
    competitor_ranks: dict[tuple[str, str], float],
    competitor_weekly: dict[str, dict[str, float]],
    brand_metrics: dict[str, dict[str, float]],
    scp_week_asin: dict[tuple[str, str], dict[str, float]],
    business_week_asin: dict[tuple[str, str], dict[str, float]],
    business_day_metrics: dict[tuple[str, str], dict[str, float]],
    target_asin: str,
    change_log_by_week: dict[str, list[dict[str, object]]],
) -> tuple[dict[str, object], dict[str, object]]:
    recent_weeks = recent_window_for_anchor(week_order, anchor_week)
    baseline_weeks = baseline_window_for_anchor(week_order, anchor_week)
    term_profiles = build_term_profiles(
        term_info,
        sqp_term_week,
        ppc_term_week,
        rank_term_week_detail,
        anchor_week,
        recent_weeks,
        baseline_weeks,
        week_meta,
        competitor_ranks,
    )
    summaries = build_verified_summaries(
        cluster_terms,
        term_info,
        term_profiles,
        cluster_week_records,
        primary_terms_by_cluster,
        anchor_week,
        recent_weeks,
        baseline_weeks,
    )
    attach_competitor_benchmarks(
        summaries,
        primary_terms_by_cluster,
        term_profiles,
        competitor_weekly,
        recent_weeks,
        baseline_weeks,
    )
    attach_tst_compare(
        summaries,
        cluster_terms,
        tst_term_week,
        recent_weeks,
        baseline_weeks,
        week_meta,
    )
    regression = apply_expected_rank_secondary(summaries)
    for item in summaries:
        attach_observation_metadata(item)
    summaries.sort(
        key=lambda item: (
            float(item["market_purchases"]),
            float(item["query_volume"]),
            float(item["asin_clicks"]),
        ),
        reverse=True,
    )

    core = [item for item in summaries if item["core"]]
    sqp_terms, cluster_term_ids, sqp_global_ids, cluster_selector_audit = build_sqp_term_rows_verified(
        core,
        cluster_terms,
        term_profiles,
    )
    audit_output = build_audit_output(
        core,
        term_profiles,
        cluster_selector_audit,
        anchor_week,
        recent_weeks,
        baseline_weeks,
    )

    demand_ranked = sorted(
        core,
        key=lambda item: (
            float(item["market_purchases"]),
            float(item["query_volume"]),
            float(item["asin_clicks"]),
        ),
        reverse=True,
    )
    ranked_core = [item for item in demand_ranked if item["eligibility"]["rank_eligible"] and item["avg_rank"] is not None]
    ppc_clusters = sorted(core, key=lambda item: float(item["ppc_spend"]), reverse=True)[:8]
    line_clusters = ranked_core[:7]
    spotlight = demand_ranked[:5]
    brand_metrics_window = build_brand_metrics_window(brand_metrics, baseline_weeks)
    scp_window = build_scp_window(scp_week_asin, week_meta, anchor_week, recent_weeks, baseline_weeks, target_asin)
    business_reports_window = build_business_reports_window(
        business_week_asin,
        business_day_metrics,
        week_meta,
        anchor_week,
        baseline_weeks,
        target_asin,
        change_log_by_week,
    )

    bundle = {
        "meta": {
            "anchorWeek": anchor_week,
            "competitorBrand": COMPETITOR_BRAND,
            "competitorAsin": COMPETITOR_ASIN,
            "benchmarkPolicy": "context_only",
            "competitor": competitor_identity_payload(),
            "recentWindow": [anchor_week],
            "baselineWindow": baseline_weeks,
            "policy": {
                "primary_window": "selected_week",
                "baseline_window": "baseline_13w",
                "term_truth_set": "sqp_backed_only",
                "dashboard_policy": "raw_first",
                "benchmark_policy": "context_only",
            },
        },
        "weeks": baseline_weeks,
        "clusters": core,
        "scatterClusterIds": [item["id"] for item in demand_ranked],
        "lineClusterIds": [item["id"] for item in line_clusters],
        "shareClusterIds": [item["id"] for item in demand_ranked[:8]],
        "ppcClusterIds": [item["id"] for item in ppc_clusters],
        "defaultClusterIds": [item["id"] for item in spotlight],
        "sqpTerms": sqp_terms,
        "sqpClusterTerms": cluster_term_ids,
        "sqpGlobalTermIds": sqp_global_ids,
        "regression": regression,
        "brandMetricsWindow": brand_metrics_window,
        "brandMetrics": brand_metrics_window,
        "competitorWeekly": build_competitor_weekly_series(baseline_weeks, competitor_weekly),
        "scp": scp_window,
        "businessReports": business_reports_window,
    }
    return bundle, audit_output


def build_html(data: dict[str, object]) -> str:
    data_json = json.dumps(data, separators=(",", ":"))
    template = """<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>WPR Dashboard</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300..700;1,9..40,300..700&family=Space+Grotesk:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    :root {
      --panel: rgba(20, 29, 27, 0.88);
      --panel-2: rgba(15, 24, 23, 0.82);
      --ink: #f1ebde;
      --muted: #a3b5a8;
      --dim: #8fa894;
      --accent: #d5ff62;
      --teal: #77dfd0;
      --amber: #f3bc55;
      --orange: #f5a623;
      --coral: #ff7a5c;
      --cool: #8fc7ff;
      --purple: #e0a4ff;
      --down-red: #d65044;
      --radius: 14px;
      --shadow: 0 8px 32px rgba(0,0,0,0.25);
      --font-display: "Space Grotesk", system-ui, sans-serif;
      --font-body: "DM Sans", system-ui, sans-serif;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      height: 100dvh; overflow: hidden;
      display: grid; grid-template-rows: auto 1fr;
      color: var(--ink);
      font-family: var(--font-body);
      background:
        radial-gradient(circle at top left, rgba(122,255,195,0.07), transparent 30%),
        radial-gradient(circle at top right, rgba(255,169,64,0.06), transparent 26%),
        linear-gradient(160deg, #07100f 0%, #0d1514 44%, #0b1312 100%);
      letter-spacing: 0.01em;
    }
    main { min-height: 0; height: 100%; overflow: hidden; }

    /* ===== TOP BAR ===== */
    .top-bar {
      display: flex; align-items: center; gap: 8px; padding: 8px 20px;
      background: rgba(0,0,0,0.4); border-bottom: 1px solid rgba(255,255,255,0.08);
      z-index: 100; flex-shrink: 0;
    }
    .top-bar .brand { font-family: var(--font-display); font-size: 14px; font-weight: 700; color: var(--accent); letter-spacing: 0.1em; text-transform: uppercase; margin-right: 14px; }
    .tab-btn {
      appearance: none; border: 1px solid rgba(255,255,255,0.1); background: rgba(255,255,255,0.04);
      color: var(--muted); font-family: var(--font-display); font-size: 11px; letter-spacing: 0.12em; text-transform: uppercase;
      padding: 6px 16px; border-radius: 999px; cursor: pointer; transition: all 180ms ease;
    }
    .tab-btn:hover { color: var(--ink); background: rgba(255,255,255,0.07); }
    .tab-btn:focus-visible { outline: none !important; box-shadow: 0 0 0 2px var(--accent); }
    .tab-btn.active { color: #09100f; background: var(--accent); border-color: rgba(213,255,98,0.7); font-weight: 600; }
    .spacer { flex: 1; }
    .week-select {
      appearance: none;
      background: rgba(255,255,255,0.06);
      border: 1px solid rgba(255,255,255,0.1);
      color: var(--ink); font-family: var(--font-body); font-size: 11px;
      letter-spacing: 0.06em; padding: 6px 30px 6px 12px;
      border-radius: 999px; cursor: pointer; transition: all 180ms ease;
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%238fa894'/%3E%3C/svg%3E");
      background-repeat: no-repeat; background-position: right 10px center;
    }
    .week-select:hover { border-color: rgba(255,255,255,0.2); }
    .week-select:focus { outline: none; border-color: var(--accent); }
    .week-label { font-size: 10px; color: var(--dim); letter-spacing: 0.1em; text-transform: uppercase; margin-right: 6px; }
    .top-toggle-group {
      display: none;
      align-items: center;
      gap: 6px;
      margin-left: 10px;
    }
    .top-toggle-group.visible {
      display: inline-flex;
    }
    .top-toggle-btn {
      appearance: none;
      border: 1px solid rgba(255,255,255,0.1);
      background: rgba(255,255,255,0.04);
      color: var(--muted);
      font: inherit;
      font-size: 10px;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      padding: 6px 14px;
      border-radius: 999px;
      cursor: pointer;
      transition: all 180ms ease;
    }
    .top-toggle-btn:hover { color: var(--ink); background: rgba(255,255,255,0.07); }
    .top-toggle-btn.active {
      color: #09100f;
      background: var(--accent);
      border-color: rgba(213,255,98,0.7);
      font-weight: 700;
    }

    /* ===== PAGES ===== */
    .page { display: none; overflow: hidden; min-height: 0; }
    .page.active { display: block; height: 100%; min-height: 0; overflow: hidden; }
    .page-scroll { height: 100%; overflow-y: auto; }

    /* ===== SQP LAYOUT ===== */
    .sqp-layout {
      display: grid; grid-template-columns: minmax(320px, 380px) 1fr;
      grid-template-rows: 1fr;
      gap: 12px; height: 100%; min-height: 0; padding: 12px 16px;
      width: 100%;
      align-items: stretch;
    }
    .sqp-layout-single {
      grid-template-columns: 1fr;
    }
    .panel {
      background: var(--panel); border: 1px solid rgba(255,255,255,0.07);
      border-radius: var(--radius); box-shadow: var(--shadow); overflow: hidden;
    }
    .panel-head {
      display: flex; justify-content: space-between; align-items: center;
      padding: 12px 16px 10px; border-bottom: 1px solid rgba(255,255,255,0.06);
      background: rgba(255,255,255,0.025); flex-shrink: 0;
    }
    .panel-title { font-family: var(--font-display); font-size: 11px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--muted); font-weight: 600; }
    .panel-badge { font-size: 10px; color: var(--dim); }
    .panel-head-tools { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
    .panel-mini-btn {
      appearance: none;
      border: 1px solid rgba(255,255,255,0.1);
      background: rgba(255,255,255,0.04);
      color: var(--muted);
      font: inherit;
      font-size: 10px;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      padding: 5px 10px;
      border-radius: 999px;
      cursor: pointer;
      transition: background 140ms ease, border-color 140ms ease, color 140ms ease;
    }
    .panel-mini-btn:hover { background: rgba(255,255,255,0.08); border-color: rgba(255,255,255,0.18); }

    /* ===== LEFT: ROOT LIST ===== */
    .root-col {
      display: flex; flex-direction: column;
      min-height: 0; height: 100%;
    }
    .root-col .panel {
      display: flex; flex-direction: column;
      flex: 1; min-height: 0;
    }
    .root-scroll {
      flex: 1; min-height: 0; overflow-y: auto;
      scrollbar-width: thin; scrollbar-color: rgba(255,255,255,0.1) transparent;
    }
    .root-scroll::-webkit-scrollbar { width: 6px; }
    .root-scroll::-webkit-scrollbar-track { background: transparent; }
    .root-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 3px; }
    .root-scroll::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.18); }

    .root-tbl { width: 100%; border-collapse: collapse; font-size: 12px; }
    .root-tbl thead { position: sticky; top: 0; z-index: 2; }
    .root-tbl thead th {
      font-family: var(--font-display); font-size: 10px; color: var(--dim); text-transform: uppercase; letter-spacing: 0.1em;
      text-align: left; padding: 8px 12px; border-bottom: 1px solid rgba(255,255,255,0.1);
      background: var(--panel);
    }
    .root-tbl td {
      padding: 8px 12px; border-bottom: 1px solid rgba(255,255,255,0.04);
      cursor: pointer; transition: background 140ms ease;
    }
    .root-tbl tr.root-row:hover > td { background: rgba(213,255,98,0.05); }
    .root-tbl tr.root-row:focus-visible > td { outline: none; background: rgba(213,255,98,0.08); box-shadow: inset 2px 0 0 var(--accent); }
    .root-tbl tr.root-row.selected > td { background: rgba(213,255,98,0.08); }
    .root-tbl tr.root-row.partial > td { background: rgba(213,255,98,0.05); }
    .root-name { font-weight: 600; display: flex; align-items: center; gap: 6px; font-size: 13px; }
    .root-expand-btn {
      appearance: none;
      border: none;
      background: transparent;
      color: inherit;
      padding: 0;
      margin: 0;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 14px;
      height: 14px;
      cursor: pointer;
      flex-shrink: 0;
    }
    .root-chevron { display: inline-block; width: 12px; color: var(--dim); font-size: 10px; transition: transform 200ms ease; flex-shrink: 0; }
    .root-row.expanded .root-chevron { transform: rotate(90deg); color: var(--accent); }
    .root-check {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
    }
    .root-check input {
      width: 14px;
      height: 14px;
      accent-color: #d5ff62;
      cursor: pointer;
      flex-shrink: 0;
    }
    .root-label-text {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .family-group {
      font-family: var(--font-display); font-size: 10px; color: var(--accent); font-weight: 700; letter-spacing: 0.14em;
      text-transform: uppercase; padding: 14px 12px 5px;
    }
    .root-indicators { display: flex; gap: 4px; margin-top: 3px; }
    .ind { font-size: 10px; padding: 2px 6px; border-radius: 4px; letter-spacing: 0.06em; text-transform: uppercase; font-weight: 600; }
    .ind-sqp { background: rgba(143,199,255,0.08); color: rgba(143,199,255,0.85); }

    /* Inline terms */
    .term-expand-row { display: none; }
    .term-expand-row.visible { display: table-row; animation: fadeSlide 200ms cubic-bezier(0.16, 1, 0.3, 1); }
    @keyframes fadeSlide { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }
    .term-expand-cell { padding: 0 !important; border-bottom: 1px solid rgba(213,255,98,0.06) !important; background: rgba(0,0,0,0.2); }
    .term-inner { padding: 6px 12px 10px 30px; }
    .term-mini-tbl { width: 100%; border-collapse: collapse; font-size: 11px; }
    .term-mini-tbl th { font-family: var(--font-display); font-size: 10px; color: var(--dim); text-transform: uppercase; letter-spacing: 0.08em; text-align: left; padding: 4px 6px; border-bottom: 1px solid rgba(255,255,255,0.06); }
    .term-mini-tbl td { padding: 5px 6px; border-bottom: 1px solid rgba(255,255,255,0.025); cursor: pointer; font-size: 11px; }
    .term-mini-row:hover td { background: rgba(119,223,208,0.04); }
    .term-mini-row.selected td { background: rgba(213,255,98,0.08); }
    .term-mini-row.selected td:first-child { box-shadow: inset 2px 0 0 var(--accent); }

    /* ===== RIGHT: FUNNEL ===== */
    .funnel-col {
      display: flex; flex-direction: column;
      min-height: 0;
      height: 100%;
      overflow: hidden;
    }
    .funnel-col .panel { flex: 1; min-height: 0; display: flex; flex-direction: column; }
    .funnel-empty { flex: 1; }

    .funnel-report { flex: 1; min-height: 0; display: flex; flex-direction: column; }
    .funnel-hero {
      padding: 12px 16px 8px;
      border-bottom: 1px solid rgba(255,255,255,0.06);
      flex-shrink: 0;
    }
    .funnel-hero-name { font-family: var(--font-display); font-size: 18px; font-weight: 700; letter-spacing: -0.03em; }
    .funnel-hero-meta { font-size: 10px; color: var(--dim); margin-top: 2px; }

    .volume-strip {
      display: flex; gap: 18px; align-items: center;
      padding: 6px 16px; background: rgba(0,0,0,0.08);
      border-bottom: 1px solid rgba(255,255,255,0.04);
      flex-shrink: 0;
    }
    .vol-item { display: flex; flex-direction: column; }
    .vol-label { font-family: var(--font-display); font-size: 10px; color: var(--dim); text-transform: uppercase; letter-spacing: 0.1em; }
    .vol-val { font-family: var(--font-display); font-size: 15px; font-weight: 700; letter-spacing: -0.02em; }
    .vol-val-empty { color: var(--dim); font-weight: 600; }

    .funnel-scroll {
      flex: 1; min-height: 0; overflow-y: auto;
      padding: 6px 16px 10px;
      display: flex;
      flex-direction: column;
      scrollbar-width: thin; scrollbar-color: rgba(255,255,255,0.1) transparent;
    }
    .funnel-report-sqp .funnel-scroll,
    .funnel-report-competitor .funnel-scroll {
      flex: 0 0 auto;
      min-height: auto;
      overflow: visible;
      padding-bottom: 4px;
    }
    .funnel-scroll::-webkit-scrollbar { width: 6px; }
    .funnel-scroll::-webkit-scrollbar-track { background: transparent; }
    .funnel-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 3px; }
    .funnel-graph {
      min-height: 400px;
      display: flex;
      flex-direction: column;
      gap: 0;
      flex: 1;
    }
    .funnel-report-sqp .funnel-graph,
    .funnel-report-competitor .funnel-graph {
      min-height: 392px;
      flex: 0 0 392px;
    }
    .funnel-body {
      display: flex; flex-direction: column;
      gap: 0;
      min-height: 0;
      flex: 1;
    }
    .funnel-report-sqp .funnel-body {
      flex: 1;
      gap: 0;
    }
    .funnel-report-competitor .funnel-body {
      flex: 1;
      gap: 0;
      justify-content: space-evenly;
    }
    .funnel-report-competitor .stage,
    .funnel-report-competitor .funnel-connector {
      flex: 0 0 auto;
    }

    .stage {
      display: flex; flex-direction: column;
      gap: 3px;
      animation: stageIn 300ms cubic-bezier(0.16, 1, 0.3, 1) both;
    }
    .stage:nth-child(1) { animation-delay: 0ms; }
    .stage:nth-child(3) { animation-delay: 80ms; }
    .stage:nth-child(5) { animation-delay: 160ms; }
    .stage:nth-child(7) { animation-delay: 240ms; }
    @keyframes stageIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }

    .stage-label {
      font-family: var(--font-display); font-size: 14px; font-weight: 700; letter-spacing: 0.08em;
      text-transform: uppercase; align-self: flex-start;
      display: flex; align-items: center; gap: 8px;
    }
    .stage-label svg { opacity: 0.8; flex-shrink: 0; }
    .stage-meta {
      font-size: 10px;
      color: var(--dim);
      letter-spacing: 0.04em;
      align-self: flex-start;
      margin-top: -2px;
    }
    .stage-impressions .stage-label { color: var(--cool); }
    .stage-clicks .stage-label { color: var(--teal); }
    .stage-cart-adds .stage-label { color: var(--orange, #f5a623); }
    .stage-purchases .stage-label { color: var(--accent); }

    .stage-band {
      display: flex;
      height: 74px;
      min-height: 74px;
      border-radius: 6px;
      overflow: hidden;
      position: relative;
      margin: 0 auto;
      transition: width 400ms cubic-bezier(0.16, 1, 0.3, 1);
      background: rgba(255,255,255,0.025);
      border: 1px solid rgba(255,255,255,0.05);
    }
    .funnel-report-sqp .stage-band {
      height: 54px;
      min-height: 54px;
    }
    .funnel-report-competitor .stage-band {
      height: 54px;
      min-height: 54px;
    }
    .stage-band:hover { transform: translateY(-1px); box-shadow: 0 12px 28px rgba(0,0,0,0.18); }
    .stage-band-single {
      width: 100% !important;
      margin: 0;
    }

    .seg {
      display: flex; align-items: center; justify-content: center;
      padding: 0 8px;
      overflow: hidden;
      position: relative;
      transition: flex 400ms cubic-bezier(0.16, 1, 0.3, 1);
    }
    .seg-other { background: rgba(143,199,255,0.15); }
    .seg-asin { background: rgba(213,255,98,0.18); border-left: 2px solid rgba(213,255,98,0.35); border-right: 2px solid rgba(213,255,98,0.35); }
    .seg-single {
      flex: 1 1 auto;
      background: rgba(213,255,98,0.18);
      border-left: 2px solid rgba(213,255,98,0.35);
      border-right: 2px solid rgba(213,255,98,0.35);
    }
    .seg-asin-win {
      background: rgba(213,255,98,0.28);
      border-left-color: rgba(213,255,98,0.75);
      border-right-color: rgba(213,255,98,0.75);
      box-shadow: inset 0 0 0 1px rgba(213,255,98,0.22);
    }
    .seg-overlay {
      position: absolute;
      left: 0;
      top: 0;
      bottom: 0;
      background:
        linear-gradient(90deg, rgba(115, 171, 255, 0.42), rgba(115, 171, 255, 0.2)),
        repeating-linear-gradient(135deg, rgba(115, 171, 255, 0.34), rgba(115, 171, 255, 0.34) 8px, rgba(115, 171, 255, 0.14) 8px, rgba(115, 171, 255, 0.14) 16px);
      border-right: 1px solid rgba(115, 171, 255, 0.9);
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      transition: width 260ms ease;
    }
    .seg-overlay-threat {
      background:
        linear-gradient(90deg, rgba(214, 80, 68, 0.44), rgba(214, 80, 68, 0.22)),
        repeating-linear-gradient(135deg, rgba(214, 80, 68, 0.32), rgba(214, 80, 68, 0.32) 8px, rgba(214, 80, 68, 0.14) 8px, rgba(214, 80, 68, 0.14) 16px);
      border-right-color: rgba(214, 80, 68, 0.92);
    }
    .seg-overlay-inner {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 2px;
      white-space: nowrap;
      padding: 0 8px;
    }
    .seg-overlay-label {
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: rgba(10, 18, 30, 0.92);
    }
    .seg-overlay-value {
      font-size: 20px;
      font-weight: 800;
      letter-spacing: -0.02em;
      color: rgba(10, 18, 30, 0.94);
    }
    .seg-overlay-detail {
      font-size: 12px;
      line-height: 1.1;
      color: rgba(10, 18, 30, 0.88);
    }

    .seg-inner {
      display: flex; flex-direction: column; align-items: center;
      gap: 2px; white-space: nowrap;
      overflow: hidden; max-width: 100%;
      position: relative; z-index: 1;
    }
    .seg-name {
      font-family: var(--font-display); font-size: 10px; font-weight: 700; letter-spacing: 0.08em;
      text-transform: uppercase; color: var(--ink);
      overflow: hidden; text-overflow: ellipsis;
    }
    .seg-val {
      font-family: var(--font-display); font-weight: 700; letter-spacing: -0.03em; line-height: 1.1;
      color: var(--ink); font-size: 26px;
    }
    .funnel-report-sqp .seg-name {
      font-size: 10px;
    }
    .funnel-report-sqp .seg-val {
      font-size: 20px;
    }
    .funnel-report-sqp .seg-detail {
      font-size: 11px;
    }
    .funnel-report-competitor .seg-name {
      font-size: 10px;
    }
    .funnel-report-competitor .seg-val {
      font-size: 20px;
    }
    .funnel-report-competitor .seg-detail {
      font-size: 11px;
    }
    .seg-val-asin { }
    .seg-detail {
      font-size: 14px; color: rgba(241,235,222,0.85); line-height: 1.2;
      display: flex; align-items: baseline; gap: 3px;
    }

    .rate-delta { font-size: 13px; }

    .funnel-connector {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 36px;
    }
    .funnel-report-sqp .funnel-connector {
      flex: 1;
      min-height: 18px;
    }
    .funnel-report-sqp .fc-data {
      gap: 8px;
      padding: 2px 10px;
    }
    .funnel-report-sqp .fc-label {
      font-size: 11px;
    }
    .funnel-report-sqp .fc-tag {
      font-size: 10px;
    }
    .funnel-report-sqp .fc-val {
      font-size: 14px;
    }
    .funnel-report-sqp .fc-indicator {
      font-size: 10px;
    }
    .funnel-report-competitor .funnel-connector {
      min-height: 18px;
    }
    .funnel-report-competitor .fc-data {
      gap: 8px;
      padding: 2px 10px;
    }
    .funnel-report-competitor .fc-label {
      font-size: 11px;
    }
    .funnel-report-competitor .fc-tag {
      font-size: 10px;
    }
    .funnel-report-competitor .fc-val {
      font-size: 14px;
    }
    .funnel-report-competitor .fc-indicator {
      font-size: 10px;
    }
    .fc-flow {
      flex: 1;
      width: 2px;
      min-height: 4px;
      background: rgba(255,255,255,0.10);
      border-radius: 1px;
    }
    .fc-flow-end { position: relative; }
    .fc-flow-end::after {
      content: '';
      position: absolute;
      bottom: 0; left: 50%; transform: translateX(-50%);
      border-left: 6px solid transparent;
      border-right: 6px solid transparent;
      border-top: 7px solid rgba(255,255,255,0.16);
    }
    .fc-data {
      display: flex;
      align-items: baseline;
      justify-content: center;
      gap: 12px;
      padding: 4px 12px;
    }
    .fc-label { font-family: var(--font-display); font-size: 12px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.08em; font-weight: 600; }
    .fc-pair { display: inline-flex; align-items: baseline; gap: 4px; }
    .fc-pair-threat .fc-tag,
    .fc-pair-threat .fc-val {
      color: var(--coral);
    }
    .fc-pair-safe .fc-tag,
    .fc-pair-safe .fc-val {
      color: var(--accent);
    }
    .fc-tag { font-size: 10px; color: var(--dim); text-transform: uppercase; letter-spacing: 0.04em; }
    .fc-val { font-family: var(--font-display); font-size: 16px; font-weight: 700; letter-spacing: -0.02em; color: var(--ink); }
    .fc-sep { color: var(--dim); font-size: 12px; }
    .fc-indicator { font-size: 12px; font-weight: 700; line-height: 1; margin-left: 2px; }
    .fc-win { color: var(--accent); }
    .fc-lose { color: var(--coral); }
    .fc-safe { color: var(--accent); }
    .fc-threat { color: var(--coral); }

    /* ===== CHART ENTRANCE ANIMATIONS ===== */

    /* Line draw — paths animate in from left */
    .chart-area svg path[stroke], .chart-area svg polyline[stroke] {
      stroke-dasharray: 3000;
      stroke-dashoffset: 3000;
      animation: drawLine 1000ms cubic-bezier(0.16, 1, 0.3, 1) forwards;
    }
    @keyframes drawLine { to { stroke-dashoffset: 0; } }

    /* Sparkline draw (funnel stage labels) */
    .stage-label svg polyline {
      stroke-dasharray: 500;
      stroke-dashoffset: 500;
      animation: drawLine 600ms cubic-bezier(0.16, 1, 0.3, 1) forwards;
      animation-delay: 200ms;
    }

    /* Scatter / line chart dots — pop in */
    .chart-area svg circle[r] {
      animation: dotPop 350ms cubic-bezier(0.16, 1, 0.3, 1) both;
      animation-delay: 400ms;
    }
    @keyframes dotPop {
      from { opacity: 0; transform: scale(0); transform-origin: center; }
      to { opacity: 1; transform: scale(1); transform-origin: center; }
    }

    /* Bar chart rects — grow upward */
    .chart-ppc svg rect[height] {
      animation: growBar 500ms cubic-bezier(0.16, 1, 0.3, 1) both;
      animation-delay: 100ms;
      transform-origin: center bottom; transform-box: fill-box;
    }
    @keyframes growBar {
      from { transform: scaleY(0); opacity: 0.3; }
      to { transform: scaleY(1); opacity: 1; }
    }

    /* Heatmap cells — fade in */
    .chart-heatmap svg rect {
      animation: cellFade 400ms cubic-bezier(0.16, 1, 0.3, 1) both;
      animation-delay: 200ms;
    }
    @keyframes cellFade {
      from { opacity: 0; }
      to { opacity: 1; }
    }

    /* ===== CHART HOVER INTERACTIONS ===== */

    /* SVG scatter circles — scale + glow on hover */
    .chart-scatter svg g { cursor: pointer; }
    .chart-scatter svg g circle {
      transition: transform 150ms cubic-bezier(0.25, 1, 0.5, 1), filter 150ms ease, opacity 150ms ease;
      transform-origin: center; transform-box: fill-box;
    }
    .chart-scatter svg g:hover circle {
      transform: scale(1.35);
      filter: drop-shadow(0 0 6px rgba(213,255,98,0.4));
    }

    /* SVG line chart dots — pop on hover */
    .chart-rank svg circle, .chart-brand svg circle {
      transition: transform 150ms cubic-bezier(0.25, 1, 0.5, 1), filter 150ms ease;
      transform-origin: center; transform-box: fill-box;
    }
    .chart-rank svg circle:hover, .chart-brand svg circle:hover {
      transform: scale(1.6);
      filter: drop-shadow(0 0 4px rgba(255,255,255,0.3));
    }

    /* SVG heatmap cells — brighten on hover */
    .chart-heatmap svg rect {
      transition: filter 150ms ease, opacity 150ms ease;
      cursor: pointer;
    }
    .chart-heatmap svg rect:hover {
      filter: brightness(1.3);
    }

    /* SVG bar chart bars — brighten + lift shadow */
    .chart-ppc svg rect {
      transition: filter 150ms ease, opacity 150ms ease;
      cursor: pointer;
    }
    .chart-ppc svg rect:hover {
      filter: brightness(1.25) drop-shadow(0 2px 6px rgba(0,0,0,0.3));
    }

    /* Source heatmap cells */
    .source-heatmap-cell {
      transition: transform 120ms cubic-bezier(0.25, 1, 0.5, 1), filter 120ms ease;
    }
    .source-heatmap-cell:hover {
      transform: scale(1.08);
      filter: brightness(1.2);
      z-index: 2;
    }

    /* Funnel segment — dim sibling on hover */
    .seg {
      transition: flex 400ms cubic-bezier(0.16, 1, 0.3, 1), filter 180ms ease, opacity 180ms ease;
    }
    .stage-band:hover .seg { opacity: 0.7; filter: brightness(0.85); }
    .stage-band:hover .seg:hover { opacity: 1; filter: brightness(1.1); }

    /* Connector data row — subtle highlight on hover */
    .fc-data {
      transition: background 150ms ease;
      border-radius: 6px;
    }
    .fc-data:hover {
      background: rgba(255,255,255,0.04);
    }

    /* Tab button — smooth underline indicator */
    .tab-btn { position: relative; }
    .tab-btn::after {
      content: '';
      position: absolute;
      bottom: 2px; left: 50%; right: 50%;
      height: 2px;
      background: var(--accent);
      border-radius: 1px;
      transition: left 200ms cubic-bezier(0.25, 1, 0.5, 1), right 200ms cubic-bezier(0.25, 1, 0.5, 1);
    }
    .tab-btn.active::after { left: 16px; right: 16px; }

    /* Root row — smooth left accent on select */
    .root-tbl tr.root-row > td:first-child {
      transition: box-shadow 180ms ease;
    }
    .root-tbl tr.root-row.selected > td:first-child {
      box-shadow: inset 3px 0 0 var(--accent);
    }

    /* Compare table row — subtle slide-in highlight */
    .compare-table tbody tr {
      transition: background 140ms ease;
    }

    /* Reduced motion */
    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }
    }

    .coverage-bar {
      padding: 8px 20px;
      background: rgba(0,0,0,0.1);
      border-top: 1px solid rgba(255,255,255,0.04);
      display: flex; gap: 16px; font-size: 10px; color: var(--dim);
      flex-shrink: 0;
      margin-top: 10px;
    }
    .coverage-bar strong { color: var(--muted); }

    .compare-block {
      margin-top: 8px;
      border-top: 1px solid rgba(255,255,255,0.06);
      padding-top: 10px;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .funnel-report-sqp .compare-block,
    .funnel-report-competitor .compare-block {
      flex: 1 1 0;
      min-height: 0;
    }
    .compare-head {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 6px;
      flex-wrap: wrap;
      text-align: center;
    }
    .compare-title {
      font-size: 10px;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--muted);
      font-weight: 700;
    }
    .compare-sub {
      font-size: 10px;
      color: var(--dim);
    }
    .compare-note {
      font-size: 10px;
      color: var(--dim);
    }
    .compare-cards {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 6px;
    }
    .compare-card {
      background: rgba(255,255,255,0.03);
      border: 1px solid rgba(255,255,255,0.05);
      border-radius: 10px;
      padding: 7px 8px;
      transition: transform 180ms ease, border-color 180ms ease, background 180ms ease;
      text-align: center;
    }
    .compare-card:hover {
      transform: translateY(-1px);
      border-color: rgba(255,255,255,0.12);
      background: rgba(255,255,255,0.05);
    }
    .compare-card-label {
      font-family: var(--font-display); font-size: 10px;
      color: var(--dim);
      text-transform: uppercase;
      letter-spacing: 0.1em;
    }
    .compare-card-value {
      font-family: var(--font-display);
      margin-top: 2px;
      font-size: 16px;
      font-weight: 700;
      letter-spacing: -0.03em;
      color: var(--ink);
      line-height: 1.05;
    }
    .compare-card-sub {
      margin-top: 1px;
      font-size: 10px;
      color: var(--muted);
      line-height: 1.15;
    }
    .compare-table-wrap {
      border: 1px solid rgba(255,255,255,0.06);
      border-radius: 14px;
      overflow: auto;
      background: rgba(0,0,0,0.12);
      max-height: 320px;
      scrollbar-width: thin;
      scrollbar-color: rgba(255,255,255,0.1) transparent;
    }
    .funnel-report-sqp .compare-table-wrap,
    .funnel-report-competitor .compare-table-wrap {
      flex: 1;
      min-height: 0;
      max-height: none;
    }
    .compare-table-wrap::-webkit-scrollbar { width: 6px; }
    .compare-table-wrap::-webkit-scrollbar-track { background: transparent; }
    .compare-table-wrap::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 3px; }
    .compare-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 11px;
    }
    .compare-table thead { position: sticky; top: 0; z-index: 1; }
    .compare-table thead th {
      font-family: var(--font-display);
      padding: 9px 10px;
      font-size: 10px;
      color: var(--dim);
      text-transform: uppercase;
      letter-spacing: 0.1em;
      text-align: left;
      background: rgba(255,255,255,0.03);
      border-bottom: 1px solid rgba(255,255,255,0.06);
    }
    .compare-table thead th.sortable {
      cursor: pointer;
      user-select: none;
      transition: color 140ms ease, background 140ms ease;
    }
    .compare-table thead th.sortable:hover {
      color: var(--ink);
      background: rgba(255,255,255,0.05);
    }
    .sort-indicator {
      margin-left: 4px;
      font-size: 10px;
      color: var(--accent);
    }
    .compare-table tbody td {
      padding: 9px 10px;
      border-bottom: 1px solid rgba(255,255,255,0.04);
    }
    .compare-table tbody tr:nth-child(even):not(.group-root-row):not(.group-family-row):not(.group-term-row) td { background: rgba(255,255,255,0.015); }
    .compare-table tbody tr:hover td { background: rgba(255,255,255,0.04); }
    .compare-table tbody tr.selected td { background: rgba(213,255,98,0.07); }
    .compare-table thead th:not(:first-child),
    .compare-table tbody td:not(:first-child) {
      text-align: center;
    }
    .group-root-row td {
      background: rgba(255,255,255,0.04);
      border-top: 1px solid rgba(255,255,255,0.08);
      border-bottom: 1px solid rgba(255,255,255,0.07);
      font-weight: 600;
    }
    .group-root-row.selected td {
      background: rgba(213,255,98,0.09);
    }
    .group-root-row.partial td {
      background: rgba(213,255,98,0.06);
    }
    .group-family-row td {
      background: rgba(0,0,0,0.16);
      color: var(--accent);
      font-family: var(--font-display);
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      padding: 8px 10px;
      border-top: 1px solid rgba(255,255,255,0.05);
      border-bottom: 1px solid rgba(255,255,255,0.04);
      text-align: left !important;
    }
    .group-root-cell {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
    }
    .group-term-cell {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
      padding-left: 24px;
    }
    .group-toggle-btn {
      appearance: none;
      border: none;
      background: transparent;
      color: var(--dim);
      width: 16px;
      height: 16px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      flex-shrink: 0;
      padding: 0;
    }
    .group-toggle-btn:hover {
      color: var(--ink);
    }
    .group-chevron {
      display: inline-block;
      font-size: 10px;
      transition: transform 180ms ease;
    }
    .group-toggle-btn.expanded .group-chevron {
      transform: rotate(90deg);
      color: var(--accent);
    }
    .group-name-stack {
      display: flex;
      flex-direction: column;
      gap: 2px;
      min-width: 0;
    }
    .group-name-main {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .group-name-meta {
      font-size: 10px;
      color: var(--dim);
      font-weight: 500;
    }
    .group-term-row td:first-child {
      font-weight: 500;
    }
    .table-head-tools {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
      justify-content: center;
    }
    .compare-table-select .check-col {
      width: 34px;
      text-align: center !important;
    }
    .compare-table-select thead th:nth-child(2),
    .compare-table-select tbody td:nth-child(2) {
      text-align: left !important;
    }
    .compare-table-select input[type="checkbox"] {
      width: 14px;
      height: 14px;
      accent-color: #d5ff62;
      cursor: pointer;
    }
    .rec-pill {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 22px;
      padding: 4px 8px;
      border-radius: 999px;
      border: 1px solid rgba(255,255,255,0.08);
      background: rgba(255,255,255,0.04);
      font-size: 10px;
      font-weight: 600;
      line-height: 1.1;
      white-space: nowrap;
    }
    .rec-threat {
      color: #ff9d8f;
      border-color: rgba(255,122,92,0.24);
      background: rgba(255,122,92,0.12);
    }
    .rec-warning {
      color: #f3bc55;
      border-color: rgba(243,188,85,0.24);
      background: rgba(243,188,85,0.12);
    }
    .rec-opportunity {
      color: #8fc7ff;
      border-color: rgba(143,199,255,0.24);
      background: rgba(143,199,255,0.12);
    }
    .rec-safe {
      color: #d5ff62;
      border-color: rgba(213,255,98,0.24);
      background: rgba(213,255,98,0.12);
    }
    .rec-neutral {
      color: var(--muted);
      border-color: rgba(255,255,255,0.08);
      background: rgba(255,255,255,0.04);
    }
    .rec-watch {
      color: var(--dim);
      border-color: rgba(255,255,255,0.06);
      background: rgba(255,255,255,0.02);
    }
    .compare-empty {
      padding: 18px 14px;
      font-size: 11px;
      color: var(--dim);
    }
    .funnel-empty-state {
      min-height: 140px;
      display: flex;
      align-items: center;
      justify-content: center;
      text-align: center;
      color: var(--dim);
      font-size: 12px;
      letter-spacing: 0.04em;
      border-top: 1px solid rgba(255,255,255,0.04);
      border-bottom: 1px solid rgba(255,255,255,0.04);
      margin-top: 4px;
    }
    .funnel-empty-state-graph {
      flex: 1;
      min-height: 0;
      margin-top: 0;
    }
    .stage-topline {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 8px;
      min-height: 18px;
      margin-bottom: 4px;
    }
    .stage-topline-left,
    .stage-topline-right {
      display: flex;
      align-items: flex-start;
      min-width: 0;
      flex: 1 1 0;
    }
    .stage-topline-left {
      justify-content: flex-start;
    }
    .stage-topline-right {
      justify-content: flex-end;
    }
    .stage-outside-pill {
      display: inline-flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 1px;
      padding: 4px 8px;
      border-radius: 8px;
      background: rgba(213,255,98,0.08);
      border: 1px solid rgba(213,255,98,0.18);
      color: var(--ink);
      text-align: right;
    }
    .stage-outside-pill .seg-name {
      font-size: 10px;
    }
    .stage-outside-pill .seg-val {
      font-size: 18px;
    }
    .stage-outside-pill .seg-detail {
      font-size: 10px;
    }
    .stage-outside-pill-win {
      background: rgba(213,255,98,0.14);
      border-color: rgba(213,255,98,0.34);
    }
    .stage-outside-pill-overlay {
      align-items: flex-start;
      text-align: left;
      background: rgba(115, 171, 255, 0.12);
      border-color: rgba(115, 171, 255, 0.26);
    }
    .stage-outside-pill-threat {
      background: rgba(214, 80, 68, 0.14);
      border-color: rgba(214, 80, 68, 0.34);
    }
    .seg-inner-hidden {
      visibility: hidden;
    }
    .metric-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 8px;
    }
    .metric {
      background: rgba(255,255,255,0.03);
      border: 1px solid rgba(255,255,255,0.05);
      border-radius: 12px;
      padding: 10px 12px;
      text-align: center;
    }
    .metric-label {
      font-family: var(--font-display); font-size: 10px;
      color: var(--dim);
      text-transform: uppercase;
      letter-spacing: 0.1em;
    }
    .metric-value {
      font-family: var(--font-display);
      margin-top: 3px;
      font-size: 18px;
      font-weight: 700;
      letter-spacing: -0.03em;
      color: var(--ink);
      line-height: 1.05;
    }
    .metric-sub {
      margin-top: 2px;
      font-size: 10px;
      color: var(--muted);
      line-height: 1.15;
    }
    .competitor-wow-wrap {
      padding: 10px 16px 2px;
      border-bottom: 1px solid rgba(255,255,255,0.04);
      flex-shrink: 0;
    }
    .competitor-wow-head {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 8px;
      margin-bottom: 6px;
    }
    .competitor-wow-title {
      font-size: 10px;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: var(--muted);
      font-weight: 700;
    }
    .competitor-wow-legend {
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 10px;
      color: var(--dim);
      flex-wrap: wrap;
    }
    .competitor-wow-key {
      display: inline-flex;
      align-items: center;
      gap: 5px;
    }
    .competitor-wow-swatch {
      width: 10px;
      height: 2px;
      border-radius: 999px;
      background: currentColor;
    }
    .competitor-wow-swatch-dash {
      background:
        repeating-linear-gradient(90deg, currentColor, currentColor 5px, transparent 5px, transparent 8px);
    }
    .chart-competitor-wow {
      min-height: 0;
      height: 100%;
      flex: 1;
      border-radius: 14px;
      background: rgba(255,255,255,0.02);
      border: 1px solid rgba(255,255,255,0.05);
      padding: 6px 10px 4px;
    }
    .weekly-slot {
      display: flex;
      flex-direction: column;
      gap: 10px;
      height: 100%;
      min-height: 0;
    }
    .weekly-slot-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      flex-wrap: wrap;
      padding: 0 2px;
    }
    .weekly-slot-title {
      font-size: 10px;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      color: var(--muted);
      font-weight: 700;
    }
    .weekly-slot-legend {
      display: inline-flex;
      align-items: center;
      gap: 14px;
      flex-wrap: wrap;
      font-size: 10px;
      color: var(--dim);
      letter-spacing: 0.04em;
    }
    .weekly-slot-key {
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .weekly-slot-swatch {
      width: 14px;
      height: 0;
      border-top: 2px solid currentColor;
      border-radius: 999px;
    }
    .weekly-slot-swatch-dash {
      border-top-style: dashed;
    }
    .weekly-slot-swatch-dot {
      border-top-style: dotted;
    }
    .weekly-slot-toggle {
      display: inline-flex; align-items: center; gap: 6px;
      background: none; border: 1px solid transparent; border-radius: 999px;
      padding: 3px 10px 3px 8px; font: inherit; font-size: 10px;
      color: var(--toggle-color); cursor: pointer;
      transition: opacity 150ms ease, border-color 150ms ease, background 150ms ease;
      letter-spacing: 0.04em;
    }
    .weekly-slot-toggle:hover { background: rgba(255,255,255,0.05); }
    .weekly-slot-toggle.active { border-color: var(--toggle-color); opacity: 1; }
    .weekly-slot-toggle:not(.active) { opacity: 0.3; border-color: rgba(255,255,255,0.08); }
    .competitor-empty {
      padding: 26px 18px;
      color: var(--dim);
      font-size: 11px;
      text-align: center;
      display: flex;
      flex-direction: column;
      gap: 8px;
      align-items: center;
      justify-content: center;
    }
    .panel-body-change-log {
      padding: 16px 18px 22px;
    }
    .change-log-table-wrap {
      border: 1px solid rgba(255,255,255,0.06);
      border-radius: 14px;
      overflow: auto;
      background: rgba(255,255,255,0.02);
    }
    .change-log-table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
      font-size: 11px;
    }
    .change-log-table th,
    .change-log-table td {
      padding: 9px 10px;
      border-bottom: 1px solid rgba(255,255,255,0.05);
      vertical-align: top;
    }
    .change-log-table th {
      position: sticky;
      top: 0;
      z-index: 1;
      background: rgba(20, 29, 27, 0.98);
      font-family: var(--font-display);
      font-size: 10px;
      color: var(--dim);
      text-transform: uppercase;
      letter-spacing: 0.1em;
      text-align: left;
    }
    .change-log-table tbody tr:hover td {
      background: rgba(255,255,255,0.03);
    }
    .change-log-week {
      color: var(--accent);
      font-weight: 700;
      white-space: nowrap;
    }
    .change-log-date {
      color: var(--muted);
      white-space: nowrap;
    }
    .change-log-cell-compact {
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .change-log-title {
      font-weight: 700;
      color: var(--ink);
    }
    .change-log-summary {
      color: rgba(241,235,222,0.86);
    }
    .change-tag {
      display: inline-flex;
      align-items: center;
      padding: 4px 8px;
      border-radius: 999px;
      background: rgba(255,255,255,0.05);
      border: 1px solid rgba(255,255,255,0.07);
      font-size: 10px;
      color: var(--muted);
      letter-spacing: 0.04em;
    }
    .change-tag-source { color: var(--cool); border-color: rgba(143, 199, 255, 0.18); }
    .change-tag-manual { color: var(--accent); border-color: rgba(213,255,98,0.18); }
    .change-tag-listing { color: var(--teal); border-color: rgba(119,223,208,0.18); }

    @media (max-width: 1080px) {
      .sqp-layout { grid-template-columns: 1fr; }
      .root-col { height: 38dvh; }
      .funnel-graph { min-height: 300px; }
      .compare-cards { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .metric-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    }

    @media (max-width: 720px) {
      body { height: auto; min-height: 100dvh; }
      .page.active { overflow: auto; }
      .sqp-layout { height: auto; }
      .root-col { height: auto; max-height: 42dvh; }
      .funnel-col { height: auto; }
      .funnel-graph { min-height: 260px; }
      .compare-cards { grid-template-columns: 1fr; }
      .metric-grid { grid-template-columns: 1fr; }
      .compare-support-grid { grid-template-columns: 1fr; }
    }


    .up { color: var(--accent); }
    .down { color: var(--coral); }
    .flat { color: var(--muted); }

    /* ===== COMPARE TAB ===== */
    .compare-layout { display: grid; gap: 14px; align-items: stretch; }
    .compare-layout > div { min-width: 0; }
    .compare-layout > div > .panel { display: flex; flex-direction: column; height: 100%; }
    .compare-support-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; align-items: stretch; }
    .compare-support-grid > div { min-width: 0; }
    .compare-support-grid > div > .panel { display: flex; flex-direction: column; height: 100%; }
    .compare-organic-shell { display: flex; flex-direction: column; min-height: 0; }
    .compare-organic-view { display: none; min-height: 0; }
    .compare-organic-view.active { display: flex; flex-direction: column; gap: 8px; flex: 1; }
    .panel-mini-btn.active {
      background: var(--accent);
      border-color: rgba(213,255,98,0.72);
      color: #09100f;
      font-weight: 700;
    }
    .panel-body { padding: 12px 14px; }
    .panel-body-compare { flex: 1; min-height: 0; }
    .panel-body-rank { display: grid; grid-template-rows: minmax(220px, 1fr) auto; gap: 8px; }
    .chart-area { position: relative; overflow: hidden; }
    .chart-area svg { display: block; width: 100%; }
    .chart-scatter { min-height: 280px; flex: 1; }
    .chart-rank { min-height: 220px; }
    .chart-heatmap { min-height: 120px; margin-top: 0; }
    .chart-ppc { min-height: 280px; flex: 1; }
    .chart-brand { min-height: 220px; flex: 1; }

    /* ===== SOURCES TAB ===== */
    .source-grid { display: grid; gap: 4px; }
    .source-row { display: grid; gap: 3px; align-items: center; }
    .source-name { font-size: 11px; padding: 4px 8px; }
    .source-cell { height: 24px; border-radius: 6px; }
    .source-present { background: rgba(119,223,208,0.6); }
    .source-missing { background: rgba(255,255,255,0.04); opacity: 0.3; }
    .source-critical { background: rgba(214,80,68,0.6); }
    .source-header { font-family: var(--font-display); font-size: 10px; color: var(--muted); text-align: center; letter-spacing: 0.08em; }
    .source-header-window { color: var(--ink); }
    .source-header-anchor { color: var(--accent); font-weight: 700; }
    .source-group-label { font-family: var(--font-display); font-size: 10px; color: var(--accent); font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; padding: 12px 8px 4px; grid-column: 1 / -1; }
    .source-window { box-shadow: inset 0 0 0 1px rgba(255,255,255,0.16); }
    .source-anchor { box-shadow: inset 0 0 0 2px rgba(213,255,98,0.9); }

    /* ===== TOOLTIP ===== */
    .tooltip {
      position: fixed; z-index: 9999;
      pointer-events: none; opacity: 0;
      transition: opacity 120ms ease;
      max-width: 380px; padding: 10px 14px;
      background: rgba(9,16,15,0.94); border: 1px solid rgba(255,255,255,0.1);
      border-radius: 12px; box-shadow: 0 12px 40px rgba(0,0,0,0.5);
      font-size: 11px; line-height: 1.5; color: var(--ink);
      left: -9999px; top: -9999px;
    }
    .tooltip.visible { opacity: 1; }
  </style>
</head>
<body>

<!-- ===== TOP BAR ===== -->
<nav class="top-bar" aria-label="Main navigation">
  <span class="brand">WPR</span>
  <button class="tab-btn active" data-tab="sqp" aria-label="SQP report">SQP</button>
  <button class="tab-btn" data-tab="scp" aria-label="SCP report">SCP</button>
  <button class="tab-btn" data-tab="br" aria-label="Business reports">BR</button>
  <button class="tab-btn" data-tab="competitor" aria-label="TST analysis">TST</button>
  <button class="tab-btn" data-tab="changelog">Change Log</button>
  <button class="tab-btn" data-tab="compare" aria-label="Compare roots">Compare</button>
  <button class="tab-btn" data-tab="sources" aria-label="Data sources">Sources</button>
  <div class="spacer"></div>
  <span class="week-label">SQP Report</span>
  <select class="week-select" id="week-selector" aria-label="Select report week"></select>
  <div class="top-toggle-group" id="week-over-week-toggle-wrap" aria-label="Week over week view mode">
    <button class="top-toggle-btn" id="week-over-week-toggle" type="button" aria-label="Toggle week over week view">Week over week</button>
  </div>
</nav>

<main>
<!-- ===== TAB 1: SQP ===== -->
<div class="page active" id="page-sqp">
  <div class="sqp-layout sqp-layout-single">
    <div class="funnel-col" id="funnel-panel"></div>
  </div>
</div>

<!-- ===== TAB 2: SCP ===== -->
<div class="page" id="page-scp">
  <div class="sqp-layout sqp-layout-single">
    <div class="funnel-col" id="scp-panel"></div>
  </div>
</div>

<!-- ===== TAB 3: BUSINESS REPORTS ===== -->
<div class="page" id="page-br">
  <div class="sqp-layout sqp-layout-single">
    <div class="funnel-col" id="br-panel"></div>
  </div>
</div>

<!-- ===== TAB 4: COMPETITOR ===== -->
<div class="page" id="page-competitor">
  <div class="sqp-layout sqp-layout-single">
    <div class="funnel-col" id="competitor-panel"></div>
  </div>
</div>

<!-- ===== TAB 5: CHANGE LOG ===== -->
<div class="page" id="page-changelog">
  <div class="page-scroll" style="padding:12px 16px;max-width:1520px;margin:0 auto;">
    <div id="change-log-panel"></div>
  </div>
</div>

<!-- ===== TAB 6: COMPARE ===== -->
<div class="page" id="page-compare">
  <div class="page-scroll" style="padding:12px 16px;max-width:1520px;margin:0 auto;">
    <div class="compare-layout">
      <div>
        <div class="panel">
          <div class="panel-head">
            <span class="panel-title">Organic Opportunity</span>
            <div class="panel-head-tools">
              <span class="panel-badge" id="compare-organic-badge">Demand vs Rank</span>
              <button class="panel-mini-btn active" type="button" data-compare-organic-mode="map">Map</button>
              <button class="panel-mini-btn" type="button" data-compare-organic-mode="trend">Trend</button>
            </div>
          </div>
          <div class="panel-body panel-body-compare">
            <div class="compare-organic-shell">
              <div class="compare-organic-view active" data-compare-organic-view="map">
                <div class="chart-area chart-scatter" id="scatter-chart"></div>
              </div>
              <div class="compare-organic-view" data-compare-organic-view="trend">
                <div class="panel-body-rank">
                  <div class="chart-area chart-rank" id="rank-trend-chart"></div>
                  <div class="chart-area chart-heatmap" id="rank-heatmap-chart"></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div>
        <div class="compare-support-grid">
          <div>
            <div class="panel">
              <div class="panel-head"><span class="panel-title">Brand Metrics</span><span class="panel-badge">Awareness / Consideration / Purchase Intent</span></div>
              <div class="panel-body panel-body-compare"><div class="chart-area chart-brand" id="brand-metrics-chart"></div></div>
            </div>
          </div>
          <div>
            <div class="panel">
              <div class="panel-head"><span class="panel-title">Paid Support</span><span class="panel-badge">Sponsored Products by root</span></div>
              <div class="panel-body panel-body-compare"><div class="chart-area chart-ppc" id="ppc-chart"></div></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>

<!-- ===== TAB 7: SOURCES ===== -->
<div class="page" id="page-sources">
  <div class="page-scroll" style="padding:12px 16px;max-width:1520px;margin:0 auto;">
    <div class="panel">
      <div class="panel-head"><span class="panel-title">Data Source Availability</span><span class="panel-badge" id="source-week-range"></span></div>
      <div class="panel-body" id="source-heatmap"></div>
    </div>
  </div>
</div>

</main>
<div class="tooltip" id="tooltip"></div>

<script>
  var reportData = __DATA__;

  var selectedWeekLabel = reportData.defaultWeek;
  var activeData = reportData.windowsByWeek[reportData.defaultWeek];
  var clusterMap = new Map(activeData.clusters.map(function(c) { return [c.id, c]; }));
  var termMap = new Map(activeData.sqpTerms.map(function(t) { return [t.id, t]; }));
  var scpAsinMap = new Map(activeData.scp.asins.map(function(row) { return [row.id, row]; }));
  var brAsinMap = new Map(activeData.businessReports.asins.map(function(row) { return [row.id, row]; }));
  var selectedScpAsinIds = new Set();
  var selectedBrAsinIds = new Set();
  var selectedSqpRootIds = new Set();
  var selectedTermIds = new Set();
  var expandedRootIds = new Set();
  var hasInitializedScpSelection = false;
  var hasInitializedBrSelection = false;
  var hasInitializedSqpSelection = false;
  var selectedCompetitorRootIds = new Set();
  var selectedCompetitorTermIds = new Set();
  var expandedCompetitorRootIds = new Set();
  var hasInitializedCompetitorSelection = false;
  var sqpTableSort = { key: "query_volume", dir: "desc" };
  var scpTableSort = { key: "purchases", dir: "desc" };
  var brTableSort = { key: "sessions", dir: "desc" };
  var competitorTableSort = { key: "competitor_purchase_share", dir: "desc" };
  var activeTab = "sqp";
  var sqpViewMode = "weekly";
  var scpViewMode = "weekly";
  var brViewMode = "weekly";
  var competitorViewMode = "weekly";
  var compareOrganicMode = "map";
  var sqpWowVisible = { impr: true, ctr: true, atc: true, cvr: true };
  var scpWowVisible = { ctr: true, atc: true, purch: true, cvr: true };
  var brWowVisible = { sessions: true, order_items: true, unit_session: true };
  var compWowVisible = { click: true, purch: true };

  function setActiveWeek(weekLabel) {
    selectedWeekLabel = weekLabel;
    activeData = reportData.windowsByWeek[weekLabel];
    clusterMap = new Map(activeData.clusters.map(function(c) { return [c.id, c]; }));
    termMap = new Map(activeData.sqpTerms.map(function(t) { return [t.id, t]; }));
    scpAsinMap = new Map(activeData.scp.asins.map(function(row) { return [row.id, row]; }));
    brAsinMap = new Map(activeData.businessReports.asins.map(function(row) { return [row.id, row]; }));
  }

  /* ===== UTILITY FUNCTIONS ===== */

  function fmtNumber(value) {
    if (value == null || Number.isNaN(value)) return "\u2013";
    if (Math.abs(value) >= 10000) return (value / 1000).toFixed(1) + "K";
    return Math.round(value).toLocaleString();
  }

  function fmtMoney(value) {
    if (value == null || Number.isNaN(value)) return "\u2013";
    if (Math.abs(value) >= 1000) return "$" + Math.round(value).toLocaleString();
    return "$" + value.toFixed(0);
  }

  function fmtPct(value) {
    if (value == null || Number.isNaN(value)) return "\u2013";
    return (value * 100).toFixed(1) + "%";
  }

  function fmtPctDelta(value) {
    if (value == null || Number.isNaN(value)) return "\u2013";
    var sign = value >= 0 ? "+" : "";
    return sign + (value * 100).toFixed(1) + " pts";
  }

  function pctDeltaClass(value) {
    if (value == null || Number.isNaN(value)) return "flat";
    if (value > 0) return "up";
    if (value < 0) return "down";
    return "flat";
  }

  function fmtPctDeltaHtml(value) {
    if (value == null || Number.isNaN(value)) return "\u2013";
    return '<span class="rate-delta ' + pctDeltaClass(value) + '">' + fmtPctDelta(value) + '</span>';
  }

  function fmtRatio(value) {
    if (value == null || Number.isNaN(value) || !Number.isFinite(value)) return "\u2013";
    return value.toFixed(2) + "x";
  }

  function fmtPoints(value) {
    if (value == null || Number.isNaN(value)) return "\u2013";
    return value.toFixed(1) + " pts";
  }

  function fmtSignedPoints(value) {
    if (value == null || Number.isNaN(value)) return "\u2013";
    var sign = value >= 0 ? "+" : "";
    return sign + value.toFixed(1) + " pts";
  }

  function fmtRank(value) {
    if (value == null || Number.isNaN(value)) return "\u2013";
    return value.toFixed(1);
  }

  function safeDiv(num, den) {
    return den ? num / den : 0;
  }

  function rateRatio(ourRate, marketRate) {
    return safeDiv(ourRate, marketRate);
  }

  function competitorRecommendationRules(scopeType) {
    if (scopeType === "term") {
      return {
        minWeeksPresent: 3,
        minTermWeeks: 3,
        minTermsCovered: 1,
        minClickPool: 0.18,
        minPurchasePool: 0.12,
        actionGap: 0.10,
        strongGap: 0.12,
        closeGap: 0.04,
        winGap: 0.05,
        efficiencyBuffer: 0.02,
        skewGap: 0.04,
        highOpportunity: 0.25,
        mediumOpportunity: 0.15
      };
    }
    return {
      minWeeksPresent: 2,
      minTermWeeks: 4,
      minTermsCovered: 2,
      minClickPool: 0.15,
      minPurchasePool: 0.10,
      actionGap: 0.08,
      strongGap: 0.10,
      closeGap: 0.05,
      winGap: 0.03,
      efficiencyBuffer: 0.03,
      skewGap: 0.04,
      highOpportunity: 0.30,
      mediumOpportunity: 0.18
    };
  }

  function competitorIssueRank(issue) {
    if (issue === "Visibility / Traffic + Conversion / PDP") return 7;
    if (issue === "Conversion / PDP") return 6;
    if (issue === "Visibility / Traffic") return 5;
    if (issue === "Winning / Defend") return 2;
    if (issue === "Competitive") return 1;
    return 0;
  }

  function competitorPriorityRank(priority) {
    if (priority === "High") return 3;
    if (priority === "Medium") return 2;
    if (priority === "Low") return 1;
    return 0;
  }

  function competitorIssueClass(issue) {
    if (issue === "Visibility / Traffic + Conversion / PDP") return "rec-threat";
    if (issue === "Conversion / PDP") return "rec-warning";
    if (issue === "Visibility / Traffic") return "rec-opportunity";
    if (issue === "Winning / Defend") return "rec-safe";
    if (issue === "Competitive") return "rec-neutral";
    return "rec-watch";
  }

  function competitorPriorityClass(priority) {
    if (priority === "High") return "rec-threat";
    if (priority === "Medium") return "rec-warning";
    if (priority === "Low") return "rec-neutral";
    return "rec-watch";
  }

  function competitorRecommendation(scopeType, observed, coverage) {
    var rules = competitorRecommendationRules(scopeType);
    var clickGap = observed.click_gap;
    var purchaseGap = observed.purchase_gap;
    var maxGap = Math.max(Math.abs(clickGap), Math.abs(purchaseGap));
    var opportunity = Math.max(coverage.avg_click_pool_share, coverage.avg_purchase_pool_share);
    var competitorAheadClicks = clickGap < -rules.closeGap;
    var competitorAheadPurchases = purchaseGap < -rules.closeGap;
    var ourAheadClicks = clickGap > rules.closeGap;
    var ourAheadPurchases = purchaseGap > rules.closeGap;
    var lowConfidence = false;

    if (coverage.weeks_present < rules.minWeeksPresent) {
      lowConfidence = true;
    }
    if (!lowConfidence && coverage.term_weeks_covered < rules.minTermWeeks) {
      lowConfidence = true;
    }
    if (!lowConfidence && coverage.terms_covered < rules.minTermsCovered) {
      lowConfidence = true;
    }
    if (!lowConfidence && coverage.avg_click_pool_share < rules.minClickPool && coverage.avg_purchase_pool_share < rules.minPurchasePool) {
      lowConfidence = true;
    }

    if (lowConfidence) {
      return {
        issue: "Low Confidence",
        priority: "Watch",
        issue_rank: competitorIssueRank("Low Confidence"),
        priority_rank: competitorPriorityRank("Watch"),
        issue_class: competitorIssueClass("Low Confidence"),
        priority_class: competitorPriorityClass("Watch")
      };
    }

    var issue = "Competitive";
    var priority = "Low";

    if (competitorAheadClicks && competitorAheadPurchases) {
      if (clickGap <= -rules.actionGap && purchaseGap <= -rules.actionGap) {
        issue = "Visibility / Traffic + Conversion / PDP";
      } else if (purchaseGap <= clickGap - rules.skewGap) {
        issue = "Conversion / PDP";
      } else if (clickGap <= purchaseGap - rules.skewGap) {
        issue = "Visibility / Traffic";
      } else {
        issue = "Visibility / Traffic + Conversion / PDP";
      }
    } else if (ourAheadClicks && competitorAheadPurchases) {
      issue = "Conversion / PDP";
    } else if (competitorAheadClicks) {
      issue = "Visibility / Traffic";
    } else if (competitorAheadPurchases) {
      issue = "Conversion / PDP";
    } else if (ourAheadClicks && ourAheadPurchases) {
      issue = "Winning / Defend";
    }

    if (issue === "Winning / Defend") {
      if (opportunity >= rules.highOpportunity) {
        priority = "Medium";
      } else {
        priority = "Low";
      }
    } else if (issue === "Competitive") {
      if (opportunity >= rules.highOpportunity && maxGap >= rules.closeGap) {
        priority = "Medium";
      } else {
        priority = "Low";
      }
    } else if (issue === "Visibility / Traffic + Conversion / PDP") {
      if (opportunity >= rules.mediumOpportunity || maxGap >= rules.strongGap) {
        priority = "High";
      } else {
        priority = "Medium";
      }
    } else {
      if (opportunity >= rules.mediumOpportunity && maxGap >= rules.actionGap) {
        priority = "High";
      } else {
        priority = "Medium";
      }
    }

    return {
      issue: issue,
      priority: priority,
      issue_rank: competitorIssueRank(issue),
      priority_rank: competitorPriorityRank(priority),
      issue_class: competitorIssueClass(issue),
      priority_class: competitorPriorityClass(priority)
    };
  }

  function competitorRecommendationForCluster(cluster) {
    var compare = selectedWeekTstCompare(cluster.tstCompare.weekly);
    return competitorRecommendation("root", compare.observed, compare.coverage);
  }

  function competitorRecommendationForRow(row) {
    return competitorRecommendation(
      "term",
      {
        our_click_share: row.our_click_share,
        our_purchase_share: row.our_purchase_share,
        competitor_click_share: row.competitor_click_share,
        competitor_purchase_share: row.competitor_purchase_share,
        click_gap: row.click_gap,
        purchase_gap: row.purchase_gap
      },
      {
        weeks_present: row.weeks_present,
        terms_covered: 1,
        term_weeks_covered: row.weeks_present,
        avg_click_pool_share: row.avg_click_pool_share,
        avg_purchase_pool_share: row.avg_purchase_pool_share
      }
    );
  }

  function recommendationPillHtml(label, className) {
    return '<span class="rec-pill ' + className + '">' + escapeHtml(label) + '</span>';
  }

  function sortIndicator(sortState, key) {
    if (sortState.key !== key) {
      return "";
    }
    if (sortState.dir === "asc") {
      return '<span class="sort-indicator">▲</span>';
    }
    return '<span class="sort-indicator">▼</span>';
  }

  function compareSortValues(a, b, dir, type) {
    if (type === "text") {
      if (dir === "asc") {
        return String(a).localeCompare(String(b));
      }
      return String(b).localeCompare(String(a));
    }
    if (a === b) {
      return 0;
    }
    if (dir === "asc") {
      return a - b;
    }
    return b - a;
  }

  function toggleSqpTableSort(key) {
    if (sqpTableSort.key === key) {
      if (sqpTableSort.dir === "desc") {
        sqpTableSort.dir = "asc";
      } else {
        sqpTableSort.dir = "desc";
      }
    } else {
      sqpTableSort.key = key;
      if (key === "term") {
        sqpTableSort.dir = "asc";
      } else {
        sqpTableSort.dir = "desc";
      }
    }
    renderFunnel();
  }

  function toggleScpTableSort(key) {
    if (scpTableSort.key === key) {
      if (scpTableSort.dir === "desc") {
        scpTableSort.dir = "asc";
      } else {
        scpTableSort.dir = "desc";
      }
    } else {
      scpTableSort.key = key;
      if (key === "asin") {
        scpTableSort.dir = "asc";
      } else {
        scpTableSort.dir = "desc";
      }
    }
    renderScpPanel();
  }

  function toggleBrTableSort(key) {
    if (brTableSort.key === key) {
      if (brTableSort.dir === "desc") {
        brTableSort.dir = "asc";
      } else {
        brTableSort.dir = "desc";
      }
    } else {
      brTableSort.key = key;
      if (key === "asin") {
        brTableSort.dir = "asc";
      } else {
        brTableSort.dir = "desc";
      }
    }
    renderBusinessReportsPanel();
  }

  function toggleCompetitorTableSort(key) {
    if (competitorTableSort.key === key) {
      if (competitorTableSort.dir === "desc") {
        competitorTableSort.dir = "asc";
      } else {
        competitorTableSort.dir = "desc";
      }
    } else {
      competitorTableSort.key = key;
      if (key === "term") {
        competitorTableSort.dir = "asc";
      } else {
        competitorTableSort.dir = "desc";
      }
    }
    renderCompetitorPanel();
  }

  function sqpSortValueForCluster(cluster, key) {
    var current = selectedWeekSqpMetrics(cluster.weekly);
    var purchaseRateMarket = safeDiv(current.market_purchases, current.market_cart_adds);
    var purchaseRateOur = safeDiv(current.asin_purchases, current.asin_cart_adds);
    if (key === "term") return cluster.cluster;
    if (key === "query_volume") return current.query_volume;
    if (key === "market_impressions") return current.market_impressions;
    if (key === "asin_impressions") return current.asin_impressions;
    if (key === "impression_share") return current.impression_share;
    if (key === "ctr_ratio") return rateRatio(current.asin_ctr, current.market_ctr);
    if (key === "market_ctr") return current.market_ctr;
    if (key === "asin_ctr") return current.asin_ctr;
    if (key === "market_clicks") return current.market_clicks;
    if (key === "asin_clicks") return current.asin_clicks;
    if (key === "click_share") return current.click_share;
    if (key === "atc_ratio") return rateRatio(current.asin_cart_add_rate, current.cart_add_rate);
    if (key === "cart_add_rate") return current.cart_add_rate;
    if (key === "asin_cart_add_rate") return current.asin_cart_add_rate;
    if (key === "market_cart_adds") return current.market_cart_adds;
    if (key === "asin_cart_adds") return current.asin_cart_adds;
    if (key === "cart_add_share") return current.cart_add_share;
    if (key === "purchase_rate_ratio") return rateRatio(purchaseRateOur, purchaseRateMarket);
    if (key === "purchase_rate_mkt") return safeDiv(current.market_purchases, current.market_cart_adds);
    if (key === "purchase_rate_our") return safeDiv(current.asin_purchases, current.asin_cart_adds);
    if (key === "cvr_ratio") return rateRatio(current.asin_cvr, current.market_cvr);
    if (key === "market_cvr") return current.market_cvr;
    if (key === "asin_cvr") return current.asin_cvr;
    if (key === "market_purchases") return current.market_purchases;
    if (key === "asin_purchases") return current.asin_purchases;
    if (key === "purchase_share") return current.purchase_share;
    return current.query_volume;
  }

  function sqpSortValueForTerm(term, key) {
    var current = selectedWeekSqpMetrics(term.weekly);
    var purchaseRateMarket = safeDiv(current.market_purchases, current.market_cart_adds);
    var purchaseRateOur = safeDiv(current.asin_purchases, current.asin_cart_adds);
    if (key === "term") return term.term;
    if (key === "query_volume") return current.query_volume;
    if (key === "market_impressions") return current.market_impressions;
    if (key === "asin_impressions") return current.asin_impressions;
    if (key === "impression_share") return current.impression_share;
    if (key === "ctr_ratio") return rateRatio(current.asin_ctr, current.market_ctr);
    if (key === "market_ctr") return current.market_ctr;
    if (key === "asin_ctr") return current.asin_ctr;
    if (key === "market_clicks") return current.market_clicks;
    if (key === "asin_clicks") return current.asin_clicks;
    if (key === "click_share") return current.click_share;
    if (key === "atc_ratio") return rateRatio(current.asin_cart_add_rate, current.cart_add_rate);
    if (key === "cart_add_rate") return current.cart_add_rate;
    if (key === "asin_cart_add_rate") return current.asin_cart_add_rate;
    if (key === "market_cart_adds") return current.market_cart_adds;
    if (key === "asin_cart_adds") return current.asin_cart_adds;
    if (key === "cart_add_share") return current.cart_add_share;
    if (key === "purchase_rate_ratio") return rateRatio(purchaseRateOur, purchaseRateMarket);
    if (key === "purchase_rate_mkt") return safeDiv(current.market_purchases, current.market_cart_adds);
    if (key === "purchase_rate_our") return safeDiv(current.asin_purchases, current.asin_cart_adds);
    if (key === "cvr_ratio") return rateRatio(current.asin_cvr, current.market_cvr);
    if (key === "market_cvr") return current.market_cvr;
    if (key === "asin_cvr") return current.asin_cvr;
    if (key === "market_purchases") return current.market_purchases;
    if (key === "asin_purchases") return current.asin_purchases;
    if (key === "purchase_share") return current.purchase_share;
    return current.query_volume;
  }

  function scpSortValueForRow(row, key) {
    var current = selectedWeekScpMetrics(row.weekly);
    if (key === "asin") return row.asin;
    if (key === "impressions") return current.impressions;
    if (key === "clicks") return current.clicks;
    if (key === "ctr") return current.ctr;
    if (key === "cart_adds") return current.cart_adds;
    if (key === "atc_rate") return current.atc_rate;
    if (key === "purchases") return current.purchases;
    if (key === "purchase_rate") return current.purchase_rate;
    if (key === "cvr") return current.cvr;
    if (key === "sales") return current.sales;
    if (key === "impression_share") return current.impressions;
    if (key === "click_share") return current.clicks;
    if (key === "purchase_share") return current.purchases;
    if (key === "weeks_present_selected_week") return row.weeks_present_selected_week;
    return current.purchases;
  }

  function brSortValueForRow(row, key) {
    var current = selectedWeekBusinessMetrics(row.weekly);
    if (key === "asin") return row.asin;
    if (key === "weeks_present_selected_week") return row.weeks_present_selected_week;
    if (key === "sessions") return current.sessions;
    if (key === "page_views") return current.page_views;
    if (key === "order_items") return current.order_items;
    if (key === "order_item_session_percentage") return current.order_item_session_percentage;
    if (key === "units_ordered") return current.units_ordered;
    if (key === "unit_session_percentage") return current.unit_session_percentage;
    if (key === "buy_box_percentage") return current.buy_box_percentage;
    if (key === "sales") return current.sales;
    return current.sessions;
  }

  function competitorSortValueForCluster(cluster, key) {
    var compare = selectedWeekTstCompare(cluster.tstCompare.weekly);
    var recommendation = competitorRecommendation("root", compare.observed, compare.coverage);
    if (key === "term") return cluster.cluster;
    if (key === "search_frequency_rank") return 0;
    if (key === "weeks_present") return compare.coverage.term_weeks_covered;
    if (key === "our_click_share") return compare.observed.our_click_share;
    if (key === "competitor_click_share") return compare.observed.competitor_click_share;
    if (key === "click_gap") return compare.observed.click_gap;
    if (key === "our_purchase_share") return compare.observed.our_purchase_share;
    if (key === "competitor_purchase_share") return compare.observed.competitor_purchase_share;
    if (key === "purchase_gap") return compare.observed.purchase_gap;
    if (key === "issue") return recommendation.issue_rank;
    if (key === "priority") return recommendation.priority_rank;
    if (key === "tst_pool") return compare.coverage.avg_purchase_pool_share;
    return compare.observed.competitor_purchase_share;
  }

  function competitorSortValueForRow(row, key) {
    var recommendation = competitorRecommendationForRow(row);
    if (key === "term") return row.term;
    if (key === "search_frequency_rank") {
      if (row.search_frequency_rank > 0) {
        return row.search_frequency_rank;
      }
      return Number.POSITIVE_INFINITY;
    }
    if (key === "weeks_present") return row.weeks_present;
    if (key === "our_click_share") return row.our_click_share;
    if (key === "competitor_click_share") return row.competitor_click_share;
    if (key === "click_gap") return row.click_gap;
    if (key === "our_purchase_share") return row.our_purchase_share;
    if (key === "competitor_purchase_share") return row.competitor_purchase_share;
    if (key === "purchase_gap") return row.purchase_gap;
    if (key === "issue") return recommendation.issue_rank;
    if (key === "priority") return recommendation.priority_rank;
    if (key === "tst_pool") return row.avg_purchase_pool_share;
    return row.competitor_purchase_share;
  }

  function competitorSortType(key) {
    if (key === "term" || key === "issue") {
      return "text";
    }
    return "number";
  }

  function escapeHtml(value) {
    var div = document.createElement("div");
    div.textContent = value;
    return div.innerHTML;
  }

  function clusterColor(cluster) {
    var palette = ["#8fc7ff", "#77dfd0", "#f3bc55", "#d5ff62", "#ff7a5c"];
    var key = (cluster.family) + "|" + (cluster.cluster);
    var hash = 0;
    for (var i = 0; i < key.length; i++) hash = ((hash << 5) - hash) + key.charCodeAt(i);
    return palette[Math.abs(hash) % palette.length];
  }

  function colorForRank(rank) {
    if (rank == null) return "rgba(255,255,255,0.08)";
    var clamped = rank;
    if (clamped < 10) clamped = 10;
    if (clamped > 40) clamped = 40;
    var t = (clamped - 10) / 30;
    var hue = 120 - (120 * t);
    return "hsl(" + hue.toFixed(1) + " 68% 56%)";
  }

  /* ===== SVG HELPERS ===== */

  function createSvg(container, width, height) {
    container.innerHTML = "";
    var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 " + width + " " + height);
    svg.setAttribute("width", width);
    svg.setAttribute("height", height);
    svg.setAttribute("aria-hidden", "true");
    container.appendChild(svg);
    return svg;
  }

  function appendSvg(parent, tag, attrs) {
    var node = document.createElementNS("http://www.w3.org/2000/svg", tag);
    Object.keys(attrs).forEach(function(key) {
      node.setAttribute(key, String(attrs[key]));
    });
    parent.appendChild(node);
    return node;
  }

  function scaleLinear(domainMin, domainMax, rangeMin, rangeMax) {
    var span = domainMax - domainMin;
    var output = rangeMax - rangeMin;
    return function(value) { return rangeMin + ((value - domainMin) / span) * output; };
  }

  function buildAxisTicks(maxValue, targetCount, minimumStep) {
    var safeMax = maxValue;
    if (safeMax <= 0) {
      safeMax = 1;
    }
    var rawStep = safeMax / targetCount;
    var magnitude = Math.pow(10, Math.floor(Math.log(rawStep) / Math.LN10));
    var scaled = rawStep / magnitude;
    var step = magnitude;
    if (scaled > 5) {
      step = 10 * magnitude;
    } else if (scaled > 2) {
      step = 5 * magnitude;
    } else if (scaled > 1) {
      step = 2 * magnitude;
    }
    if (step < minimumStep) {
      step = minimumStep;
    }
    var ticks = [];
    for (var value = step; value <= safeMax + step * 0.5; value += step) {
      ticks.push(value);
    }
    return ticks;
  }

  function changeWeekInfoForAnchor() {
    var info = new Map();
    var entries = reportData.changeLogByWeek[selectedWeekLabel];
    if (!entries) {
      return info;
    }
    entries.forEach(function(entry) {
      if (!info.has(entry.week_label)) {
        info.set(entry.week_label, {
          count: 0,
          titles: []
        });
      }
      var item = info.get(entry.week_label);
      item.count += 1;
      if (item.titles.length < 3) {
        item.titles.push(entry.title);
      }
    });
    return info;
  }

  function drawWeeklyChangeMarkers(svg, weeklySeries, xScale, top, bottom) {
    var changeInfo = changeWeekInfoForAnchor();
    if (changeInfo.size === 0) {
      return;
    }
    weeklySeries.forEach(function(week, index) {
      if (!changeInfo.has(week.week_label)) {
        return;
      }
      var marker = changeInfo.get(week.week_label);
      var x = xScale(index);
      /* Invisible wide hit area for hover */
      var hitArea = appendSvg(svg, "line", {
        x1: x, x2: x, y1: top, y2: bottom,
        stroke: "transparent", "stroke-width": 12, cursor: "pointer"
      });
      var line = appendSvg(svg, "line", {
        x1: x, x2: x, y1: top, y2: bottom,
        stroke: "rgba(241,235,222,0.34)", "stroke-width": 1.2, "stroke-dasharray": "3 5",
        "pointer-events": "none"
      });
      if (marker.count > 1) {
        var badge = appendSvg(svg, "text", {
          x: x,
          y: top + 10,
          fill: "rgba(241,235,222,0.82)",
          "font-size": 8,
          "text-anchor": "middle"
        });
        badge.textContent = String(marker.count);
      }
      hitArea.addEventListener("mouseenter", function(event) {
        line.setAttribute("stroke", "rgba(241,235,222,0.6)");
        var html = '<strong>Week ' + escapeHtml(week.week_label) + '</strong><br>' +
          marker.count + ' tracked change' + (marker.count === 1 ? '' : 's');
        marker.titles.forEach(function(title) {
          html += '<br>' + escapeHtml(title);
        });
        showTooltip(event, html);
      });
      hitArea.addEventListener("mousemove", moveTooltip);
      hitArea.addEventListener("mouseleave", function() {
        hideTooltip();
        line.setAttribute("stroke", "rgba(241,235,222,0.34)");
      });
    });
  }

  function renderSqpWeeklyChart(weeklySeries) {
    var container = document.getElementById("sqp-wow-chart");
    if (!container) { return; }
    if (!weeklySeries || weeklySeries.length === 0) { container.innerHTML = ""; return; }

    var width = container.clientWidth || 900;
    var height = container.clientHeight || 320;
    var margin = { top: 18, right: 72, bottom: 24, left: 38 };
    var svg = createSvg(container, width, height);
    var xScale = scaleLinear(0, Math.max(weeklySeries.length - 1, 1), margin.left, width - margin.right);
    var chartTop = margin.top;
    var chartBottom = height - margin.bottom;

    /* Share metrics stay in points; efficiency metrics use ratio advantage vs market */
    weeklySeries.forEach(function(w) {
      var impressionShare = w.impression_share;
      if (impressionShare == null || Number.isNaN(impressionShare)) {
        impressionShare = 0;
      }
      var ctrRatio = safeDiv(w.asin_ctr, w.market_ctr);
      var atcRatio = safeDiv(w.asin_cart_add_rate, w.cart_add_rate);
      var cvrRatio = safeDiv(w.asin_cvr, w.market_cvr);
      w._impr_points = impressionShare * 100;
      w._ctr_ratio = ctrRatio;
      w._atc_ratio = atcRatio;
      w._cvr_ratio = cvrRatio;
      w._ctr_adv = ctrRatio - 1;
      w._atc_adv = atcRatio - 1;
      w._cvr_adv = cvrRatio - 1;
    });

    /* Share line + rate ratio lines */
    var allSeries = [
      { field: "_impr_points", label: "Impr Share", color: "#8fc7ff", key: "impr", kind: "points" },
      { field: "_ctr_adv", label: "CTR", color: "#e0a4ff", key: "ctr", kind: "ratio", ratioField: "_ctr_ratio" },
      { field: "_atc_adv", label: "ATC Rate", color: "#f5a623", key: "atc", kind: "ratio", ratioField: "_atc_ratio" },
      { field: "_cvr_adv", label: "CVR", color: "#d5ff62", key: "cvr", kind: "ratio", ratioField: "_cvr_ratio" }
    ];
    var visibleSeries = allSeries.filter(function(s) { return sqpWowVisible[s.key]; });

    /* y-scale from visible data */
    var maxVal = 0.001, minVal = 0;
    weeklySeries.forEach(function(w) {
      visibleSeries.forEach(function(s) {
        var v = w[s.field];
        if (v > maxVal) maxVal = v;
        if (v < minVal) minVal = v;
      });
    });
    var yScale = scaleLinear(minVal * 1.15, maxVal * 1.15, chartBottom, chartTop);

    drawWeeklyChangeMarkers(svg, weeklySeries, xScale, chartTop, chartBottom);

    /* Zero line */
    if (minVal < 0) {
      appendSvg(svg, "line", { x1: margin.left, x2: width - margin.right, y1: yScale(0), y2: yScale(0), stroke: "rgba(255,255,255,0.12)", "stroke-width": 1, "stroke-dasharray": "4 3" });
    }
    appendSvg(svg, "line", { x1: margin.left, x2: width - margin.right, y1: chartBottom, y2: chartBottom, stroke: "rgba(255,255,255,0.08)", "stroke-width": 1 });

    /* Shaded fill to zero */
    function drawZeroFill(field, greenFill, redFill) {
      for (var i = 0; i < weeklySeries.length - 1; i++) {
        var x0 = xScale(i), x1 = xScale(i + 1);
        var v0 = weeklySeries[i][field], v1 = weeklySeries[i + 1][field];
        var yV0 = yScale(v0), yV1 = yScale(v1), yZ = yScale(0);
        var a0 = v0 >= 0, a1 = v1 >= 0;
        if (a0 === a1) {
          appendSvg(svg, "polygon", { points: x0.toFixed(1)+","+yV0.toFixed(1)+" "+x1.toFixed(1)+","+yV1.toFixed(1)+" "+x1.toFixed(1)+","+yZ.toFixed(1)+" "+x0.toFixed(1)+","+yZ.toFixed(1), fill: a0 ? greenFill : redFill });
        } else {
          var t = v0 / (v0 - v1), xM = (x0 + t * (x1 - x0)).toFixed(1);
          appendSvg(svg, "polygon", { points: x0.toFixed(1)+","+yV0.toFixed(1)+" "+xM+","+yZ.toFixed(1)+" "+x0.toFixed(1)+","+yZ.toFixed(1), fill: a0 ? greenFill : redFill });
          appendSvg(svg, "polygon", { points: xM+","+yZ.toFixed(1)+" "+x1.toFixed(1)+","+yV1.toFixed(1)+" "+x1.toFixed(1)+","+yZ.toFixed(1), fill: a0 ? redFill : greenFill });
        }
      }
    }
    visibleSeries.forEach(function(s) {
      if (s.kind === "ratio") drawZeroFill(s.field, "rgba(213,255,98,0.08)", "rgba(214,80,68,0.08)");
    });

    /* Draw lines + dots + end labels */
    visibleSeries.forEach(function(meta) {
      var path = "";
      weeklySeries.forEach(function(w, i) { path += (i === 0 ? "M" : " L") + xScale(i).toFixed(1) + " " + yScale(w[meta.field]).toFixed(1); });
      appendSvg(svg, "path", { d: path, fill: "none", stroke: meta.color, "stroke-width": 2.2, "stroke-linecap": "round", "stroke-linejoin": "round" });
      weeklySeries.forEach(function(w, i) { appendSvg(svg, "circle", { cx: xScale(i), cy: yScale(w[meta.field]), r: 2.6, fill: meta.color, stroke: "#09100f", "stroke-width": 1 }); });
      var last = weeklySeries[weeklySeries.length - 1];
      var el = appendSvg(svg, "text", { x: width - margin.right + 8, y: yScale(last[meta.field]) + 4, fill: meta.color, "font-size": 9 });
      if (meta.kind === "points") {
        el.textContent = fmtPoints(last[meta.field]);
      } else {
        el.textContent = fmtRatio(last[meta.ratioField]);
      }
    });

    /* Hover columns */
    var colW = weeklySeries.length > 1 ? (xScale(1) - xScale(0)) : (width - margin.left - margin.right);
    var guide = appendSvg(svg, "line", { x1: 0, y1: chartTop, x2: 0, y2: chartBottom, stroke: "rgba(255,255,255,0.15)", "stroke-width": 1, "pointer-events": "none", opacity: 0 });
    var changeInfo = changeWeekInfoForAnchor();
    weeklySeries.forEach(function(week, index) {
      var rect = appendSvg(svg, "rect", { x: xScale(index) - colW / 2, y: chartTop, width: colW, height: chartBottom - chartTop, fill: "transparent", cursor: "crosshair" });
      rect.addEventListener("mouseenter", function(e) {
        var lines = ['<strong>' + week.week_label + '</strong>'];
        visibleSeries.forEach(function(s) {
          var v = week[s.field];
          var clr = s.kind === "points" ? s.color : (v >= 0 ? s.color : "#d65044");
          var display = s.kind === "points" ? fmtPoints(v) : fmtRatio(week[s.ratioField]);
          lines.push('<span style="color:' + clr + '">' + s.label + ': ' + display + '</span>');
        });
        var cm = changeInfo.get(week.week_label);
        if (cm) {
          lines.push('<span style="color:rgba(241,235,222,0.6);border-top:1px solid rgba(255,255,255,0.1);padding-top:3px;display:inline-block;margin-top:2px;">' + cm.count + ' change' + (cm.count === 1 ? '' : 's') + '</span>');
          cm.titles.forEach(function(t) { lines.push('<span style="color:rgba(241,235,222,0.8);font-size:10px;">\u2022 ' + escapeHtml(t) + '</span>'); });
        }
        showTooltip(e, lines.join('<br>'));
        guide.setAttribute("x1", xScale(index)); guide.setAttribute("x2", xScale(index)); guide.setAttribute("opacity", "1");
      });
      rect.addEventListener("mousemove", moveTooltip);
      rect.addEventListener("mouseleave", function() { hideTooltip(); guide.setAttribute("opacity", "0"); });
    });

    /* Week labels */
    weeklySeries.forEach(function(w, i) {
      var l = appendSvg(svg, "text", { x: xScale(i), y: height - 6, fill: "#93a399", "font-size": 9, "text-anchor": "middle" });
      l.textContent = w.week_label;
    });
  }

  function renderScpWeeklyChart(weeklySeries) {
    var container = document.getElementById("scp-wow-chart");
    if (!container) { return; }
    if (!weeklySeries || weeklySeries.length === 0) { container.innerHTML = ""; return; }

    var width = container.clientWidth || 900;
    var height = container.clientHeight || 320;
    var margin = { top: 18, right: 72, bottom: 24, left: 38 };
    var svg = createSvg(container, width, height);
    var xScale = scaleLinear(0, Math.max(weeklySeries.length - 1, 1), margin.left, width - margin.right);
    var chartTop = margin.top;
    var chartBottom = height - margin.bottom;

    var allSeries = [
      { field: "ctr", label: "CTR", color: "#8fc7ff", key: "ctr" },
      { field: "atc_rate", label: "ATC Rate", color: "#f5a623", key: "atc" },
      { field: "purchase_rate", label: "Purch Rate", color: "#77dfd0", key: "purch" },
      { field: "cvr", label: "CVR", color: "#d5ff62", key: "cvr" }
    ];
    var visibleSeries = allSeries.filter(function(seriesMeta) { return scpWowVisible[seriesMeta.key]; });
    var maxVal = 0.001;
    weeklySeries.forEach(function(week) {
      visibleSeries.forEach(function(seriesMeta) {
        var value = week[seriesMeta.field];
        if (value > maxVal) {
          maxVal = value;
        }
      });
    });
    var yScale = scaleLinear(0, maxVal * 1.15, chartBottom, chartTop);

    drawWeeklyChangeMarkers(svg, weeklySeries, xScale, chartTop, chartBottom);
    appendSvg(svg, "line", { x1: margin.left, x2: width - margin.right, y1: chartBottom, y2: chartBottom, stroke: "rgba(255,255,255,0.08)", "stroke-width": 1 });

    visibleSeries.forEach(function(seriesMeta) {
      var path = "";
      weeklySeries.forEach(function(week, index) {
        path += (index === 0 ? "M" : " L") + xScale(index).toFixed(1) + " " + yScale(week[seriesMeta.field]).toFixed(1);
      });
      appendSvg(svg, "path", { d: path, fill: "none", stroke: seriesMeta.color, "stroke-width": 2.2, "stroke-linecap": "round", "stroke-linejoin": "round" });
      weeklySeries.forEach(function(week, index) {
        appendSvg(svg, "circle", { cx: xScale(index), cy: yScale(week[seriesMeta.field]), r: 2.6, fill: seriesMeta.color, stroke: "#09100f", "stroke-width": 1 });
      });
      var last = weeklySeries[weeklySeries.length - 1];
      var label = appendSvg(svg, "text", { x: width - margin.right + 8, y: yScale(last[seriesMeta.field]) + 4, fill: seriesMeta.color, "font-size": 9 });
      label.textContent = fmtPct(last[seriesMeta.field]);
    });

    var colW = weeklySeries.length > 1 ? (xScale(1) - xScale(0)) : (width - margin.left - margin.right);
    var guide = appendSvg(svg, "line", { x1: 0, y1: chartTop, x2: 0, y2: chartBottom, stroke: "rgba(255,255,255,0.15)", "stroke-width": 1, "pointer-events": "none", opacity: 0 });
    var changeInfo = changeWeekInfoForAnchor();
    weeklySeries.forEach(function(week, index) {
      var rect = appendSvg(svg, "rect", { x: xScale(index) - colW / 2, y: chartTop, width: colW, height: chartBottom - chartTop, fill: "transparent", cursor: "crosshair" });
      rect.addEventListener("mouseenter", function(event) {
        var lines = ['<strong>' + week.week_label + '</strong>'];
        visibleSeries.forEach(function(seriesMeta) {
          lines.push('<span style="color:' + seriesMeta.color + '">' + seriesMeta.label + ': ' + fmtPct(week[seriesMeta.field]) + '</span>');
        });
        lines.push('<span style="color:rgba(241,235,222,0.75)">Impr: ' + fmtNumber(week.impressions) + ' · Clicks: ' + fmtNumber(week.clicks) + ' · Purch: ' + fmtNumber(week.purchases) + '</span>');
        var marker = changeInfo.get(week.week_label);
        if (marker) {
          lines.push('<span style="color:rgba(241,235,222,0.6);border-top:1px solid rgba(255,255,255,0.1);padding-top:3px;display:inline-block;margin-top:2px;">' + marker.count + ' change' + (marker.count === 1 ? '' : 's') + '</span>');
          marker.titles.forEach(function(title) {
            lines.push('<span style="color:rgba(241,235,222,0.8);font-size:10px;">• ' + escapeHtml(title) + '</span>');
          });
        }
        showTooltip(event, lines.join('<br>'));
        guide.setAttribute("x1", xScale(index));
        guide.setAttribute("x2", xScale(index));
        guide.setAttribute("opacity", "1");
      });
      rect.addEventListener("mousemove", moveTooltip);
      rect.addEventListener("mouseleave", function() {
        hideTooltip();
        guide.setAttribute("opacity", "0");
      });
    });

    weeklySeries.forEach(function(week, index) {
      var label = appendSvg(svg, "text", { x: xScale(index), y: height - 6, fill: "#93a399", "font-size": 9, "text-anchor": "middle" });
      label.textContent = week.week_label;
    });
  }

  function renderBusinessReportsWeeklyChart(weeklySeries) {
    var container = document.getElementById("br-wow-chart");
    if (!container) { return; }
    if (!weeklySeries || weeklySeries.length === 0) { container.innerHTML = ""; return; }

    var width = container.clientWidth || 900;
    var height = container.clientHeight || 320;
    var margin = { top: 18, right: 86, bottom: 24, left: 44 };
    var svg = createSvg(container, width, height);
    var xScale = scaleLinear(0, Math.max(weeklySeries.length - 1, 1), margin.left, width - margin.right);
    var chartTop = margin.top;
    var chartBottom = height - margin.bottom;
    var barWidth = weeklySeries.length > 1 ? (xScale(1) - xScale(0)) * 0.58 : 36;
    var maxSessions = 1;
    var maxRate = 0.001;
    weeklySeries.forEach(function(week) {
      if (week.sessions > maxSessions) {
        maxSessions = week.sessions;
      }
      if (week.order_item_session_percentage > maxRate) {
        maxRate = week.order_item_session_percentage;
      }
      if (week.unit_session_percentage > maxRate) {
        maxRate = week.unit_session_percentage;
      }
    });
    var yCount = scaleLinear(0, maxSessions * 1.15, chartBottom, chartTop);
    var yRate = scaleLinear(0, maxRate * 1.15, chartBottom, chartTop);

    drawWeeklyChangeMarkers(svg, weeklySeries, xScale, chartTop, chartBottom);

    appendSvg(svg, "line", {
      x1: margin.left, x2: width - margin.right, y1: chartBottom, y2: chartBottom,
      stroke: "rgba(255,255,255,0.08)", "stroke-width": 1
    });

    if (brWowVisible.sessions) {
      weeklySeries.forEach(function(week, index) {
        var x = xScale(index) - barWidth / 2;
        var y = yCount(week.sessions);
        var rect = appendSvg(svg, "rect", {
          x: x,
          y: y,
          width: barWidth,
          height: Math.max(chartBottom - y, 1),
          rx: 4,
          fill: "rgba(143,199,255,0.34)",
          stroke: "rgba(143,199,255,0.72)",
          "stroke-width": 1
        });
        rect.setAttribute("pointer-events", "none");
      });
      var sessionLabel = appendSvg(svg, "text", {
        x: width - margin.right + 8,
        y: yCount(weeklySeries[weeklySeries.length - 1].sessions) + 4,
        fill: "#8fc7ff",
        "font-size": 9
      });
      sessionLabel.textContent = fmtNumber(weeklySeries[weeklySeries.length - 1].sessions);
    }

    [
      { field: "order_item_session_percentage", label: "Order Item %", color: "#f5a623", key: "order_items" },
      { field: "unit_session_percentage", label: "Unit Session %", color: "#d5ff62", key: "unit_session" }
    ].forEach(function(meta) {
      if (!brWowVisible[meta.key]) {
        return;
      }
      var path = "";
      weeklySeries.forEach(function(week, index) {
        path += (index === 0 ? "M" : " L") + xScale(index).toFixed(1) + " " + yRate(week[meta.field]).toFixed(1);
      });
      appendSvg(svg, "path", {
        d: path,
        fill: "none",
        stroke: meta.color,
        "stroke-width": 2.2,
        "stroke-linecap": "round",
        "stroke-linejoin": "round"
      });
      weeklySeries.forEach(function(week, index) {
        appendSvg(svg, "circle", {
          cx: xScale(index),
          cy: yRate(week[meta.field]),
          r: 2.6,
          fill: meta.color,
          stroke: "#09100f",
          "stroke-width": 1
        });
      });
      var rateLabel = appendSvg(svg, "text", {
        x: width - margin.right + 8,
        y: yRate(weeklySeries[weeklySeries.length - 1][meta.field]) + 4,
        fill: meta.color,
        "font-size": 9
      });
      rateLabel.textContent = fmtPct(weeklySeries[weeklySeries.length - 1][meta.field]);
    });

    var colW = weeklySeries.length > 1 ? (xScale(1) - xScale(0)) : (width - margin.left - margin.right);
    var guide = appendSvg(svg, "line", {
      x1: 0, y1: chartTop, x2: 0, y2: chartBottom,
      stroke: "rgba(255,255,255,0.15)", "stroke-width": 1,
      "pointer-events": "none", opacity: 0
    });
    var changeInfo = changeWeekInfoForAnchor();
    weeklySeries.forEach(function(week, index) {
      var rect = appendSvg(svg, "rect", {
        x: xScale(index) - colW / 2,
        y: chartTop,
        width: colW,
        height: chartBottom - chartTop,
        fill: "transparent",
        cursor: "crosshair"
      });
      rect.addEventListener("mouseenter", function(event) {
        var lines = ['<strong>' + week.week_label + '</strong>'];
        if (brWowVisible.sessions) {
          lines.push('<span style="color:#8fc7ff">Sessions: ' + fmtNumber(week.sessions) + '</span>');
        }
        if (brWowVisible.order_items) {
          lines.push('<span style="color:#f5a623">Order Item %: ' + fmtPct(week.order_item_session_percentage) + '</span>');
        }
        if (brWowVisible.unit_session) {
          lines.push('<span style="color:#d5ff62">Unit Session %: ' + fmtPct(week.unit_session_percentage) + '</span>');
        }
        var marker = changeInfo.get(week.week_label);
        if (marker) {
          lines.push('<span style="color:rgba(241,235,222,0.6);border-top:1px solid rgba(255,255,255,0.1);padding-top:3px;display:inline-block;margin-top:2px;">' + marker.count + ' change' + (marker.count === 1 ? '' : 's') + '</span>');
          marker.titles.forEach(function(title) {
            lines.push('<span style="color:rgba(241,235,222,0.8);font-size:10px;">• ' + escapeHtml(title) + '</span>');
          });
        }
        showTooltip(event, lines.join('<br>'));
        guide.setAttribute("x1", xScale(index));
        guide.setAttribute("x2", xScale(index));
        guide.setAttribute("opacity", "1");
      });
      rect.addEventListener("mousemove", moveTooltip);
      rect.addEventListener("mouseleave", function() {
        hideTooltip();
        guide.setAttribute("opacity", "0");
      });
    });

    weeklySeries.forEach(function(week, index) {
      var label = appendSvg(svg, "text", {
        x: xScale(index),
        y: height - 6,
        fill: "#93a399",
        "font-size": 9,
        "text-anchor": "middle"
      });
      label.textContent = week.week_label;
    });
  }

  function renderBusinessReportsDailyChart(dailySeries) {
    var container = document.getElementById("br-wow-chart");
    if (!container) { return; }
    if (!dailySeries || dailySeries.length === 0) { container.innerHTML = ""; return; }

    var width = container.clientWidth || 900;
    var height = container.clientHeight || 320;
    var margin = { top: 18, right: 86, bottom: 24, left: 44 };
    var svg = createSvg(container, width, height);
    var xScale = scaleLinear(0, Math.max(dailySeries.length - 1, 1), margin.left, width - margin.right);
    var chartTop = margin.top;
    var chartBottom = height - margin.bottom;
    var barWidth = dailySeries.length > 1 ? (xScale(1) - xScale(0)) * 0.58 : 36;
    var maxSessions = 1;
    var maxRate = 0.001;
    dailySeries.forEach(function(day) {
      if (day.sessions > maxSessions) {
        maxSessions = day.sessions;
      }
      if (day.order_item_session_percentage > maxRate) {
        maxRate = day.order_item_session_percentage;
      }
      if (day.unit_session_percentage > maxRate) {
        maxRate = day.unit_session_percentage;
      }
    });
    var yCount = scaleLinear(0, maxSessions * 1.15, chartBottom, chartTop);
    var yRate = scaleLinear(0, maxRate * 1.15, chartBottom, chartTop);

    appendSvg(svg, "line", {
      x1: margin.left, x2: width - margin.right, y1: chartBottom, y2: chartBottom,
      stroke: "rgba(255,255,255,0.08)", "stroke-width": 1
    });

    dailySeries.forEach(function(day, index) {
      if (!day.change_count) {
        return;
      }
      var markerX = xScale(index);
      appendSvg(svg, "line", {
        x1: markerX,
        x2: markerX,
        y1: chartTop,
        y2: chartBottom,
        stroke: "rgba(241,235,222,0.24)",
        "stroke-width": 1.2,
        "stroke-dasharray": "4 3",
        "pointer-events": "none"
      });
      appendSvg(svg, "circle", {
        cx: markerX,
        cy: chartTop + 8,
        r: 3.1,
        fill: "#f1ebde",
        stroke: "#09100f",
        "stroke-width": 1,
        "pointer-events": "none"
      });
    });

    if (brWowVisible.sessions) {
      dailySeries.forEach(function(day, index) {
        var x = xScale(index) - barWidth / 2;
        var y = yCount(day.sessions);
        var rect = appendSvg(svg, "rect", {
          x: x,
          y: y,
          width: barWidth,
          height: Math.max(chartBottom - y, 1),
          rx: 4,
          fill: "rgba(143,199,255,0.34)",
          stroke: "rgba(143,199,255,0.72)",
          "stroke-width": 1
        });
        rect.setAttribute("pointer-events", "none");
      });
      var sessionLabel = appendSvg(svg, "text", {
        x: width - margin.right + 8,
        y: yCount(dailySeries[dailySeries.length - 1].sessions) + 4,
        fill: "#8fc7ff",
        "font-size": 9
      });
      sessionLabel.textContent = fmtNumber(dailySeries[dailySeries.length - 1].sessions);
    }

    [
      { field: "order_item_session_percentage", label: "Order Item %", color: "#f5a623", key: "order_items" },
      { field: "unit_session_percentage", label: "Unit Session %", color: "#d5ff62", key: "unit_session" }
    ].forEach(function(meta) {
      if (!brWowVisible[meta.key]) {
        return;
      }
      var path = "";
      dailySeries.forEach(function(day, index) {
        path += (index === 0 ? "M" : " L") + xScale(index).toFixed(1) + " " + yRate(day[meta.field]).toFixed(1);
      });
      appendSvg(svg, "path", {
        d: path,
        fill: "none",
        stroke: meta.color,
        "stroke-width": 2.2,
        "stroke-linecap": "round",
        "stroke-linejoin": "round"
      });
      dailySeries.forEach(function(day, index) {
        appendSvg(svg, "circle", {
          cx: xScale(index),
          cy: yRate(day[meta.field]),
          r: 2.6,
          fill: meta.color,
          stroke: "#09100f",
          "stroke-width": 1
        });
      });
      var rateLabel = appendSvg(svg, "text", {
        x: width - margin.right + 8,
        y: yRate(dailySeries[dailySeries.length - 1][meta.field]) + 4,
        fill: meta.color,
        "font-size": 9
      });
      rateLabel.textContent = fmtPct(dailySeries[dailySeries.length - 1][meta.field]);
    });

    var colW = dailySeries.length > 1 ? (xScale(1) - xScale(0)) : (width - margin.left - margin.right);
    var guide = appendSvg(svg, "line", {
      x1: 0, y1: chartTop, x2: 0, y2: chartBottom,
      stroke: "rgba(255,255,255,0.15)", "stroke-width": 1,
      "pointer-events": "none", opacity: 0
    });
    dailySeries.forEach(function(day, index) {
      var rect = appendSvg(svg, "rect", {
        x: xScale(index) - colW / 2,
        y: chartTop,
        width: colW,
        height: chartBottom - chartTop,
        fill: "transparent",
        cursor: "crosshair"
      });
      rect.addEventListener("mouseenter", function(event) {
        var lines = ['<strong>' + day.date_label + '</strong>'];
        if (brWowVisible.sessions) {
          lines.push('<span style="color:#8fc7ff">Sessions: ' + fmtNumber(day.sessions) + '</span>');
        }
        if (brWowVisible.order_items) {
          lines.push('<span style="color:#f5a623">Order Item %: ' + fmtPct(day.order_item_session_percentage) + '</span>');
        }
        if (brWowVisible.unit_session) {
          lines.push('<span style="color:#d5ff62">Unit Session %: ' + fmtPct(day.unit_session_percentage) + '</span>');
        }
        if (day.change_count > 0) {
          lines.push('<span style="color:rgba(241,235,222,0.6);border-top:1px solid rgba(255,255,255,0.1);padding-top:3px;display:inline-block;margin-top:2px;">' + day.change_count + ' change' + (day.change_count === 1 ? '' : 's') + '</span>');
          day.change_titles.forEach(function(title) {
            lines.push('<span style="color:rgba(241,235,222,0.8);font-size:10px;">• ' + escapeHtml(title) + '</span>');
          });
        }
        showTooltip(event, lines.join('<br>'));
        guide.setAttribute("x1", xScale(index));
        guide.setAttribute("x2", xScale(index));
        guide.setAttribute("opacity", "1");
      });
      rect.addEventListener("mousemove", moveTooltip);
      rect.addEventListener("mouseleave", function() {
        hideTooltip();
        guide.setAttribute("opacity", "0");
      });
    });

    dailySeries.forEach(function(day, index) {
      var label = appendSvg(svg, "text", {
        x: xScale(index),
        y: height - 6,
        fill: "#93a399",
        "font-size": 9,
        "text-anchor": "middle"
      });
      label.textContent = day.day_label;
    });
  }

  function renderCompetitorWeeklyChart(weeklySeries, competitor) {
    var container = document.getElementById("competitor-wow-chart");
    if (!container) { return; }
    if (!weeklySeries || weeklySeries.length === 0) { container.innerHTML = ""; return; }

    var width = container.clientWidth || 900;
    var height = container.clientHeight || 320;
    var margin = { top: 18, right: 72, bottom: 24, left: 38 };
    var svg = createSvg(container, width, height);
    var xScale = scaleLinear(0, Math.max(weeklySeries.length - 1, 1), margin.left, width - margin.right);
    var chartTop = margin.top;
    var chartBottom = height - margin.bottom;

    var compName = competitor ? competitor.brand : "Competitor";

    /* Pre-compute deltas: our share minus competitor share */
    weeklySeries.forEach(function(w) {
      w._click_delta = (w.observed.our_click_share || 0) - (w.observed.competitor_click_share || 0);
      w._purch_delta = (w.observed.our_purchase_share || 0) - (w.observed.competitor_purchase_share || 0);
    });

    /* 2 gap lines in points — filtered by toggle */
    var allSeries = [
      { field: "_click_delta", label: "Click Gap", color: "#77dfd0", key: "click" },
      { field: "_purch_delta", label: "Purch Gap", color: "#d5ff62", key: "purch" }
    ];
    var series = allSeries.filter(function(s) { return compWowVisible[s.key]; });

    /* y-scale */
    var maxVal = 0.001, minVal = 0;
    weeklySeries.forEach(function(w) {
      series.forEach(function(s) {
        var v = w[s.field];
        if (v > maxVal) maxVal = v;
        if (v < minVal) minVal = v;
      });
    });
    var yScale = scaleLinear(minVal * 1.15, maxVal * 1.15, chartBottom, chartTop);

    drawWeeklyChangeMarkers(svg, weeklySeries, xScale, chartTop, chartBottom);

    /* Zero line */
    if (minVal < 0) {
      appendSvg(svg, "line", { x1: margin.left, x2: width - margin.right, y1: yScale(0), y2: yScale(0), stroke: "rgba(255,255,255,0.12)", "stroke-width": 1, "stroke-dasharray": "4 3" });
    }
    appendSvg(svg, "line", { x1: margin.left, x2: width - margin.right, y1: chartBottom, y2: chartBottom, stroke: "rgba(255,255,255,0.08)", "stroke-width": 1 });

    /* Shaded fill to zero */
    function drawZeroFill(field, greenFill, redFill) {
      for (var i = 0; i < weeklySeries.length - 1; i++) {
        var x0 = xScale(i), x1 = xScale(i + 1);
        var v0 = weeklySeries[i][field], v1 = weeklySeries[i + 1][field];
        var yV0 = yScale(v0), yV1 = yScale(v1), yZ = yScale(0);
        var a0 = v0 >= 0, a1 = v1 >= 0;
        if (a0 === a1) {
          appendSvg(svg, "polygon", { points: x0.toFixed(1)+","+yV0.toFixed(1)+" "+x1.toFixed(1)+","+yV1.toFixed(1)+" "+x1.toFixed(1)+","+yZ.toFixed(1)+" "+x0.toFixed(1)+","+yZ.toFixed(1), fill: a0 ? greenFill : redFill });
        } else {
          var t = v0 / (v0 - v1), xM = (x0 + t * (x1 - x0)).toFixed(1);
          appendSvg(svg, "polygon", { points: x0.toFixed(1)+","+yV0.toFixed(1)+" "+xM+","+yZ.toFixed(1)+" "+x0.toFixed(1)+","+yZ.toFixed(1), fill: a0 ? greenFill : redFill });
          appendSvg(svg, "polygon", { points: xM+","+yZ.toFixed(1)+" "+x1.toFixed(1)+","+yV1.toFixed(1)+" "+x1.toFixed(1)+","+yZ.toFixed(1), fill: a0 ? redFill : greenFill });
        }
      }
    }
    series.forEach(function(s) { drawZeroFill(s.field, "rgba(213,255,98,0.08)", "rgba(214,80,68,0.08)"); });

    /* Draw lines + dots + end labels */
    series.forEach(function(meta) {
      var path = "";
      weeklySeries.forEach(function(w, i) { path += (i === 0 ? "M" : " L") + xScale(i).toFixed(1) + " " + yScale(w[meta.field]).toFixed(1); });
      appendSvg(svg, "path", { d: path, fill: "none", stroke: meta.color, "stroke-width": 2.2, "stroke-linecap": "round", "stroke-linejoin": "round" });
      weeklySeries.forEach(function(w, i) { appendSvg(svg, "circle", { cx: xScale(i), cy: yScale(w[meta.field]), r: 2.6, fill: meta.color, stroke: "#09100f", "stroke-width": 1 }); });
      var last = weeklySeries[weeklySeries.length - 1];
      var el = appendSvg(svg, "text", { x: width - margin.right + 8, y: yScale(last[meta.field]) + 4, fill: meta.color, "font-size": 9 });
      el.textContent = fmtPctDelta(last[meta.field]);
    });

    /* Hover columns */
    var colW = weeklySeries.length > 1 ? (xScale(1) - xScale(0)) : (width - margin.left - margin.right);
    var guide = appendSvg(svg, "line", { x1: 0, y1: chartTop, x2: 0, y2: chartBottom, stroke: "rgba(255,255,255,0.15)", "stroke-width": 1, "pointer-events": "none", opacity: 0 });
    var changeInfo = changeWeekInfoForAnchor();
    weeklySeries.forEach(function(week, index) {
      var rect = appendSvg(svg, "rect", { x: xScale(index) - colW / 2, y: chartTop, width: colW, height: chartBottom - chartTop, fill: "transparent", cursor: "crosshair" });
      rect.addEventListener("mouseenter", function(e) {
        var lines = ['<strong>' + week.week_label + '</strong>'];
        series.forEach(function(s) {
          var v = week[s.field];
          var clr = v >= 0 ? s.color : "#d65044";
          lines.push('<span style="color:' + clr + '">' + s.label + ': ' + fmtPctDelta(v) + '</span>');
        });
        var cm = changeInfo.get(week.week_label);
        if (cm) {
          lines.push('<span style="color:rgba(241,235,222,0.6);border-top:1px solid rgba(255,255,255,0.1);padding-top:3px;display:inline-block;margin-top:2px;">' + cm.count + ' change' + (cm.count === 1 ? '' : 's') + '</span>');
          cm.titles.forEach(function(t) { lines.push('<span style="color:rgba(241,235,222,0.8);font-size:10px;">\u2022 ' + escapeHtml(t) + '</span>'); });
        }
        showTooltip(e, lines.join('<br>'));
        guide.setAttribute("x1", xScale(index)); guide.setAttribute("x2", xScale(index)); guide.setAttribute("opacity", "1");
      });
      rect.addEventListener("mousemove", moveTooltip);
      rect.addEventListener("mouseleave", function() { hideTooltip(); guide.setAttribute("opacity", "0"); });
    });

    /* Week labels */
    weeklySeries.forEach(function(w, i) {
      var l = appendSvg(svg, "text", { x: xScale(i), y: height - 6, fill: "#93a399", "font-size": 9, "text-anchor": "middle" });
      l.textContent = w.week_label;
    });
  }

  /* ===== TOOLTIP ===== */

  var tooltip = document.getElementById("tooltip");

  function showTooltip(event, htmlContent) {
    tooltip.innerHTML = htmlContent;
    tooltip.classList.add("visible");
    moveTooltip(event);
  }

  function moveTooltip(event) {
    var rect = tooltip.getBoundingClientRect();
    var left = event.clientX + 16;
    var top = event.clientY + 16;
    if (left + rect.width > window.innerWidth) left = event.clientX - rect.width - 16;
    if (top + rect.height > window.innerHeight) top = event.clientY - rect.height - 16;
    tooltip.style.left = left + "px";
    tooltip.style.top = top + "px";
  }

  function hideTooltip() {
    tooltip.classList.remove("visible");
    tooltip.innerHTML = "";
    tooltip.style.left = "-9999px";
    tooltip.style.top = "-9999px";
  }

  /* ===== SPARKLINE HELPERS ===== */

  function miniSparkline(values, color, w, h) {
    var usable = [];
    values.forEach(function(v, i) { if (v != null && !Number.isNaN(v)) usable.push({ v: v, i: i }); });
    if (usable.length < 2) return "";
    var maxV = usable[0].v;
    var minV = usable[0].v;
    usable.forEach(function(p) { if (p.v > maxV) maxV = p.v; if (p.v < minV) minV = p.v; });
    var range = (maxV - minV);
    if (range < 0.0001) range = 0.0001;
    var xS = function(idx) { return 2 + (idx / Math.max(values.length - 1, 1)) * (w - 4); };
    var yS = function(v) { return h - 2 - ((v - minV) / range) * (h - 4); };
    var pts = usable.map(function(p) { return xS(p.i).toFixed(1) + "," + yS(p.v).toFixed(1); }).join(" ");
    return '<svg width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '" style="vertical-align:middle;"><polyline points="' + pts + '" fill="none" stroke="' + color + '" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" opacity="0.7"/></svg>';
  }

  function computeDelta(weekly, field, recentWindow) {
    var recentLabels = recentWindow;
    var recent = [];
    var baseline = [];
    weekly.forEach(function(w) {
      var val = w[field];
      if (val == null) return;
      if (recentLabels.indexOf(w.week_label) !== -1) {
        recent.push(val);
      } else {
        baseline.push(val);
      }
    });
    if (!recent.length) return null;
    if (!baseline.length) return null;
    var avgRecent = recent.reduce(function(a, b) { return a + b; }, 0) / recent.length;
    var avgBaseline = baseline.reduce(function(a, b) { return a + b; }, 0) / baseline.length;
    return avgRecent - avgBaseline;
  }

  function windowRangeLabel(weeks) {
    if (!weeks.length) return "";
    var label = weeks[0];
    if (weeks.length > 1) {
      label += " – " + weeks[weeks.length - 1];
    }
    return label;
  }

  function deltaHtml(value) {
    if (value == null) return "";
    return fmtPctDeltaHtml(value);
  }

  function rootTermIds(clusterId) {
    var ids = activeData.sqpClusterTerms[clusterId];
    if (!Array.isArray(ids)) {
      return [];
    }
    return ids.filter(function(termId) {
      return termMap.has(termId);
    });
  }

  function competitorTermKey(rootLabel, term) {
    return rootLabel + "::" + term;
  }

  function competitorAllWeeklyTermRows(cluster) {
    var rowsByTerm = new Map();
    cluster.tstCompare.weekly.forEach(function(weekCompare) {
      weekCompare.term_rows.forEach(function(row) {
        if (!rowsByTerm.has(row.term)) {
          rowsByTerm.set(row.term, row);
        }
      });
    });
    return Array.from(rowsByTerm.values());
  }

  function competitorRootTermIds(clusterId) {
    var cluster = clusterMap.get(clusterId);
    if (!cluster) {
      return [];
    }
    return competitorAllWeeklyTermRows(cluster).map(function(row) {
      return competitorTermKey(cluster.cluster, row.term);
    });
  }

  function competitorSelectedTermsForRoot(clusterId) {
    return competitorRootTermIds(clusterId).filter(function(termId) {
      return selectedCompetitorTermIds.has(termId);
    });
  }

  function selectedTermsForRoot(clusterId) {
    return rootTermIds(clusterId).filter(function(termId) {
      return selectedTermIds.has(termId);
    });
  }

  function allRootIds() {
    return activeData.clusters.map(function(cluster) {
      return cluster.id;
    });
  }

  function selectedRootIdsList() {
    return allRootIds().filter(function(clusterId) {
      return selectedSqpRootIds.has(clusterId);
    });
  }

  function rootSelectionState(clusterId) {
    var allIds = rootTermIds(clusterId);
    var selectedIds = selectedTermsForRoot(clusterId);
    return {
      allIds: allIds,
      selectedIds: selectedIds,
      totalCount: allIds.length,
      selectedCount: selectedIds.length,
      checked: allIds.length > 0 && selectedIds.length === allIds.length,
      partial: selectedIds.length > 0 && selectedIds.length < allIds.length
    };
  }

  function allTermsSelected(clusterId) {
    var ids = rootTermIds(clusterId);
    if (!ids.length) {
      return false;
    }
    return ids.every(function(termId) {
      return selectedTermIds.has(termId);
    });
  }

  function allRootTerms() {
    var ids = [];
    activeData.clusters.forEach(function(cluster) {
      rootTermIds(cluster.id).forEach(function(termId) {
        ids.push(termId);
      });
    });
    return ids;
  }

  function updateRootSelectionSummary() {
    var summary = document.getElementById("root-selection-summary");
    if (!summary) {
      return;
    }
    var selectedRoots = selectedRootIdsList();
    if (!selectedRoots.length) {
      summary.textContent = "Selected week · 0 roots";
      return;
    }
    summary.textContent = "Selected week · " + selectedRoots.length + " roots · " + selectedTermIds.size + " terms";
  }

  function syncSqpSelectionUi() {
    document.querySelectorAll(".root-row").forEach(function(r) {
      var rid = r.getAttribute("data-root-id");
      var state = rootSelectionState(rid);
      r.classList.toggle("selected", state.checked);
      r.classList.toggle("partial", state.partial);
      r.classList.toggle("expanded", expandedRootIds.has(rid));
      var checkbox = r.querySelector("[data-root-checkbox]");
      if (checkbox) {
        checkbox.checked = state.checked;
        checkbox.indeterminate = state.partial;
      }
    });
    updateRootSelectionSummary();
  }

  function renderExpandedTermTables() {
    expandedRootIds.forEach(function(clusterId) {
      if (clusterMap.has(clusterId)) {
        renderTermExpansion(clusterId);
      }
    });
  }

  function setRootSelection(clusterId, shouldSelect) {
    var ids = rootTermIds(clusterId);
    if (shouldSelect) {
      selectedSqpRootIds.add(clusterId);
    } else {
      selectedSqpRootIds.delete(clusterId);
    }
    ids.forEach(function(termId) {
      if (shouldSelect) {
        selectedTermIds.add(termId);
      } else {
        selectedTermIds.delete(termId);
      }
    });
    hasInitializedSqpSelection = true;
    syncSqpSelectionUi();
    renderFunnel();
  }

  function toggleRootExpansion(clusterId) {
    if (expandedRootIds.has(clusterId)) {
      expandedRootIds.delete(clusterId);
    } else {
      expandedRootIds.add(clusterId);
    }
    renderFunnel();
  }

  function selectAllRoots() {
    selectedSqpRootIds = new Set(allRootIds());
    selectedTermIds = new Set(allRootTerms());
    hasInitializedSqpSelection = true;
    syncSqpSelectionUi();
    renderFunnel();
  }

  function clearAllRoots() {
    selectedSqpRootIds = new Set();
    selectedTermIds = new Set();
    hasInitializedSqpSelection = true;
    syncSqpSelectionUi();
    renderFunnel();
  }

  function initRootSelectionControls() {
    var selectAllBtn = document.getElementById("roots-select-all");
    var clearAllBtn = document.getElementById("roots-clear-all");
    if (!selectAllBtn || !clearAllBtn) {
      return;
    }
    selectAllBtn.addEventListener("click", function() {
      selectAllRoots();
    });
    clearAllBtn.addEventListener("click", function() {
      clearAllRoots();
    });
  }

  function selectedCompetitorRootIdsList() {
    return allRootIds().filter(function(clusterId) {
      return selectedCompetitorRootIds.has(clusterId);
    });
  }

  function competitorRootSelectionState(clusterId) {
    var allIds = competitorRootTermIds(clusterId);
    var selectedIds = competitorSelectedTermsForRoot(clusterId);
    return {
      allIds: allIds,
      selectedIds: selectedIds,
      totalCount: allIds.length,
      selectedCount: selectedIds.length,
      checked: allIds.length > 0 && selectedIds.length === allIds.length,
      partial: selectedIds.length > 0 && selectedIds.length < allIds.length
    };
  }

  function allCompetitorRootTerms() {
    var ids = [];
    activeData.clusters.forEach(function(cluster) {
      competitorRootTermIds(cluster.id).forEach(function(termId) {
        ids.push(termId);
      });
    });
    return ids;
  }

  function updateCompetitorSelectionSummary() {
    var summary = document.getElementById("competitor-selection-summary");
    if (!summary) {
      return;
    }
    var selectedRoots = selectedCompetitorRootIdsList();
    if (!selectedRoots.length) {
      summary.textContent = "TST selected week · 0 roots";
      return;
    }
    summary.textContent = "TST selected week · " + selectedRoots.length + " roots · " + selectedCompetitorTermIds.size + " terms";
  }

  function syncCompetitorSelectionUi() {
    document.querySelectorAll("[data-competitor-root-id]").forEach(function(row) {
      var rid = row.getAttribute("data-competitor-root-id");
      var state = competitorRootSelectionState(rid);
      row.classList.toggle("selected", state.checked || state.partial);
      row.classList.toggle("partial", state.partial);
      var checkbox = row.querySelector("[data-competitor-root-checkbox]");
      if (checkbox) {
        checkbox.checked = state.checked;
        checkbox.indeterminate = state.partial;
      }
    });
    updateCompetitorSelectionSummary();
  }

  function setCompetitorRootSelection(clusterId, shouldSelect) {
    var ids = competitorRootTermIds(clusterId);
    if (shouldSelect) {
      selectedCompetitorRootIds.add(clusterId);
    } else {
      selectedCompetitorRootIds.delete(clusterId);
    }
    ids.forEach(function(termId) {
      if (shouldSelect) {
        selectedCompetitorTermIds.add(termId);
      } else {
        selectedCompetitorTermIds.delete(termId);
      }
    });
    hasInitializedCompetitorSelection = true;
    syncCompetitorSelectionUi();
    renderCompetitorPanel();
  }

  function selectAllCompetitorRoots() {
    selectedCompetitorRootIds = new Set(allRootIds());
    selectedCompetitorTermIds = new Set(allCompetitorRootTerms());
    hasInitializedCompetitorSelection = true;
    syncCompetitorSelectionUi();
    renderCompetitorPanel();
  }

  function clearAllCompetitorRoots() {
    selectedCompetitorRootIds = new Set();
    selectedCompetitorTermIds = new Set();
    hasInitializedCompetitorSelection = true;
    syncCompetitorSelectionUi();
    renderCompetitorPanel();
  }

  function initCompetitorSelectionControls() {
    var selectAllBtn = document.getElementById("competitor-select-all");
    var clearAllBtn = document.getElementById("competitor-clear-all");
    if (!selectAllBtn || !clearAllBtn) {
      return;
    }
    selectAllBtn.addEventListener("click", function() {
      selectAllCompetitorRoots();
    });
    clearAllBtn.addEventListener("click", function() {
      clearAllCompetitorRoots();
    });
  }

  function combineTstWindowCompare(rootIds, windowKey) {
    var combined = {
      coverage: {
        terms_total: 0,
        terms_covered: 0,
        weeks_present: 0,
        term_weeks_covered: 0,
        avg_click_pool_share: 0,
        avg_purchase_pool_share: 0
      },
      observed: {
        total_click_pool_share: 0,
        total_purchase_pool_share: 0,
        our_click_share_points: 0,
        our_purchase_share_points: 0,
        competitor_click_share_points: 0,
        competitor_purchase_share_points: 0,
        other_click_share_points: 0,
        other_purchase_share_points: 0,
        our_click_share: 0,
        our_purchase_share: 0,
        competitor_click_share: 0,
        competitor_purchase_share: 0,
        other_click_share: 0,
        other_purchase_share: 0,
        click_gap: 0,
        purchase_gap: 0
      },
      term_rows: []
    };
    var maxWeeksPresent = 0;
    rootIds.forEach(function(clusterId) {
      var cluster = clusterMap.get(clusterId);
      var compare = cluster.tstCompare[windowKey];
      combined.coverage.terms_total += compare.coverage.terms_total;
      combined.coverage.terms_covered += compare.coverage.terms_covered;
      combined.coverage.term_weeks_covered += compare.coverage.term_weeks_covered;
      if (compare.coverage.weeks_present > maxWeeksPresent) {
        maxWeeksPresent = compare.coverage.weeks_present;
      }
      combined.observed.total_click_pool_share += compare.observed.total_click_pool_share;
      combined.observed.total_purchase_pool_share += compare.observed.total_purchase_pool_share;
      combined.observed.our_click_share_points += compare.observed.our_click_share_points;
      combined.observed.our_purchase_share_points += compare.observed.our_purchase_share_points;
      combined.observed.competitor_click_share_points += compare.observed.competitor_click_share_points;
      combined.observed.competitor_purchase_share_points += compare.observed.competitor_purchase_share_points;
      combined.observed.other_click_share_points += compare.observed.other_click_share_points;
      combined.observed.other_purchase_share_points += compare.observed.other_purchase_share_points;
      compare.term_rows.forEach(function(row) {
        combined.term_rows.push(Object.assign({ root: cluster.cluster }, row));
      });
    });
    combined.coverage.weeks_present = maxWeeksPresent;
    combined.coverage.avg_click_pool_share = safeDiv(combined.observed.total_click_pool_share, combined.coverage.term_weeks_covered);
    combined.coverage.avg_purchase_pool_share = safeDiv(combined.observed.total_purchase_pool_share, combined.coverage.term_weeks_covered);
    combined.observed.our_click_share = safeDiv(combined.observed.our_click_share_points, combined.observed.total_click_pool_share);
    combined.observed.our_purchase_share = safeDiv(combined.observed.our_purchase_share_points, combined.observed.total_purchase_pool_share);
    combined.observed.competitor_click_share = safeDiv(combined.observed.competitor_click_share_points, combined.observed.total_click_pool_share);
    combined.observed.competitor_purchase_share = safeDiv(combined.observed.competitor_purchase_share_points, combined.observed.total_purchase_pool_share);
    combined.observed.other_click_share = safeDiv(combined.observed.other_click_share_points, combined.observed.total_click_pool_share);
    combined.observed.other_purchase_share = safeDiv(combined.observed.other_purchase_share_points, combined.observed.total_purchase_pool_share);
    combined.observed.click_gap = combined.observed.our_click_share - combined.observed.competitor_click_share;
    combined.observed.purchase_gap = combined.observed.our_purchase_share - combined.observed.competitor_purchase_share;
    combined.term_rows.sort(function(a, b) {
      if (b.avg_click_pool_share !== a.avg_click_pool_share) {
        return b.avg_click_pool_share - a.avg_click_pool_share;
      }
      if (b.avg_purchase_pool_share !== a.avg_purchase_pool_share) {
        return b.avg_purchase_pool_share - a.avg_purchase_pool_share;
      }
      return a.search_frequency_rank - b.search_frequency_rank;
    });
    return combined;
  }

  function filterTstCompareByTermIds(compare, rootLabels, selectedIds) {
    var filtered = {
      source: compare.source,
      method: compare.method,
      coverage: {
        terms_total: compare.coverage.terms_total,
        terms_covered: 0,
        weeks_present: compare.coverage.weeks_present,
        term_weeks_covered: 0,
        avg_click_pool_share: 0,
        avg_purchase_pool_share: 0
      },
      observed: {
        total_click_pool_share: 0,
        total_purchase_pool_share: 0,
        our_click_share_points: 0,
        our_purchase_share_points: 0,
        competitor_click_share_points: 0,
        competitor_purchase_share_points: 0,
        other_click_share_points: 0,
        other_purchase_share_points: 0,
        our_click_share: 0,
        our_purchase_share: 0,
        competitor_click_share: 0,
        competitor_purchase_share: 0,
        other_click_share: 0,
        other_purchase_share: 0,
        click_gap: 0,
        purchase_gap: 0
      },
      term_rows: []
    };

    compare.term_rows.forEach(function(row) {
      var rowRoot = row.root != null ? row.root : rootLabels[0];
      var termId = competitorTermKey(rowRoot, row.term);
      if (!selectedIds.has(termId)) {
        return;
      }
      var weeksPresent = row.weeks_present;
      var ourClickPoints = row.our_click_share * weeksPresent;
      var ourPurchasePoints = row.our_purchase_share * weeksPresent;
      var competitorClickPoints = row.competitor_click_share * weeksPresent;
      var competitorPurchasePoints = row.competitor_purchase_share * weeksPresent;
      filtered.coverage.terms_covered += 1;
      filtered.coverage.term_weeks_covered += weeksPresent;
      filtered.observed.total_click_pool_share += row.click_pool_share;
      filtered.observed.total_purchase_pool_share += row.purchase_pool_share;
      filtered.observed.our_click_share_points += ourClickPoints;
      filtered.observed.our_purchase_share_points += ourPurchasePoints;
      filtered.observed.competitor_click_share_points += competitorClickPoints;
      filtered.observed.competitor_purchase_share_points += competitorPurchasePoints;
      filtered.term_rows.push(Object.assign({}, row, { root: rowRoot, termId: termId }));
    });

    filtered.coverage.avg_click_pool_share = safeDiv(filtered.observed.total_click_pool_share, filtered.coverage.term_weeks_covered);
    filtered.coverage.avg_purchase_pool_share = safeDiv(filtered.observed.total_purchase_pool_share, filtered.coverage.term_weeks_covered);
    filtered.observed.other_click_share_points = Math.max(filtered.observed.total_click_pool_share - filtered.observed.our_click_share_points - filtered.observed.competitor_click_share_points, 0);
    filtered.observed.other_purchase_share_points = Math.max(filtered.observed.total_purchase_pool_share - filtered.observed.our_purchase_share_points - filtered.observed.competitor_purchase_share_points, 0);
    filtered.observed.our_click_share = safeDiv(filtered.observed.our_click_share_points, filtered.observed.total_click_pool_share);
    filtered.observed.our_purchase_share = safeDiv(filtered.observed.our_purchase_share_points, filtered.observed.total_purchase_pool_share);
    filtered.observed.competitor_click_share = safeDiv(filtered.observed.competitor_click_share_points, filtered.observed.total_click_pool_share);
    filtered.observed.competitor_purchase_share = safeDiv(filtered.observed.competitor_purchase_share_points, filtered.observed.total_purchase_pool_share);
    filtered.observed.other_click_share = safeDiv(filtered.observed.other_click_share_points, filtered.observed.total_click_pool_share);
    filtered.observed.other_purchase_share = safeDiv(filtered.observed.other_purchase_share_points, filtered.observed.total_purchase_pool_share);
    filtered.observed.click_gap = filtered.observed.our_click_share - filtered.observed.competitor_click_share;
    filtered.observed.purchase_gap = filtered.observed.our_purchase_share - filtered.observed.competitor_purchase_share;
    filtered.term_rows.sort(function(a, b) {
      if (b.avg_click_pool_share !== a.avg_click_pool_share) {
        return b.avg_click_pool_share - a.avg_click_pool_share;
      }
      if (b.avg_purchase_pool_share !== a.avg_purchase_pool_share) {
        return b.avg_purchase_pool_share - a.avg_purchase_pool_share;
      }
      return a.search_frequency_rank - b.search_frequency_rank;
    });
    return filtered;
  }

  function combineTstWeeklySeries(rootIds) {
    var weekMap = new Map();
    activeData.meta.baselineWindow.forEach(function(weekLabel) {
      weekMap.set(weekLabel, {
        week_label: weekLabel,
        coverage: {
          terms_total: 0,
          terms_covered: 0,
          weeks_present: 0,
          term_weeks_covered: 0,
          avg_click_pool_share: 0,
          avg_purchase_pool_share: 0
        },
        observed: {
          total_click_pool_share: 0,
          total_purchase_pool_share: 0,
          our_click_share_points: 0,
          our_purchase_share_points: 0,
          competitor_click_share_points: 0,
          competitor_purchase_share_points: 0,
          other_click_share_points: 0,
          other_purchase_share_points: 0,
          our_click_share: 0,
          our_purchase_share: 0,
          competitor_click_share: 0,
          competitor_purchase_share: 0,
          other_click_share: 0,
          other_purchase_share: 0,
          click_gap: 0,
          purchase_gap: 0
        },
        term_rows: []
      });
    });

    rootIds.forEach(function(clusterId) {
      var cluster = clusterMap.get(clusterId);
      cluster.tstCompare.weekly.forEach(function(weekCompare) {
        var combined = weekMap.get(weekCompare.week_label);
        combined.coverage.terms_total += weekCompare.coverage.terms_total;
        combined.coverage.terms_covered += weekCompare.coverage.terms_covered;
        combined.coverage.term_weeks_covered += weekCompare.coverage.term_weeks_covered;
        if (weekCompare.coverage.weeks_present > combined.coverage.weeks_present) {
          combined.coverage.weeks_present = weekCompare.coverage.weeks_present;
        }
        combined.observed.total_click_pool_share += weekCompare.observed.total_click_pool_share;
        combined.observed.total_purchase_pool_share += weekCompare.observed.total_purchase_pool_share;
        combined.observed.our_click_share_points += weekCompare.observed.our_click_share_points;
        combined.observed.our_purchase_share_points += weekCompare.observed.our_purchase_share_points;
        combined.observed.competitor_click_share_points += weekCompare.observed.competitor_click_share_points;
        combined.observed.competitor_purchase_share_points += weekCompare.observed.competitor_purchase_share_points;
        combined.observed.other_click_share_points += weekCompare.observed.other_click_share_points;
        combined.observed.other_purchase_share_points += weekCompare.observed.other_purchase_share_points;
        weekCompare.term_rows.forEach(function(row) {
          combined.term_rows.push(Object.assign({ root: cluster.cluster }, row));
        });
      });
    });

    return activeData.meta.baselineWindow.map(function(weekLabel) {
      var combined = weekMap.get(weekLabel);
      combined.coverage.avg_click_pool_share = safeDiv(combined.observed.total_click_pool_share, combined.coverage.term_weeks_covered);
      combined.coverage.avg_purchase_pool_share = safeDiv(combined.observed.total_purchase_pool_share, combined.coverage.term_weeks_covered);
      combined.observed.our_click_share = safeDiv(combined.observed.our_click_share_points, combined.observed.total_click_pool_share);
      combined.observed.our_purchase_share = safeDiv(combined.observed.our_purchase_share_points, combined.observed.total_purchase_pool_share);
      combined.observed.competitor_click_share = safeDiv(combined.observed.competitor_click_share_points, combined.observed.total_click_pool_share);
      combined.observed.competitor_purchase_share = safeDiv(combined.observed.competitor_purchase_share_points, combined.observed.total_purchase_pool_share);
      combined.observed.other_click_share = safeDiv(combined.observed.other_click_share_points, combined.observed.total_click_pool_share);
      combined.observed.other_purchase_share = safeDiv(combined.observed.other_purchase_share_points, combined.observed.total_purchase_pool_share);
      combined.observed.click_gap = combined.observed.our_click_share - combined.observed.competitor_click_share;
      combined.observed.purchase_gap = combined.observed.our_purchase_share - combined.observed.competitor_purchase_share;
      combined.term_rows.sort(function(a, b) {
        if (b.avg_click_pool_share !== a.avg_click_pool_share) {
          return b.avg_click_pool_share - a.avg_click_pool_share;
        }
        if (b.avg_purchase_pool_share !== a.avg_purchase_pool_share) {
          return b.avg_purchase_pool_share - a.avg_purchase_pool_share;
        }
        return a.search_frequency_rank - b.search_frequency_rank;
      });
      return combined;
    });
  }

  function filterTstWeeklySeriesByTermIds(weeklySeries, rootLabels, selectedIds) {
    return weeklySeries.map(function(weekCompare) {
      var filtered = filterTstCompareByTermIds(weekCompare, rootLabels, selectedIds);
      filtered.week_label = weekCompare.week_label;
      filtered.week_number = weekCompare.week_number;
      filtered.start_date = weekCompare.start_date;
      return filtered;
    });
  }

  function activeCompetitorSelection() {
    var rootIds = selectedCompetitorRootIdsList();
    if (!rootIds.length) {
      return {
        rootIds: [],
        rootLabels: [],
        weekly: [],
        current: null,
        competitor: null,
        scopeType: "empty",
        allTermIds: [],
        selectedTermIds: []
      };
    }
    if (rootIds.length === 1) {
      var cluster = clusterMap.get(rootIds[0]);
      var allTermIds = competitorRootTermIds(rootIds[0]);
      var selectedIds = competitorSelectedTermsForRoot(rootIds[0]);
      if (!selectedIds.length) {
        return {
          rootIds: rootIds,
          rootLabels: [cluster.cluster],
          weekly: cluster.tstCompare.weekly,
          current: selectedWeekTstCompare(cluster.tstCompare.weekly),
          competitor: cluster.tstCompare.competitor,
          scopeType: "no-terms",
          allTermIds: allTermIds,
          selectedTermIds: selectedIds
        };
      }
      var fullSelection = selectedIds.length === allTermIds.length;
      var weeklySeries = cluster.tstCompare.weekly;
      if (!fullSelection) {
        weeklySeries = filterTstWeeklySeriesByTermIds(cluster.tstCompare.weekly, [cluster.cluster], new Set(selectedIds));
      }
      return {
        rootIds: rootIds,
        rootLabels: [cluster.cluster],
        weekly: weeklySeries,
        current: selectedWeekTstCompare(weeklySeries),
        competitor: cluster.tstCompare.competitor,
        scopeType: fullSelection ? "root" : (selectedIds.length === 1 ? "term" : "multi-term"),
        allTermIds: allTermIds,
        selectedTermIds: selectedIds
      };
    }
    var allTermIdsMulti = [];
    rootIds.forEach(function(clusterId) {
      competitorRootTermIds(clusterId).forEach(function(termId) {
        allTermIdsMulti.push(termId);
      });
    });
    var selectedIdsMulti = allTermIdsMulti.filter(function(termId) {
      return selectedCompetitorTermIds.has(termId);
    });
    if (!selectedIdsMulti.length) {
      var weeklyNoTerms = combineTstWeeklySeries(rootIds);
      return {
        rootIds: rootIds,
        rootLabels: rootIds.map(function(clusterId) {
          return clusterMap.get(clusterId).cluster;
        }),
        weekly: weeklyNoTerms,
        current: selectedWeekTstCompare(weeklyNoTerms),
        competitor: activeData.clusters[0].tstCompare.competitor,
        scopeType: "no-terms",
        allTermIds: allTermIdsMulti,
        selectedTermIds: selectedIdsMulti
      };
    }
    var weeklyCombined = combineTstWeeklySeries(rootIds);
    var fullMultiSelection = selectedIdsMulti.length === allTermIdsMulti.length;
    var rootLabels = rootIds.map(function(clusterId) {
      return clusterMap.get(clusterId).cluster;
    });
    var weeklySelection = weeklyCombined;
    if (!fullMultiSelection) {
      weeklySelection = filterTstWeeklySeriesByTermIds(weeklyCombined, rootLabels, new Set(selectedIdsMulti));
    }
    return {
      rootIds: rootIds,
      rootLabels: rootLabels,
      weekly: weeklySelection,
      current: selectedWeekTstCompare(weeklySelection),
      competitor: activeData.clusters[0].tstCompare.competitor,
      scopeType: fullMultiSelection ? "multi-root" : "multi-root-term",
      allTermIds: allTermIdsMulti,
      selectedTermIds: selectedIdsMulti
    };
  }

  function emptySqpMetrics() {
    return {
      query_volume: 0,
      market_impressions: 0,
      asin_impressions: 0,
      market_clicks: 0,
      asin_clicks: 0,
      market_cart_adds: 0,
      asin_cart_adds: 0,
      market_purchases: 0,
      asin_purchases: 0,
      rank_weight: 0,
      rank_sum: 0,
      rank_span_sum: 0,
      rank_term_count: 0,
      rank_weeks: 0,
      weeks_sqp: 0
    };
  }

  function finalizeSqpMetrics(metrics) {
    metrics.market_ctr = safeDiv(metrics.market_clicks, metrics.market_impressions);
    metrics.market_cvr = safeDiv(metrics.market_purchases, metrics.market_clicks);
    metrics.asin_ctr = safeDiv(metrics.asin_clicks, metrics.asin_impressions);
    metrics.asin_cvr = safeDiv(metrics.asin_purchases, metrics.asin_clicks);
    metrics.impression_share = safeDiv(metrics.asin_impressions, metrics.market_impressions);
    metrics.click_share = safeDiv(metrics.asin_clicks, metrics.market_clicks);
    metrics.cart_add_share = safeDiv(metrics.asin_cart_adds, metrics.market_cart_adds);
    metrics.purchase_share = safeDiv(metrics.asin_purchases, metrics.market_purchases);
    metrics.cart_add_rate = safeDiv(metrics.market_cart_adds, metrics.market_clicks);
    metrics.asin_cart_add_rate = safeDiv(metrics.asin_cart_adds, metrics.asin_clicks);
    metrics.avg_rank = metrics.rank_weight > 0 ? metrics.rank_sum / metrics.rank_weight : null;
    metrics.rank_volatility = metrics.rank_term_count > 0 ? metrics.rank_span_sum / metrics.rank_term_count : null;
    return metrics;
  }

  function aggregateSelectedTermMetrics(termIds) {
    var metrics = emptySqpMetrics();

    termIds.forEach(function(termId) {
      var term = termMap.get(termId);
      if (!term) {
        return;
      }
      var current = term.observed.current_week;
      metrics.query_volume += current.query_volume;
      metrics.market_impressions += current.market_impressions;
      metrics.asin_impressions += current.asin_impressions;
      metrics.market_clicks += current.market_clicks;
      metrics.asin_clicks += current.asin_clicks;
      metrics.market_cart_adds += current.market_cart_adds;
      metrics.asin_cart_adds += current.asin_cart_adds;
      metrics.market_purchases += current.market_purchases;
      metrics.asin_purchases += current.asin_purchases;
      metrics.rank_weight += current.rank_weight;
      metrics.rank_sum += current.rank_sum;
      metrics.rank_span_sum += current.rank_span_sum;
      metrics.rank_term_count += current.rank_term_count;
      if (current.rank_weeks > metrics.rank_weeks) {
        metrics.rank_weeks = current.rank_weeks;
      }
      if (current.query_volume > 0 && metrics.weeks_sqp < 1) {
        metrics.weeks_sqp = 1;
      }
    });

    return finalizeSqpMetrics(metrics);
  }

  function aggregateSelectedRootMetrics(rootIds) {
    var metrics = emptySqpMetrics();

    rootIds.forEach(function(rootId) {
      var cluster = clusterMap.get(rootId);
      if (!cluster) {
        return;
      }
      metrics.query_volume += cluster.query_volume;
      metrics.market_impressions += cluster.market_impressions;
      metrics.asin_impressions += cluster.asin_impressions;
      metrics.market_clicks += cluster.market_clicks;
      metrics.asin_clicks += cluster.asin_clicks;
      metrics.market_cart_adds += cluster.market_cart_adds;
      metrics.asin_cart_adds += cluster.asin_cart_adds;
      metrics.market_purchases += cluster.market_purchases;
      metrics.asin_purchases += cluster.asin_purchases;
      metrics.rank_weight += cluster.rank_weight;
      metrics.rank_sum += cluster.rank_sum;
      metrics.rank_span_sum += cluster.rank_span_sum;
      metrics.rank_term_count += cluster.rank_term_count;
      if (cluster.rank_weeks > metrics.rank_weeks) {
        metrics.rank_weeks = cluster.rank_weeks;
      }
      if (cluster.query_volume > 0 && metrics.weeks_sqp < 1) {
        metrics.weeks_sqp = 1;
      }
    });

    return finalizeSqpMetrics(metrics);
  }

  function aggregateSelectedTermWeeklyMetrics(termIds) {
    if (!termIds.length) {
      return [];
    }
    var weekMap = new Map();
    activeData.meta.baselineWindow.forEach(function(weekLabel) {
      weekMap.set(weekLabel, {
        week_label: weekLabel,
        week_number: Number.parseInt(weekLabel.replace("W", ""), 10),
        start_date: reportData.weekStartDates[weekLabel],
        metrics: emptySqpMetrics()
      });
    });

    termIds.forEach(function(termId) {
      var term = termMap.get(termId);
      if (!term) {
        return;
      }
      term.weekly.forEach(function(week) {
        var bucket = weekMap.get(week.week_label);
        if (!bucket) {
          return;
        }
        var metrics = bucket.metrics;
        metrics.query_volume += week.query_volume;
        metrics.market_impressions += week.market_impressions;
        metrics.asin_impressions += week.asin_impressions;
        metrics.market_clicks += week.market_clicks;
        metrics.asin_clicks += week.asin_clicks;
        metrics.market_cart_adds += week.market_cart_adds;
        metrics.asin_cart_adds += week.asin_cart_adds;
        metrics.market_purchases += week.market_purchases;
        metrics.asin_purchases += week.asin_purchases;
        metrics.rank_weight += week.rank_weight;
        metrics.rank_sum += week.rank_sum;
        metrics.rank_span_sum += week.rank_span_sum;
        metrics.rank_term_count += week.rank_term_count;
        if (week.rank_weeks > metrics.rank_weeks) {
          metrics.rank_weeks = week.rank_weeks;
        }
        if (week.query_volume > 0 && metrics.weeks_sqp < 1) {
          metrics.weeks_sqp = 1;
        }
      });
    });

    return activeData.meta.baselineWindow.map(function(weekLabel) {
      var bucket = weekMap.get(weekLabel);
      var finalized = finalizeSqpMetrics(bucket.metrics);
      var record = {
        week_label: bucket.week_label,
        week_number: bucket.week_number,
        start_date: bucket.start_date
      };
      Object.keys(finalized).forEach(function(key) {
        record[key] = finalized[key];
      });
      return record;
    });
  }

  function aggregateSelectedRootWeeklyMetrics(rootIds) {
    var termIds = [];
    rootIds.forEach(function(rootId) {
      rootTermIds(rootId).forEach(function(termId) {
        termIds.push(termId);
      });
    });
    return aggregateSelectedTermWeeklyMetrics(termIds);
  }

  function activeSqpSelection() {
    var rootIds = selectedRootIdsList();
    if (!rootIds.length) {
      return {
        cluster: null,
        allIds: [],
        selectedIds: [],
        isAllSelected: false,
        singleTerm: null,
        metrics: null,
        weekly: [],
        scopeType: "empty",
        rootIds: [],
        rootLabels: []
      };
    }

    if (rootIds.length === 1) {
      var clusterId = rootIds[0];
      var cluster = clusterMap.get(clusterId);
      var allIds = rootTermIds(clusterId);
      var selectedIds = selectedTermsForRoot(clusterId);
      var isAllSelected = allIds.length > 0 && selectedIds.length === allIds.length;
      var singleTerm = selectedIds.length === 1 ? termMap.get(selectedIds[0]) : null;
      var metrics = cluster;
      var weekly = aggregateSelectedRootWeeklyMetrics(rootIds);
      var scopeType = "root";

      if (selectedIds.length === 0) {
        metrics = cluster;
        weekly = aggregateSelectedRootWeeklyMetrics(rootIds);
        scopeType = "no-terms";
      } else if (!isAllSelected) {
        metrics = aggregateSelectedTermMetrics(selectedIds);
        weekly = aggregateSelectedTermWeeklyMetrics(selectedIds);
        scopeType = singleTerm !== null ? "term" : "multi";
      }

      return {
        cluster: cluster,
        allIds: allIds,
        selectedIds: selectedIds,
        isAllSelected: isAllSelected,
        singleTerm: singleTerm,
        metrics: metrics,
        weekly: weekly,
        scopeType: scopeType,
        rootIds: rootIds,
        rootLabels: [cluster.cluster]
      };
    }

    var selectedIdsAll = [];
    rootIds.forEach(function(clusterId) {
      selectedTermsForRoot(clusterId).forEach(function(termId) {
        selectedIdsAll.push(termId);
      });
    });
    var allIdsAll = [];
    rootIds.forEach(function(clusterId) {
      rootTermIds(clusterId).forEach(function(termId) {
        allIdsAll.push(termId);
      });
    });

    var metricsAll = null;
    var scopeTypeAll = "no-terms";
    if (selectedIdsAll.length > 0) {
      metricsAll = aggregateSelectedTermMetrics(selectedIdsAll);
      scopeTypeAll = "multi-root";
    } else {
      metricsAll = aggregateSelectedRootMetrics(rootIds);
    }

    return {
      cluster: null,
      allIds: allIdsAll,
      selectedIds: selectedIdsAll,
      isAllSelected: selectedIdsAll.length === allIdsAll.length,
      singleTerm: null,
      metrics: metricsAll,
      weekly: selectedIdsAll.length > 0 ? aggregateSelectedTermWeeklyMetrics(selectedIdsAll) : aggregateSelectedRootWeeklyMetrics(rootIds),
      scopeType: scopeTypeAll,
      rootIds: rootIds,
      rootLabels: rootIds.map(function(clusterId) {
        return clusterMap.get(clusterId).cluster;
      })
    };
  }

  function allScpAsinIds() {
    return activeData.scp.asins.map(function(row) {
      return row.id;
    });
  }

  function emptyScpMetrics() {
    return {
      impressions: 0,
      clicks: 0,
      cart_adds: 0,
      purchases: 0,
      sales: 0,
      ctr: 0,
      atc_rate: 0,
      purchase_rate: 0,
      cvr: 0,
      asin_count: 0
    };
  }

  function finalizeScpMetrics(metrics) {
    metrics.ctr = safeDiv(metrics.clicks, metrics.impressions);
    metrics.atc_rate = safeDiv(metrics.cart_adds, metrics.clicks);
    metrics.purchase_rate = safeDiv(metrics.purchases, metrics.cart_adds);
    metrics.cvr = safeDiv(metrics.purchases, metrics.clicks);
    return metrics;
  }

  function aggregateSelectedScpMetrics(asinIds) {
    var metrics = emptyScpMetrics();
    asinIds.forEach(function(asinId) {
      var row = scpAsinMap.get(asinId);
      if (!row) {
        return;
      }
      var current = row.current_week;
      metrics.impressions += current.impressions;
      metrics.clicks += current.clicks;
      metrics.cart_adds += current.cart_adds;
      metrics.purchases += current.purchases;
      metrics.sales += current.sales;
      if (current.impressions > 0 || current.clicks > 0 || current.cart_adds > 0 || current.purchases > 0 || current.sales > 0) {
        metrics.asin_count += 1;
      }
    });
    return finalizeScpMetrics(metrics);
  }

  function aggregateSelectedScpWeekly(asinIds) {
    var weekMap = new Map();
    activeData.meta.baselineWindow.forEach(function(weekLabel) {
      weekMap.set(weekLabel, {
        week_label: weekLabel,
        week_number: Number.parseInt(weekLabel.replace("W", ""), 10),
        start_date: reportData.weekStartDates[weekLabel],
        metrics: emptyScpMetrics()
      });
    });

    asinIds.forEach(function(asinId) {
      var row = scpAsinMap.get(asinId);
      if (!row) {
        return;
      }
      row.weekly.forEach(function(week) {
        var bucket = weekMap.get(week.week_label);
        if (!bucket) {
          return;
        }
        bucket.metrics.impressions += week.impressions;
        bucket.metrics.clicks += week.clicks;
        bucket.metrics.cart_adds += week.cart_adds;
        bucket.metrics.purchases += week.purchases;
        bucket.metrics.sales += week.sales;
        if (week.impressions > 0 || week.clicks > 0 || week.cart_adds > 0 || week.purchases > 0 || week.sales > 0) {
          bucket.metrics.asin_count += 1;
        }
      });
    });

    return activeData.meta.baselineWindow.map(function(weekLabel) {
      var bucket = weekMap.get(weekLabel);
      var finalized = finalizeScpMetrics(bucket.metrics);
      return {
        week_label: bucket.week_label,
        week_number: bucket.week_number,
        start_date: bucket.start_date,
        impressions: finalized.impressions,
        clicks: finalized.clicks,
        cart_adds: finalized.cart_adds,
        purchases: finalized.purchases,
        sales: finalized.sales,
        ctr: finalized.ctr,
        atc_rate: finalized.atc_rate,
        purchase_rate: finalized.purchase_rate,
        cvr: finalized.cvr,
        asin_count: finalized.asin_count
      };
    });
  }

  function setAllScpAsinSelection(shouldSelect) {
    if (shouldSelect) {
      selectedScpAsinIds = new Set(allScpAsinIds());
    } else {
      selectedScpAsinIds = new Set();
    }
    hasInitializedScpSelection = true;
    renderScpPanel();
  }

  function toggleScpAsinSelection(asinId) {
    if (selectedScpAsinIds.has(asinId)) {
      selectedScpAsinIds.delete(asinId);
    } else {
      selectedScpAsinIds.add(asinId);
    }
    hasInitializedScpSelection = true;
    renderScpPanel();
  }

  function activeScpSelection() {
    var allIds = allScpAsinIds();
    var selectedIds = allIds.filter(function(asinId) {
      return selectedScpAsinIds.has(asinId);
    });
    if (!allIds.length) {
      return {
        allIds: [],
        selectedIds: [],
        isAllSelected: false,
        metrics: null,
        weekly: [],
        current: null,
        scopeType: "unavailable"
      };
    }
    if (!selectedIds.length) {
      return {
        allIds: allIds,
        selectedIds: [],
        isAllSelected: false,
        metrics: null,
        weekly: [],
        current: null,
        scopeType: "empty"
      };
    }
    if (selectedIds.length === allIds.length) {
      return {
        allIds: allIds,
        selectedIds: selectedIds,
        isAllSelected: true,
        metrics: activeData.scp.current_week,
        weekly: activeData.scp.weekly,
        current: selectedWeekScpMetrics(activeData.scp.weekly),
        scopeType: "all"
      };
    }
    var selectedWeekly = aggregateSelectedScpWeekly(selectedIds);
    return {
      allIds: allIds,
      selectedIds: selectedIds,
      isAllSelected: false,
      metrics: aggregateSelectedScpMetrics(selectedIds),
      weekly: selectedWeekly,
      current: selectedWeekScpMetrics(selectedWeekly),
      scopeType: selectedIds.length === 1 ? "asin" : "multi-asin"
    };
  }

  function allBrAsinIds() {
    return activeData.businessReports.asins.map(function(row) {
      return row.id;
    });
  }

  function emptyBusinessMetrics() {
    return {
      sessions: 0,
      page_views: 0,
      order_items: 0,
      units_ordered: 0,
      sales: 0,
      buy_box_page_views_weighted: 0,
      order_item_session_percentage: 0,
      unit_session_percentage: 0,
      buy_box_percentage: 0,
      asin_count: 0
    };
  }

  function finalizeBusinessMetrics(metrics) {
    metrics.order_item_session_percentage = safeDiv(metrics.order_items, metrics.sessions);
    metrics.unit_session_percentage = safeDiv(metrics.units_ordered, metrics.sessions);
    metrics.buy_box_percentage = safeDiv(metrics.buy_box_page_views_weighted, metrics.page_views);
    return metrics;
  }

  function aggregateSelectedBusinessMetrics(asinIds) {
    var metrics = emptyBusinessMetrics();
    asinIds.forEach(function(asinId) {
      var row = brAsinMap.get(asinId);
      if (!row) {
        return;
      }
      var current = row.current_week;
      metrics.sessions += current.sessions;
      metrics.page_views += current.page_views;
      metrics.order_items += current.order_items;
      metrics.units_ordered += current.units_ordered;
      metrics.sales += current.sales;
      metrics.buy_box_page_views_weighted += current.buy_box_percentage * current.page_views;
      if (current.sessions > 0 || current.order_items > 0 || current.units_ordered > 0 || current.sales > 0) {
        metrics.asin_count += 1;
      }
    });
    return finalizeBusinessMetrics(metrics);
  }

  function aggregateSelectedBusinessWeekly(asinIds) {
    var weekMap = new Map();
    activeData.businessReports.weekly.forEach(function(week) {
      weekMap.set(week.week_label, {
        week_label: week.week_label,
        week_number: week.week_number,
        start_date: week.start_date,
        metrics: emptyBusinessMetrics()
      });
    });

    asinIds.forEach(function(asinId) {
      var row = brAsinMap.get(asinId);
      if (!row) {
        return;
      }
      row.weekly.forEach(function(week) {
        var bucket = weekMap.get(week.week_label);
        if (!bucket) {
          return;
        }
        bucket.metrics.sessions += week.sessions;
        bucket.metrics.page_views += week.page_views;
        bucket.metrics.order_items += week.order_items;
        bucket.metrics.units_ordered += week.units_ordered;
        bucket.metrics.sales += week.sales;
        bucket.metrics.buy_box_page_views_weighted += week.buy_box_percentage * week.page_views;
        if (week.sessions > 0 || week.order_items > 0 || week.units_ordered > 0 || week.sales > 0) {
          bucket.metrics.asin_count += 1;
        }
      });
    });

    return activeData.businessReports.weekly.map(function(week) {
      var bucket = weekMap.get(week.week_label);
      var finalized = finalizeBusinessMetrics(bucket.metrics);
      return {
        week_label: bucket.week_label,
        week_number: bucket.week_number,
        start_date: bucket.start_date,
        sessions: finalized.sessions,
        page_views: finalized.page_views,
        order_items: finalized.order_items,
        units_ordered: finalized.units_ordered,
        sales: finalized.sales,
        order_item_session_percentage: finalized.order_item_session_percentage,
        unit_session_percentage: finalized.unit_session_percentage,
        buy_box_percentage: finalized.buy_box_percentage,
        asin_count: finalized.asin_count
      };
    });
  }

  function setAllBrAsinSelection(shouldSelect) {
    if (shouldSelect) {
      selectedBrAsinIds = new Set(allBrAsinIds());
    } else {
      selectedBrAsinIds = new Set();
    }
    hasInitializedBrSelection = true;
    renderBusinessReportsPanel();
  }

  function toggleBrAsinSelection(asinId) {
    if (selectedBrAsinIds.has(asinId)) {
      selectedBrAsinIds.delete(asinId);
    } else {
      selectedBrAsinIds.add(asinId);
    }
    hasInitializedBrSelection = true;
    renderBusinessReportsPanel();
  }

  function activeBusinessSelection() {
    var allIds = allBrAsinIds();
    var selectedIds = allIds.filter(function(asinId) {
      return selectedBrAsinIds.has(asinId);
    });
    if (!allIds.length) {
      return {
        allIds: [],
        selectedIds: [],
        isAllSelected: false,
        weekly: [],
        current: null,
        scopeType: "unavailable"
      };
    }
    if (!selectedIds.length) {
      return {
        allIds: allIds,
        selectedIds: [],
        isAllSelected: false,
        weekly: [],
        current: null,
        scopeType: "empty"
      };
    }
    if (selectedIds.length === allIds.length) {
      return {
        allIds: allIds,
        selectedIds: selectedIds,
        isAllSelected: true,
        weekly: activeData.businessReports.weekly,
        current: selectedWeekBusinessMetrics(activeData.businessReports.weekly),
        scopeType: "all"
      };
    }
    var selectedWeekly = aggregateSelectedBusinessWeekly(selectedIds);
    return {
      allIds: allIds,
      selectedIds: selectedIds,
      isAllSelected: false,
      weekly: selectedWeekly,
      current: selectedWeekBusinessMetrics(selectedWeekly),
      scopeType: selectedIds.length === 1 ? "asin" : "multi-asin"
    };
  }

  function selectedWeekRecord(series) {
    if (!series) {
      return null;
    }
    for (var index = 0; index < series.length; index += 1) {
      if (series[index].week_label === selectedWeekLabel) {
        return series[index];
      }
    }
    return null;
  }

  function selectedWeekSqpMetrics(series) {
    var record = selectedWeekRecord(series);
    if (record) {
      return record;
    }
    return finalizeSqpMetrics(emptySqpMetrics());
  }

  function selectedWeekScpMetrics(series) {
    var record = selectedWeekRecord(series);
    if (record) {
      return record;
    }
    return finalizeScpMetrics(emptyScpMetrics());
  }

  function selectedWeekBusinessMetrics(series) {
    var record = selectedWeekRecord(series);
    if (record) {
      return record;
    }
    return finalizeBusinessMetrics(emptyBusinessMetrics());
  }

  function selectedWeekTstCompare(series) {
    var record = selectedWeekRecord(series);
    if (record) {
      return record;
    }
    return {
      source: "TST",
      method: "observed_top_clicked_asin_pool",
      coverage: {
        terms_total: 0,
        terms_covered: 0,
        weeks_present: 0,
        term_weeks_covered: 0,
        avg_click_pool_share: 0,
        avg_purchase_pool_share: 0
      },
      observed: {
        total_click_pool_share: 0,
        total_purchase_pool_share: 0,
        our_click_share_points: 0,
        our_purchase_share_points: 0,
        competitor_click_share_points: 0,
        competitor_purchase_share_points: 0,
        other_click_share_points: 0,
        other_purchase_share_points: 0,
        our_click_share: 0,
        our_purchase_share: 0,
        competitor_click_share: 0,
        competitor_purchase_share: 0,
        other_click_share: 0,
        other_purchase_share: 0,
        click_gap: 0,
        purchase_gap: 0
      },
      term_rows: [],
      top_terms: []
    };
  }

  function funnelConnectors(metrics) {
    return [
      {
        label: "CTR",
        mktRate: fmtPct(metrics.market_ctr),
        asinRate: fmtPct(metrics.asin_ctr),
        asinBetter: metrics.asin_ctr > metrics.market_ctr,
      },
      {
        label: "ATC Rate",
        mktRate: fmtPct(metrics.cart_add_rate),
        asinRate: fmtPct(metrics.asin_cart_add_rate),
        asinBetter: metrics.asin_cart_add_rate > metrics.cart_add_rate,
      },
      {
        label: "Purch Rate",
        mktRate: fmtPct(metrics.market_cart_adds > 0 ? metrics.market_purchases / metrics.market_cart_adds : 0),
        asinRate: fmtPct(metrics.asin_cart_adds > 0 ? metrics.asin_purchases / metrics.asin_cart_adds : 0),
        asinBetter: (metrics.asin_cart_adds > 0 ? metrics.asin_purchases / metrics.asin_cart_adds : 0) > (metrics.market_cart_adds > 0 ? metrics.market_purchases / metrics.market_cart_adds : 0),
        secondary: {
          label: "CVR",
          mktRate: fmtPct(metrics.market_cvr),
          asinRate: fmtPct(metrics.asin_cvr),
          asinBetter: metrics.asin_cvr > metrics.market_cvr
        }
      }
    ];
  }

  function sqpVisibleTerms(selection) {
    var seen = new Set();
    var rows = [];
    selection.rootIds.forEach(function(clusterId) {
      var cluster = clusterMap.get(clusterId);
      rootTermIds(clusterId).forEach(function(termId) {
        if (seen.has(termId)) {
          return;
        }
        seen.add(termId);
        var term = termMap.get(termId);
        if (!term) {
          return;
        }
        rows.push({
          id: term.id,
          term: term.term,
          root: cluster.cluster,
          query_volume: term.selection_volume_selected_week,
          market_impressions: term.market_impressions,
          asin_impressions: term.asin_impressions,
          impression_share: term.impression_share,
          market_ctr: term.market_ctr,
          asin_ctr: term.asin_ctr,
          market_clicks: term.market_clicks,
          asin_clicks: term.asin_clicks,
          click_share: term.click_share,
          cart_add_rate: term.observed.current_week.cart_add_rate,
          asin_cart_add_rate: term.asin_cart_add_rate,
          market_cart_adds: term.observed.current_week.market_cart_adds,
          asin_cart_adds: term.observed.current_week.asin_cart_adds,
          cart_add_share: term.cart_add_share,
          purchase_rate_mkt: term.observed.current_week.market_cart_adds > 0 ? term.observed.current_week.market_purchases / term.observed.current_week.market_cart_adds : 0,
          purchase_rate_our: term.observed.current_week.asin_cart_adds > 0 ? term.observed.current_week.asin_purchases / term.observed.current_week.asin_cart_adds : 0,
          market_cvr: term.market_cvr,
          asin_cvr: term.asin_cvr,
          market_purchases: term.market_purchases,
          asin_purchases: term.asin_purchases,
          purchase_share: term.purchase_share
        });
      });
    });
    rows.sort(function(a, b) {
      if (b.query_volume !== a.query_volume) {
        return b.query_volume - a.query_volume;
      }
      if (b.purchase_share !== a.purchase_share) {
        return b.purchase_share - a.purchase_share;
      }
      return a.term.localeCompare(b.term);
    });
    return rows;
  }

  function buildSqpTermsTableHtml(selection) {
    var headerColumns = [
      { key: "term", label: "Term" },
      { key: "query_volume", label: "Q Vol" },
      { key: "impression_share", label: "Impr %" },
      { key: "ctr_ratio", label: "CTR x" },
      { key: "atc_ratio", label: "ATC x" },
      { key: "purchase_rate_ratio", label: "PurchRt x" },
      { key: "cvr_ratio", label: "CVR x" }
    ];
    var html = '<div class="compare-block">';
    html += '<div class="compare-table-wrap"><table class="compare-table compare-table-select"><thead><tr><th class="check-col"><input type="checkbox" data-sqp-all-terms-checkbox' + (selection.isAllSelected && selection.allIds.length ? ' checked' : '') + '></th>';
    headerColumns.forEach(function(column) {
      html += '<th class="sortable" data-sqp-sort="' + column.key + '">' + column.label + sortIndicator(sqpTableSort, column.key) + '</th>';
    });
    html += '</tr></thead><tbody>';
    var families = {};
    var familyOrder = [];
    activeData.clusters.forEach(function(cluster) {
      if (!families[cluster.family]) {
        families[cluster.family] = [];
        familyOrder.push(cluster.family);
      }
      families[cluster.family].push(cluster);
    });
    familyOrder.forEach(function(family) {
      families[family].sort(function(a, b) {
        return compareSortValues(
          sqpSortValueForCluster(a, sqpTableSort.key),
          sqpSortValueForCluster(b, sqpTableSort.key),
          sqpTableSort.dir,
          sqpTableSort.key === "term" ? "text" : "number"
        );
      });
      html += '<tr class="group-family-row"><td colspan="' + (headerColumns.length + 1) + '">' + escapeHtml(family) + '</td></tr>';
      families[family].forEach(function(cluster) {
        var state = rootSelectionState(cluster.id);
        var rootClass = 'group-root-row root-row';
        var currentCluster = selectedWeekSqpMetrics(cluster.weekly);
        if (state.checked) {
          rootClass += ' selected';
        } else if (state.partial) {
          rootClass += ' partial';
        }
        var rootPurchRateMarket = safeDiv(currentCluster.market_purchases, currentCluster.market_cart_adds);
        var rootPurchRateOur = safeDiv(currentCluster.asin_purchases, currentCluster.asin_cart_adds);
        var rootCtrRatio = rateRatio(currentCluster.asin_ctr, currentCluster.market_ctr);
        var rootAtcRatio = rateRatio(currentCluster.asin_cart_add_rate, currentCluster.cart_add_rate);
        var rootPurchRateRatio = rateRatio(rootPurchRateOur, rootPurchRateMarket);
        var rootCvrRatio = rateRatio(currentCluster.asin_cvr, currentCluster.market_cvr);
        var expanded = expandedRootIds.has(cluster.id);
        html += '<tr class="' + rootClass + '" data-sqp-root-row="' + escapeHtml(cluster.id) + '" data-root-id="' + escapeHtml(cluster.id) + '" tabindex="0" role="button">' +
          '<td class="check-col"><input type="checkbox" data-sqp-root-checkbox="' + escapeHtml(cluster.id) + '"' + (state.checked ? ' checked' : '') + '></td>' +
          '<td><div class="group-root-cell">' +
          '<button class="group-toggle-btn' + (expanded ? ' expanded' : '') + '" type="button" data-sqp-root-toggle="' + escapeHtml(cluster.id) + '"><span class="group-chevron">▶</span></button>' +
          '<div class="group-name-stack"><div class="group-name-main">' + escapeHtml(cluster.cluster) + '</div><div class="group-name-meta">' + state.selectedCount + ' / ' + state.totalCount + ' terms selected</div></div>' +
          '</div></td>' +
          '<td>' + fmtNumber(currentCluster.query_volume) + '</td>' +
          '<td>' + fmtPct(currentCluster.impression_share) + '</td>' +
          '<td>' + fmtRatio(rootCtrRatio) + '</td>' +
          '<td>' + fmtRatio(rootAtcRatio) + '</td>' +
          '<td>' + fmtRatio(rootPurchRateRatio) + '</td>' +
          '<td>' + fmtRatio(rootCvrRatio) + '</td>' +
          '</tr>';
        if (expanded) {
          var termIds = rootTermIds(cluster.id);
          var termRows = termIds.map(function(termId) {
            return termMap.get(termId);
          }).filter(Boolean);
          termRows.sort(function(a, b) {
            return compareSortValues(
              sqpSortValueForTerm(a, sqpTableSort.key),
              sqpSortValueForTerm(b, sqpTableSort.key),
              sqpTableSort.dir,
              sqpTableSort.key === "term" ? "text" : "number"
            );
          });
          termRows.forEach(function(term) {
            var checked = selectedTermIds.has(term.id);
            var termClass = 'group-term-row';
            var currentTerm = selectedWeekSqpMetrics(term.weekly);
            var termPurchRateMarket = safeDiv(currentTerm.market_purchases, currentTerm.market_cart_adds);
            var termPurchRateOur = safeDiv(currentTerm.asin_purchases, currentTerm.asin_cart_adds);
            var termCtrRatio = rateRatio(currentTerm.asin_ctr, currentTerm.market_ctr);
            var termAtcRatio = rateRatio(currentTerm.asin_cart_add_rate, currentTerm.cart_add_rate);
            var termPurchRateRatio = rateRatio(termPurchRateOur, termPurchRateMarket);
            var termCvrRatio = rateRatio(currentTerm.asin_cvr, currentTerm.market_cvr);
            if (checked) {
              termClass += ' selected';
            }
            html += '<tr class="' + termClass + '" data-sqp-term-row="' + escapeHtml(term.id) + '" data-sqp-term-root="' + escapeHtml(cluster.id) + '" tabindex="0" role="button">' +
              '<td class="check-col"><input type="checkbox" data-sqp-term-checkbox="' + escapeHtml(term.id) + '"' + (checked ? ' checked' : '') + '></td>' +
              '<td><div class="group-term-cell"><div class="group-name-stack"><div class="group-name-main">' + escapeHtml(term.term) + '</div></div></div></td>' +
              '<td>' + fmtNumber(currentTerm.query_volume) + '</td>' +
              '<td>' + fmtPct(currentTerm.impression_share) + '</td>' +
              '<td>' + fmtRatio(termCtrRatio) + '</td>' +
              '<td>' + fmtRatio(termAtcRatio) + '</td>' +
              '<td>' + fmtRatio(termPurchRateRatio) + '</td>' +
              '<td>' + fmtRatio(termCvrRatio) + '</td>' +
              '</tr>';
          });
        }
      });
    });
    html += '</tbody></table></div></div>';
    return html;
  }

  function buildScpTableHtml(scpData, selection) {
    var headerColumns = [
      { key: "asin", label: "ASIN" },
      { key: "weeks_present_selected_week", label: "Weeks" },
      { key: "impressions", label: "Impr" },
      { key: "impression_share", label: "Impr %" },
      { key: "clicks", label: "Clicks" },
      { key: "click_share", label: "Click %" },
      { key: "ctr", label: "CTR" },
      { key: "cart_adds", label: "Cart Adds" },
      { key: "atc_rate", label: "ATC Rate" },
      { key: "purchases", label: "Purchases" },
      { key: "purchase_share", label: "Purch %" },
      { key: "purchase_rate", label: "Purch Rate" },
      { key: "cvr", label: "CVR" },
      { key: "sales", label: "Sales" }
    ];
    var rows = scpData.asins.slice();
    rows.sort(function(a, b) {
      var aCurrent = selectedWeekScpMetrics(a.weekly);
      var bCurrent = selectedWeekScpMetrics(b.weekly);
      var total = selection.current !== null ? selection.current : emptyScpMetrics();
      var aValue = scpSortValueForRow(a, scpTableSort.key);
      var bValue = scpSortValueForRow(b, scpTableSort.key);
      if (scpTableSort.key === "impression_share") {
        aValue = safeDiv(aCurrent.impressions, total.impressions);
        bValue = safeDiv(bCurrent.impressions, total.impressions);
      }
      if (scpTableSort.key === "click_share") {
        aValue = safeDiv(aCurrent.clicks, total.clicks);
        bValue = safeDiv(bCurrent.clicks, total.clicks);
      }
      if (scpTableSort.key === "purchase_share") {
        aValue = safeDiv(aCurrent.purchases, total.purchases);
        bValue = safeDiv(bCurrent.purchases, total.purchases);
      }
      return compareSortValues(
        aValue,
        bValue,
        scpTableSort.dir,
        scpTableSort.key === "asin" ? "text" : "number"
      );
    });

    var html = '<div class="compare-block">';
    html += '<div class="compare-table-wrap"><table class="compare-table compare-table-select"><thead><tr>';
    html += '<th class="check-col"><input type="checkbox" data-scp-all-checkbox' + (selection.isAllSelected ? ' checked' : '') + '></th>';
    headerColumns.forEach(function(column) {
      html += '<th class="sortable" data-scp-sort="' + column.key + '">' + column.label + sortIndicator(scpTableSort, column.key) + '</th>';
    });
    html += '</tr></thead><tbody>';
    rows.forEach(function(row) {
      var current = selectedWeekScpMetrics(row.weekly);
      var total = selection.current !== null ? selection.current : emptyScpMetrics();
      var rowClass = "";
      if (selection.selectedIds.indexOf(row.id) !== -1) {
        rowClass = "selected";
      }
      html += '<tr class="' + rowClass.trim() + '" data-scp-asin-row="' + escapeHtml(row.id) + '">';
      html += '<td class="check-col"><input type="checkbox" data-scp-asin-checkbox="' + escapeHtml(row.id) + '"' + (selection.selectedIds.indexOf(row.id) !== -1 ? ' checked' : '') + '></td>';
      html += '<td><div class="group-name-stack"><div class="group-name-main">' + escapeHtml(row.asin) + '</div><div class="group-name-meta">' + (row.is_target ? 'Target ASIN' : 'Catalog ASIN') + ' · ' + row.weeks_present_selected_week + ' / 1 weeks</div></div></td>';
      html += '<td>' + row.weeks_present_selected_week + '</td>';
      html += '<td>' + fmtNumber(current.impressions) + '</td>';
      html += '<td>' + fmtPct(safeDiv(current.impressions, total.impressions)) + '</td>';
      html += '<td>' + fmtNumber(current.clicks) + '</td>';
      html += '<td>' + fmtPct(safeDiv(current.clicks, total.clicks)) + '</td>';
      html += '<td>' + fmtPct(current.ctr) + '</td>';
      html += '<td>' + fmtNumber(current.cart_adds) + '</td>';
      html += '<td>' + fmtPct(current.atc_rate) + '</td>';
      html += '<td>' + fmtNumber(current.purchases) + '</td>';
      html += '<td>' + fmtPct(safeDiv(current.purchases, total.purchases)) + '</td>';
      html += '<td>' + fmtPct(current.purchase_rate) + '</td>';
      html += '<td>' + fmtPct(current.cvr) + '</td>';
      html += '<td>' + fmtMoney(current.sales) + '</td>';
      html += '</tr>';
    });
    html += '</tbody></table></div></div>';
    return html;
  }

  function buildBusinessReportsTableHtml(brData, selection) {
    var headerColumns = [
      { key: "asin", label: "ASIN" },
      { key: "weeks_present_selected_week", label: "Weeks" },
      { key: "sessions", label: "Sessions" },
      { key: "page_views", label: "Page Views" },
      { key: "order_items", label: "Order Items" },
      { key: "order_item_session_percentage", label: "Order Item %" },
      { key: "units_ordered", label: "Units" },
      { key: "unit_session_percentage", label: "Unit Session %" },
      { key: "buy_box_percentage", label: "Buy Box %" },
      { key: "sales", label: "Sales" }
    ];
    var rows = brData.asins.slice();
    rows.sort(function(a, b) {
      return compareSortValues(
        brSortValueForRow(a, brTableSort.key),
        brSortValueForRow(b, brTableSort.key),
        brTableSort.dir,
        brTableSort.key === "asin" ? "text" : "number"
      );
    });

    var html = '<div class="compare-block">';
    html += '<div class="compare-table-wrap"><table class="compare-table compare-table-select"><thead><tr>';
    html += '<th class="check-col"><input type="checkbox" data-br-all-checkbox' + (selection.isAllSelected ? ' checked' : '') + '></th>';
    headerColumns.forEach(function(column) {
      html += '<th class="sortable" data-br-sort="' + column.key + '">' + column.label + sortIndicator(brTableSort, column.key) + '</th>';
    });
    html += '</tr></thead><tbody>';
    rows.forEach(function(row) {
      var currentRecord = selectedWeekRecord(row.weekly);
      var current = selectedWeekBusinessMetrics(row.weekly);
      var hasWeek = currentRecord !== null;
      var rowClass = "";
      if (selection.selectedIds.indexOf(row.id) !== -1) {
        rowClass = "selected";
      }
      html += '<tr class="' + rowClass.trim() + '" data-br-asin-row="' + escapeHtml(row.id) + '">';
      html += '<td class="check-col"><input type="checkbox" data-br-asin-checkbox="' + escapeHtml(row.id) + '"' + (selection.selectedIds.indexOf(row.id) !== -1 ? ' checked' : '') + '></td>';
      html += '<td><div class="group-name-stack"><div class="group-name-main">' + escapeHtml(row.asin) + '</div><div class="group-name-meta">' + (row.is_target ? 'Target ASIN' : 'Catalog ASIN') + ' · ' + row.weeks_present_selected_week + ' / 1 weeks</div></div></td>';
      html += '<td>' + row.weeks_present_selected_week + '</td>';
      html += '<td>' + (hasWeek ? fmtNumber(current.sessions) : '—') + '</td>';
      html += '<td>' + (hasWeek ? fmtNumber(current.page_views) : '—') + '</td>';
      html += '<td>' + (hasWeek ? fmtNumber(current.order_items) : '—') + '</td>';
      html += '<td>' + (hasWeek ? fmtPct(current.order_item_session_percentage) : '—') + '</td>';
      html += '<td>' + (hasWeek ? fmtNumber(current.units_ordered) : '—') + '</td>';
      html += '<td>' + (hasWeek ? fmtPct(current.unit_session_percentage) : '—') + '</td>';
      html += '<td>' + (hasWeek ? fmtPct(current.buy_box_percentage) : '—') + '</td>';
      html += '<td>' + (hasWeek ? fmtMoney(current.sales) : '—') + '</td>';
      html += '</tr>';
    });
    html += '</tbody></table></div></div>';
    return html;
  }

  function blankVolumeValueHtml() {
    return '<span class="vol-val vol-val-empty">&mdash;</span>';
  }

  function selectCompetitorTerm(termId) {
    var clusterLabel = termId.split("::")[0];
    var cluster = activeData.clusters.find(function(item) {
      return item.cluster === clusterLabel;
    });
    if (selectedCompetitorTermIds.has(termId)) {
      selectedCompetitorTermIds.delete(termId);
    } else {
      selectedCompetitorTermIds.add(termId);
    }
    if (cluster) {
      if (competitorSelectedTermsForRoot(cluster.id).length > 0) {
        selectedCompetitorRootIds.add(cluster.id);
      } else {
        selectedCompetitorRootIds.delete(cluster.id);
      }
    }
    hasInitializedCompetitorSelection = true;
    syncCompetitorSelectionUi();
    renderCompetitorPanel();
  }

  function buildCompetitorTermsTableHtml(selection, competitor) {
    var headerColumns = [
      { key: "term", label: "Term" },
      { key: "search_frequency_rank", label: "SFR" },
      { key: "weeks_present", label: "Weeks" },
      { key: "our_click_share", label: "Our Click %" },
      { key: "competitor_click_share", label: competitor.brand + " Click %" },
      { key: "click_gap", label: "Click Gap" },
      { key: "our_purchase_share", label: "Our Purch %" },
      { key: "competitor_purchase_share", label: competitor.brand + " Purch %" },
      { key: "purchase_gap", label: "Purch Gap" },
      { key: "issue", label: "Issue" },
      { key: "priority", label: "Priority" },
      { key: "tst_pool", label: "TST Pool" }
    ];
    var allTermsSelected = selection.allTermIds.length > 0 && selection.selectedTermIds.length === selection.allTermIds.length;
    var html = '<div class="compare-block">';
    html += '<div class="compare-table-wrap"><table class="compare-table compare-table-select"><thead><tr><th class="check-col"><input type="checkbox" data-competitor-all-terms-checkbox' + (allTermsSelected ? ' checked' : '') + '></th>';
    headerColumns.forEach(function(column) {
      html += '<th class="sortable" data-competitor-sort="' + column.key + '">' + escapeHtml(column.label) + sortIndicator(competitorTableSort, column.key) + '</th>';
    });
    html += '</tr></thead><tbody>';
    var families = {};
    var familyOrder = [];
    activeData.clusters.forEach(function(cluster) {
      if (!families[cluster.family]) {
        families[cluster.family] = [];
        familyOrder.push(cluster.family);
      }
      families[cluster.family].push(cluster);
    });
    familyOrder.forEach(function(family) {
      families[family].sort(function(a, b) {
        return compareSortValues(
          sqpSortValueForCluster(a, sqpTableSort.key),
          sqpSortValueForCluster(b, sqpTableSort.key),
          sqpTableSort.dir,
          sqpTableSort.key === "term" ? "text" : "number"
        );
      });
      html += '<tr class="group-family-row"><td colspan="' + (headerColumns.length + 1) + '">' + escapeHtml(family) + '</td></tr>';
      families[family].forEach(function(cluster) {
        var state = competitorRootSelectionState(cluster.id);
        var compare = selectedWeekTstCompare(cluster.tstCompare.weekly);
        var observed = compare.observed;
        var coverage = compare.coverage;
        var recommendation = competitorRecommendation("root", observed, coverage);
        var rootClass = 'group-root-row';
        if (state.checked) {
          rootClass += ' selected';
        } else if (state.partial) {
          rootClass += ' partial';
        }
        var expanded = expandedCompetitorRootIds.has(cluster.id);
        html += '<tr class="' + rootClass + '" data-competitor-root-row="' + escapeHtml(cluster.id) + '" data-competitor-root-id="' + escapeHtml(cluster.id) + '">' +
          '<td class="check-col"><input type="checkbox" data-competitor-root-checkbox="' + escapeHtml(cluster.id) + '"' + (state.checked ? ' checked' : '') + '></td>' +
          '<td><div class="group-root-cell">' +
          '<button class="group-toggle-btn' + (expanded ? ' expanded' : '') + '" type="button" data-competitor-root-toggle="' + escapeHtml(cluster.id) + '"><span class="group-chevron">▶</span></button>' +
          '<div class="group-name-stack"><div class="group-name-main">' + escapeHtml(cluster.cluster) + '</div><div class="group-name-meta">' + state.selectedCount + ' / ' + state.totalCount + ' terms selected</div></div>' +
          '</div></td>' +
          '<td>—</td>' +
          '<td>' + coverage.term_weeks_covered + '</td>' +
          '<td>' + fmtPct(observed.our_click_share) + '</td>' +
          '<td>' + fmtPct(observed.competitor_click_share) + '</td>' +
          '<td>' + fmtPctDeltaHtml(observed.click_gap) + '</td>' +
          '<td>' + fmtPct(observed.our_purchase_share) + '</td>' +
          '<td>' + fmtPct(observed.competitor_purchase_share) + '</td>' +
          '<td>' + fmtPctDeltaHtml(observed.purchase_gap) + '</td>' +
          '<td>' + recommendationPillHtml(recommendation.issue, recommendation.issue_class) + '</td>' +
          '<td>' + recommendationPillHtml(recommendation.priority, recommendation.priority_class) + '</td>' +
          '<td>' + fmtPct(coverage.avg_click_pool_share) + ' click · ' + fmtPct(coverage.avg_purchase_pool_share) + ' purch</td>' +
          '</tr>';
        if (expanded) {
          var termRows = compare.term_rows.slice();
          termRows.sort(function(a, b) {
            return compareSortValues(
              competitorSortValueForRow(a, competitorTableSort.key),
              competitorSortValueForRow(b, competitorTableSort.key),
              competitorTableSort.dir,
              competitorSortType(competitorTableSort.key)
            );
          });
          termRows.forEach(function(row) {
            var termId = competitorTermKey(cluster.cluster, row.term);
            var checked = selectedCompetitorTermIds.has(termId);
            var recommendation = competitorRecommendationForRow(row);
            var termClass = 'group-term-row';
            if (checked) {
              termClass += ' selected';
            }
            var sfr = row.search_frequency_rank > 0 ? fmtNumber(row.search_frequency_rank) : '—';
            html += '<tr class="' + termClass + '" data-competitor-term-row="' + escapeHtml(termId) + '">' +
              '<td class="check-col"><input type="checkbox" data-competitor-term-checkbox="' + escapeHtml(termId) + '"' + (checked ? ' checked' : '') + '></td>' +
              '<td><div class="group-term-cell"><div class="group-name-stack"><div class="group-name-main">' + escapeHtml(row.term) + '</div></div></div></td>' +
              '<td>' + sfr + '</td>' +
              '<td>' + row.weeks_present + '</td>' +
              '<td>' + fmtPct(row.our_click_share) + '</td>' +
              '<td>' + fmtPct(row.competitor_click_share) + '</td>' +
              '<td>' + fmtPctDeltaHtml(row.click_gap) + '</td>' +
              '<td>' + fmtPct(row.our_purchase_share) + '</td>' +
              '<td>' + fmtPct(row.competitor_purchase_share) + '</td>' +
              '<td>' + fmtPctDeltaHtml(row.purchase_gap) + '</td>' +
              '<td>' + recommendationPillHtml(recommendation.issue, recommendation.issue_class) + '</td>' +
              '<td>' + recommendationPillHtml(recommendation.priority, recommendation.priority_class) + '</td>' +
              '<td>' + fmtPct(row.avg_click_pool_share) + ' click · ' + fmtPct(row.avg_purchase_pool_share) + ' purch</td>' +
              '</tr>';
          });
        }
      });
    });
    html += '</tbody></table></div></div>';
    return html;
  }

  function buildStageFunnelHtml(stages, connectors, footerParts) {
    var maxTotal = stages.length ? stages[0].total : 0;
    if (maxTotal <= 0) {
      maxTotal = 1;
    }
    var html = '<div class="funnel-scroll">';
    html += '<div class="funnel-graph">';
    html += '<div class="funnel-body">';

    stages.forEach(function(s, i) {
      var widthPct = s.fixedWidthPct != null ? s.fixedWidthPct : Math.max(Math.sqrt(s.total / maxTotal) * 100, 52);
      var useLinearSegments = s.segmentScale === "linear";
      var sqOther = Math.sqrt(s.other + 1);
      var sqAsin = Math.sqrt(s.asin + 1);
      var sqTotal = sqOther + sqAsin;
      var otherFlex = useLinearSegments && s.total > 0 ? s.other / s.total : sqOther / sqTotal;
      var asinFlex = useLinearSegments && s.total > 0 ? s.asin / s.total : sqAsin / sqTotal;
      var overlaySupported = false;
      var overlayWidthPct = 0;
      var overlayValue = 0;
      var overlayLabel = "";
      var overlayCoveragePct = 0;
      var overlayOutside = false;
      var otherShare = s.total > 0 ? s.other / s.total : 0;
      var otherName = s.otherName ? s.otherName : "Other ASINs";
      var asinName = s.asinName ? s.asinName : "Our ASIN";
      var otherValueText = s.otherValueText ? s.otherValueText : fmtNumber(s.other);
      var asinValueText = s.asinValueText ? s.asinValueText : fmtNumber(s.asin);
      var otherDetailText = s.otherDetailText ? s.otherDetailText : fmtPct(otherShare);
      var asinDetailText = s.asinDetailText ? s.asinDetailText : (fmtPct(s.asinShare) + ' ' + deltaHtml(s.asinDelta));
      var asinOutsideThreshold = s.asinOutsideThreshold != null ? s.asinOutsideThreshold : 12;
      var asinOutside = s.asinOutsideIfNarrow && (asinFlex * 100) < asinOutsideThreshold;
      var asinClassName = s.asinClassName != null ? s.asinClassName : "";
      var asinOutsideClassName = s.asinOutsideClassName != null ? s.asinOutsideClassName : "";
      var overlayValueText = "";
      var overlayDetailText = "";
      var otherTooltip = "Other ASINs: " + fmtNumber(s.other) + " | Share: " + fmtPct(otherShare);
      var overlayShare = 0;
      var overlayClassName = "";
      var overlayOutsideClassName = "";

      if (s.overlay !== null && s.overlay.supported && s.overlay.other_asins_total > 0 && s.overlay.observed > 0) {
        overlaySupported = true;
        if (s.overlayScale === "linear") {
          overlayWidthPct = Math.min((s.overlay.observed / s.overlay.other_asins_total) * 100, 100);
        } else {
          overlayWidthPct = Math.min((Math.sqrt(s.overlay.observed + 1) / Math.sqrt(s.overlay.other_asins_total + 1)) * 100, 100);
        }
        overlayValue = s.overlay.observed;
        overlayLabel = s.overlay.label;
        overlayCoveragePct = s.overlay.coverage;
        overlayShare = s.total > 0 ? overlayValue / s.total : 0;
        overlayValueText = s.overlay.valueText ? s.overlay.valueText : fmtNumber(overlayValue);
        overlayDetailText = s.overlay.detailText ? s.overlay.detailText : fmtPct(overlayShare);
        overlayClassName = s.overlay.className != null ? s.overlay.className : "";
        overlayOutsideClassName = s.overlay.outsideClassName != null ? s.overlay.outsideClassName : "";
        otherTooltip += " | " + overlayLabel + ": " + fmtNumber(overlayValue) + " | Share: " + fmtPct(overlayShare) + " | Coverage: " + fmtPct(overlayCoveragePct);
        if (s.overlayOutsideAlways) {
          overlayOutside = true;
        } else {
          overlayOutside = s.overlayOutsideIfNarrow && overlayWidthPct < (s.overlayOutsideThreshold != null ? s.overlayOutsideThreshold : 14);
        }
      }

      html += '<div class="stage ' + s.cls + '">';
      html += '<div class="stage-label">' + s.label + (s.sparkline ? ' ' + s.sparkline : '') + '</div>';
      if (s.stageMeta) {
        html += '<div class="stage-meta">' + s.stageMeta + '</div>';
      }
      if (overlayOutside || asinOutside) {
        html += '<div class="stage-topline">';
        html += '<div class="stage-topline-left">';
        if (overlayOutside) {
          html += '<div class="stage-outside-pill stage-outside-pill-overlay' + (overlayOutsideClassName ? ' ' + overlayOutsideClassName : '') + '"><div class="seg-name">' + escapeHtml(overlayLabel) + '</div><div class="seg-val">' + escapeHtml(overlayValueText) + '</div><div class="seg-detail">' + overlayDetailText + '</div></div>';
        }
        html += '</div>';
        html += '<div class="stage-topline-right">';
        if (asinOutside) {
          html += '<div class="stage-outside-pill' + (asinOutsideClassName ? ' ' + asinOutsideClassName : '') + '"><div class="seg-name">' + escapeHtml(asinName) + '</div><div class="seg-val">' + escapeHtml(asinValueText) + '</div><div class="seg-detail">' + asinDetailText + '</div></div>';
        }
        html += '</div>';
        html += '</div>';
      }
      html += '<div class="stage-band" style="width:' + widthPct.toFixed(1) + '%">';

      html += '<div class="seg seg-other" style="flex:' + otherFlex.toFixed(4) + '" title="' + escapeHtml(otherTooltip) + '">';
      if (overlaySupported) {
        html += '<div class="seg-overlay' + (overlayClassName ? ' ' + overlayClassName : '') + '" style="width:' + overlayWidthPct.toFixed(1) + '%" title="' + escapeHtml(overlayLabel + ': ' + fmtNumber(overlayValue) + ' | Share: ' + fmtPct(overlayShare) + ' | Coverage: ' + fmtPct(overlayCoveragePct)) + '">';
        if (!overlayOutside && overlayWidthPct >= 8) {
          html += '<div class="seg-overlay-inner">';
          if (overlayWidthPct >= 16) {
            html += '<div class="seg-overlay-label">' + escapeHtml(overlayLabel) + '</div>';
          }
          html += '<div class="seg-overlay-value">' + escapeHtml(overlayValueText) + '</div>';
          if (overlayWidthPct >= 18) {
            html += '<div class="seg-overlay-detail">' + escapeHtml(overlayDetailText) + '</div>';
          }
          html += '</div>';
        }
        html += '</div>';
      }
      html += '<div class="seg-inner"><div class="seg-name">' + escapeHtml(otherName) + '</div><div class="seg-val">' + escapeHtml(otherValueText) + '</div><div class="seg-detail">' + otherDetailText + '</div></div></div>';

      html += '<div class="seg seg-asin' + (asinClassName ? ' ' + asinClassName : '') + '" style="flex:' + asinFlex.toFixed(4) + '" title="' + escapeHtml(asinName + ': ' + asinValueText + ' | ' + asinDetailText.replace(/<[^>]*>/g, "")) + '"><div class="seg-inner' + (asinOutside ? ' seg-inner-hidden' : '') + '"><div class="seg-name">' + escapeHtml(asinName) + '</div><div class="seg-val seg-val-asin">' + escapeHtml(asinValueText) + '</div><div class="seg-detail">' + asinDetailText + '</div></div></div>';
      html += '</div></div>';

      if (i < connectors.length) {
        var c = connectors[i];
        var leftTag = c.leftTag ? c.leftTag : "Mkt";
        var rightTag = c.rightTag ? c.rightTag : "Ours";
        var leftRate = c.leftRate ? c.leftRate : c.mktRate;
        var rightRate = c.rightRate ? c.rightRate : c.asinRate;
        var rightBetter = c.rightBetter != null ? c.rightBetter : c.asinBetter;
        var leftPairClass = c.leftPairClass != null ? c.leftPairClass : "";
        var rightPairClass = c.rightPairClass != null ? c.rightPairClass : "";
        var winLossClass = rightBetter ? (c.rightWinClass != null ? c.rightWinClass : "fc-win") : (c.rightLoseClass != null ? c.rightLoseClass : "fc-lose");
        var winLoss = rightBetter ? '<span class="fc-indicator ' + winLossClass + '">\u25B2</span>' : '<span class="fc-indicator ' + winLossClass + '">\u25BC</span>';
        html += '<div class="funnel-connector">';
        html += '<div class="fc-flow"></div>';
        html += '<div class="fc-data">';
        html += '<span class="fc-label">' + c.label + '</span>';
        html += '<span class="fc-pair' + (leftPairClass ? ' ' + leftPairClass : '') + '"><span class="fc-tag">' + escapeHtml(leftTag) + '</span> <span class="fc-val fc-val-market">' + leftRate + '</span></span>';
        html += '<span class="fc-sep">\u00B7</span>';
        html += '<span class="fc-pair' + (rightPairClass ? ' ' + rightPairClass : '') + '"><span class="fc-tag">' + escapeHtml(rightTag) + '</span> <span class="fc-val fc-val-asin">' + rightRate + '</span>' + winLoss + '</span>';
        if (c.secondary) {
          var s2 = c.secondary;
          var s2LeftTag = s2.leftTag ? s2.leftTag : "Mkt";
          var s2RightTag = s2.rightTag ? s2.rightTag : "Ours";
          var s2LeftRate = s2.leftRate ? s2.leftRate : s2.mktRate;
          var s2RightRate = s2.rightRate ? s2.rightRate : s2.asinRate;
          var s2RightBetter = s2.rightBetter != null ? s2.rightBetter : s2.asinBetter;
          var s2LeftPairClass = s2.leftPairClass != null ? s2.leftPairClass : "";
          var s2RightPairClass = s2.rightPairClass != null ? s2.rightPairClass : "";
          var wl2Class = s2RightBetter ? (s2.rightWinClass != null ? s2.rightWinClass : "fc-win") : (s2.rightLoseClass != null ? s2.rightLoseClass : "fc-lose");
          var wl2 = s2RightBetter ? '<span class="fc-indicator ' + wl2Class + '">\u25B2</span>' : '<span class="fc-indicator ' + wl2Class + '">\u25BC</span>';
          html += '<span class="fc-sep">\u00B7</span>';
          html += '<span class="fc-label">' + s2.label + '</span>';
          html += '<span class="fc-pair' + (s2LeftPairClass ? ' ' + s2LeftPairClass : '') + '"><span class="fc-tag">' + escapeHtml(s2LeftTag) + '</span> <span class="fc-val">' + s2LeftRate + '</span></span>';
          html += '<span class="fc-sep">\u00B7</span>';
          html += '<span class="fc-pair' + (s2RightPairClass ? ' ' + s2RightPairClass : '') + '"><span class="fc-tag">' + escapeHtml(s2RightTag) + '</span> <span class="fc-val">' + s2RightRate + '</span>' + wl2 + '</span>';
        }
        html += '</div>';
        html += '<div class="fc-flow fc-flow-end"></div>';
        html += '</div>';
      }
    });

    html += '</div>';
    html += '</div>';
    html += '<div class="coverage-bar">';
    footerParts.forEach(function(part) {
      html += part;
    });
    html += '</div>';
    html += '</div>';
    return html;
  }

  function buildSingleStageFunnelHtml(stages, connectors, footerParts) {
    var html = '<div class="funnel-scroll">';
    html += '<div class="funnel-graph">';
    html += '<div class="funnel-body">';
    stages.forEach(function(stage, index) {
      html += '<div class="stage ' + stage.cls + '">';
      html += '<div class="stage-label">' + stage.label + '</div>';
      if (stage.stageMeta) {
        html += '<div class="stage-meta">' + stage.stageMeta + '</div>';
      }
      html += '<div class="stage-band stage-band-single">';
      html += '<div class="seg seg-single" title="' + escapeHtml(stage.label + ': ' + stage.valueText) + '">';
      html += '<div class="seg-inner"><div class="seg-name">' + escapeHtml(stage.segmentName) + '</div><div class="seg-val seg-val-asin">' + escapeHtml(stage.valueText) + '</div><div class="seg-detail">' + stage.detailText + '</div></div>';
      html += '</div>';
      html += '</div>';
      html += '</div>';
      if (index < connectors.length) {
        var connector = connectors[index];
        html += '<div class="funnel-connector">';
        html += '<div class="fc-flow"></div>';
        html += '<div class="fc-data">';
        html += '<span class="fc-label">' + connector.label + '</span>';
        html += '<span class="fc-pair"><span class="fc-val fc-val-asin">' + connector.rate + '</span></span>';
        if (connector.secondary) {
          html += '<span class="fc-sep">·</span>';
          html += '<span class="fc-label">' + connector.secondary.label + '</span>';
          html += '<span class="fc-pair"><span class="fc-val fc-val-asin">' + connector.secondary.rate + '</span></span>';
        }
        html += '</div>';
        html += '<div class="fc-flow fc-flow-end"></div>';
        html += '</div>';
      }
    });
    html += '</div>';
    html += '</div>';
    html += '<div class="coverage-bar">';
    footerParts.forEach(function(part) {
      html += part;
    });
    html += '</div>';
    html += '</div>';
    return html;
  }

  function buildEmptyFunnelGraphHtml(message, footerParts) {
    var html = '<div class="funnel-scroll">';
    html += '<div class="funnel-graph">';
    html += '<div class="funnel-body">';
    html += '<div class="funnel-empty-state funnel-empty-state-graph">' + escapeHtml(message) + '</div>';
    html += '</div>';
    html += '</div>';
    html += '<div class="coverage-bar">';
    footerParts.forEach(function(part) {
      html += part;
    });
    html += '</div>';
    html += '</div>';
    return html;
  }

  function buildScpWeeklyGraphHtml(footerParts, historyLabel, anchorWeek) {
    var html = '<div class="funnel-scroll">';
    html += '<div class="funnel-graph">';
    html += '<div class="weekly-slot">';
    html += '<div class="weekly-slot-head">';
    html += '<div class="weekly-slot-title">Week over week</div>';
    html += '<div class="weekly-slot-legend">';
    html += '<button class="weekly-slot-toggle active" data-scp-toggle="ctr" style="--toggle-color:#8fc7ff;"><span class="weekly-slot-swatch"></span>CTR</button>';
    html += '<button class="weekly-slot-toggle active" data-scp-toggle="atc" style="--toggle-color:#f5a623;"><span class="weekly-slot-swatch"></span>ATC Rate</button>';
    html += '<button class="weekly-slot-toggle active" data-scp-toggle="purch" style="--toggle-color:#77dfd0;"><span class="weekly-slot-swatch"></span>Purch Rate</button>';
    html += '<button class="weekly-slot-toggle active" data-scp-toggle="cvr" style="--toggle-color:#d5ff62;"><span class="weekly-slot-swatch"></span>CVR</button>';
    html += '<span class="weekly-slot-key" style="color:rgba(241,235,222,0.72);"><span class="weekly-slot-swatch weekly-slot-swatch-dot"></span>Change week</span>';
    html += '<span class="weekly-slot-key" style="color:rgba(241,235,222,0.4);font-size:9px;">Search funnel rates</span>';
    html += '</div>';
    html += '</div>';
    html += '<div class="chart-area chart-competitor-wow" id="scp-wow-chart"></div>';
    html += '</div>';
    html += '</div>';
    html += '<div class="coverage-bar">';
    footerParts.forEach(function(part) {
      html += part;
    });
    html += '</div>';
    html += '</div>';
    return html;
  }

  function buildBusinessReportsWeeklyGraphHtml(footerParts, historyLabel, anchorWeek) {
    var title = brViewMode === "daily" ? "Day by day" : "Week over week";
    var changeLabel = brViewMode === "daily" ? "Change log day" : "Change week";
    var note = brViewMode === "daily" ? "Selected-week daily trend" : "Counts + retail conversion rates";
    var html = '<div class="funnel-scroll">';
    html += '<div class="funnel-graph">';
    html += '<div class="weekly-slot">';
    html += '<div class="weekly-slot-head">';
    html += '<div class="weekly-slot-title">' + title + '</div>';
    html += '<div class="panel-head-tools">';
    html += '<button class="panel-mini-btn' + (brViewMode === "weekly" ? ' active' : '') + '" type="button" data-br-view="weekly">Weekly</button>';
    html += '<button class="panel-mini-btn' + (brViewMode === "daily" ? ' active' : '') + '" type="button" data-br-view="daily">Daily</button>';
    html += '</div>';
    html += '<div class="weekly-slot-legend">';
    html += '<button class="weekly-slot-toggle active" data-br-toggle="sessions" style="--toggle-color:#8fc7ff;"><span class="weekly-slot-swatch"></span>Sessions</button>';
    html += '<button class="weekly-slot-toggle active" data-br-toggle="order_items" style="--toggle-color:#f5a623;"><span class="weekly-slot-swatch"></span>Order Item %</button>';
    html += '<button class="weekly-slot-toggle active" data-br-toggle="unit_session" style="--toggle-color:#d5ff62;"><span class="weekly-slot-swatch"></span>Unit Session %</button>';
    html += '<span class="weekly-slot-key" style="color:rgba(241,235,222,0.72);"><span class="weekly-slot-swatch weekly-slot-swatch-dot"></span>' + changeLabel + '</span>';
    html += '<span class="weekly-slot-key" style="color:rgba(241,235,222,0.4);font-size:9px;">' + note + '</span>';
    html += '</div>';
    html += '</div>';
    html += '<div class="chart-area chart-competitor-wow" id="br-wow-chart"></div>';
    html += '</div>';
    html += '</div>';
    html += '<div class="coverage-bar">';
    footerParts.forEach(function(part) {
      html += part;
    });
    html += '</div>';
    html += '</div>';
    return html;
  }

  function buildCompetitorWeeklyGraphHtml(footerParts, competitor, historyLabel, anchorWeek) {
    var html = '<div class="funnel-scroll">';
    html += '<div class="funnel-graph">';
    html += '<div class="weekly-slot">';
    html += '<div class="weekly-slot-head">';
    html += '<div class="weekly-slot-title">Week over week</div>';
    html += '<div class="weekly-slot-legend">';
    html += '<button class="weekly-slot-toggle active" data-comp-toggle="click" style="--toggle-color:#77dfd0;"><span class="weekly-slot-swatch"></span>Click Gap</button>';
    html += '<button class="weekly-slot-toggle active" data-comp-toggle="purch" style="--toggle-color:#d5ff62;"><span class="weekly-slot-swatch"></span>Purch Gap</button>';
    html += '<span class="weekly-slot-key" style="color:rgba(241,235,222,0.72);"><span class="weekly-slot-swatch weekly-slot-swatch-dot"></span>Change week</span>';
    html += '<span class="weekly-slot-key" style="color:rgba(241,235,222,0.4);font-size:9px;">Share gap shown in pts</span>';
    html += '</div>';
    html += '</div>';
    html += '<div class="chart-area chart-competitor-wow" id="competitor-wow-chart"></div>';
    html += '</div>';
    html += '</div>';
    html += '<div class="coverage-bar">';
    footerParts.forEach(function(part) {
      html += part;
    });
    html += '</div>';
    html += '</div>';
    return html;
  }

  function buildSqpWeeklyGraphHtml(footerParts, historyLabel, anchorWeek) {
    var html = '<div class="funnel-scroll">';
    html += '<div class="funnel-graph">';
    html += '<div class="weekly-slot">';
    html += '<div class="weekly-slot-head">';
    html += '<div class="weekly-slot-title">Week over week</div>';
    html += '<div class="weekly-slot-legend">';
    html += '<button class="weekly-slot-toggle active" data-sqp-toggle="impr" style="--toggle-color:#8fc7ff;"><span class="weekly-slot-swatch"></span>Impr Share</button>';
    html += '<button class="weekly-slot-toggle active" data-sqp-toggle="ctr" style="--toggle-color:#e0a4ff;"><span class="weekly-slot-swatch"></span>CTR x</button>';
    html += '<button class="weekly-slot-toggle active" data-sqp-toggle="atc" style="--toggle-color:#f5a623;"><span class="weekly-slot-swatch"></span>ATC x</button>';
    html += '<button class="weekly-slot-toggle active" data-sqp-toggle="cvr" style="--toggle-color:#d5ff62;"><span class="weekly-slot-swatch"></span>CVR x</button>';
    html += '<span class="weekly-slot-key" style="color:rgba(241,235,222,0.72);"><span class="weekly-slot-swatch weekly-slot-swatch-dot"></span>Change week</span>';
    html += '</div>';
    html += '</div>';
    html += '<div class="chart-area chart-competitor-wow" id="sqp-wow-chart"></div>';
    html += '</div>';
    html += '</div>';
    html += '<div class="coverage-bar">';
    footerParts.forEach(function(part) {
      html += part;
    });
    html += '</div>';
    html += '</div>';
    return html;
  }

  /* ===== WEEK SELECTOR ===== */

  function initWeekSelector() {
    var sel = document.getElementById("week-selector");
    reportData.weeks.forEach(function(w, i) {
      var opt = document.createElement("option");
      opt.value = w;
      var dateStr = reportData.weekStartDates[w] ? " \u2014 " + reportData.weekStartDates[w] : "";
      opt.textContent = w + dateStr;
      if (w === reportData.defaultWeek) opt.selected = true;
      sel.appendChild(opt);
    });
    sel.addEventListener("change", function() {
      setActiveWeek(sel.value);
      renderAll();
    });
  }

  function syncTopControls() {
    var wrap = document.getElementById("week-over-week-toggle-wrap");
    var button = document.getElementById("week-over-week-toggle");
    var label = document.querySelector(".week-label");
    var labelText = "SQP Report";
    if (activeTab === "scp") labelText = "SCP Report";
    if (activeTab === "br") labelText = "Business Reports";
    if (activeTab === "competitor") labelText = "TST Report";
    if (activeTab === "changelog") labelText = "Change Log";
    if (activeTab === "compare") labelText = "Compare";
    if (activeTab === "sources") labelText = "Sources";
    wrap.classList.remove("visible");
    button.classList.remove("active");
    label.textContent = labelText;
  }

  function initTopControls() {
    var button = document.getElementById("week-over-week-toggle");
    syncTopControls();
  }

  /* ===== TAB SWITCHING ===== */

  function initTabs() {
    document.querySelectorAll(".top-bar .tab-btn").forEach(function(btn) {
      btn.addEventListener("click", function() {
        var tab = btn.getAttribute("data-tab");
        activeTab = tab;
        document.querySelectorAll(".top-bar .tab-btn").forEach(function(b) { b.classList.remove("active"); });
        btn.classList.add("active");
        document.querySelectorAll(".page").forEach(function(p) { p.classList.remove("active"); });
        document.getElementById("page-" + tab).classList.add("active");
        syncTopControls();
        if (tab === "sqp") renderFunnel();
        if (tab === "scp") renderScpPanel();
        if (tab === "br") renderBusinessReportsPanel();
        if (tab === "competitor") renderCompetitorTab();
        if (tab === "changelog") renderChangeLogTab();
        if (tab === "compare") renderCompareTab();
        if (tab === "sources") renderSourceHeatmap();
      });
    });
  }

  /* ===== SQP TAB: ROOT TABLE ===== */

  function renderRootTable() {
    var tbody = document.getElementById("root-tbody");
    tbody.innerHTML = "";
    var data = activeData;
    var families = {};
    var familyOrder = [];
    data.clusters.forEach(function(c) {
      if (!families[c.family]) {
        families[c.family] = [];
        familyOrder.push(c.family);
      }
      families[c.family].push(c);
    });
    if (!data.clusters.length) {
      tbody.innerHTML = '<tr><td colspan="3" style="padding:18px 12px;color:var(--dim);font-size:11px;">No SQP-backed root data for the selected week window.</td></tr>';
      document.getElementById("funnel-panel").innerHTML = '<div class="panel funnel-empty"><div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--dim);font-size:12px;letter-spacing:0.04em;">No root data for the selected week</div></div>';
      return;
    }
    familyOrder.forEach(function(family) {
      families[family].sort(function(a, b) { return (b.market_purchases) - (a.market_purchases); });
    });

    var firstRoot = null;
    familyOrder.forEach(function(family) {
      var groupRow = document.createElement("tr");
      groupRow.innerHTML = '<td colspan="3" class="family-group">' + escapeHtml(family.toUpperCase()) + '</td>';
      tbody.appendChild(groupRow);

      families[family].forEach(function(cluster) {
        if (!firstRoot) firstRoot = cluster.id;
        var row = document.createElement("tr");
        row.className = "root-row";
        row.setAttribute("data-root-id", cluster.id);

        var coverage = cluster.coverage;
        var indicators = '<span class="ind ind-sqp">' + coverage.terms_sqp + '/' + coverage.terms_total + '</span>';

        row.innerHTML =
          '<td><div class="root-name"><label class="root-check"><input type="checkbox" data-root-checkbox="' + escapeHtml(cluster.id) + '"><span class="root-label-text">' + escapeHtml(cluster.cluster) + '</span></label></div>' +
          '<div class="root-indicators">' + indicators + '</div></td>' +
          '<td>' + fmtNumber(cluster.market_purchases) + '</td>' +
          '<td>' + fmtPct(cluster.purchase_share) + '</td>';

        row.addEventListener("click", function(event) {
          if (event.target.closest(".root-check")) {
            return;
          }
          var state = rootSelectionState(cluster.id);
          setRootSelection(cluster.id, !state.checked);
        });
        tbody.appendChild(row);
      });
    });
    tbody.querySelectorAll("[data-root-checkbox]").forEach(function(input) {
      input.addEventListener("click", function(event) {
        event.stopPropagation();
      });
      input.addEventListener("change", function() {
        setRootSelection(input.getAttribute("data-root-checkbox"), input.checked);
      });
    });

    if (!hasInitializedSqpSelection && firstRoot) {
      setRootSelection(firstRoot, true);
      return;
    }
    syncSqpSelectionUi();
    renderFunnel();
  }

  function selectTerm(clusterId, termId) {
    if (selectedTermIds.has(termId)) {
      selectedTermIds.delete(termId);
    } else {
      selectedTermIds.add(termId);
    }
    if (selectedTermsForRoot(clusterId).length > 0) {
      selectedSqpRootIds.add(clusterId);
    } else {
      selectedSqpRootIds.delete(clusterId);
    }
    hasInitializedSqpSelection = true;
    syncSqpSelectionUi();
    renderFunnel();
  }

  function toggleCompetitorRootExpansion(clusterId) {
    if (expandedCompetitorRootIds.has(clusterId)) {
      expandedCompetitorRootIds.delete(clusterId);
    } else {
      expandedCompetitorRootIds.add(clusterId);
    }
    renderCompetitorPanel();
  }

  function renderTermExpansion(clusterId) {
    var container = document.getElementById("term-inner-" + clusterId);
    if (!container) return;
    var termIds = activeData.sqpClusterTerms[clusterId];
    if (!termIds) {
      container.innerHTML = '<span style="color:var(--dim);font-size:11px;">No SQP terms</span>';
      return;
    }
    var terms = termIds.map(function(tid) { return termMap.get(tid); }).filter(Boolean);
    terms.sort(function(a, b) {
      if (b.selection_volume_selected_week !== a.selection_volume_selected_week) {
        return b.selection_volume_selected_week - a.selection_volume_selected_week;
      }
      if (b.selection_volume_baseline_13w !== a.selection_volume_baseline_13w) {
        return b.selection_volume_baseline_13w - a.selection_volume_baseline_13w;
      }
      return b.market_purchases - a.market_purchases;
    });

    var html = '<table class="term-mini-tbl"><thead><tr><th>Term</th><th>Vol</th><th>Impr %</th><th>Purch %</th><th>CVR</th></tr></thead><tbody>';
    terms.forEach(function(t) {
      var rowClass = 'term-mini-row';
      if (selectedTermIds.has(t.id)) {
        rowClass += ' selected';
      }
      html += '<tr class="' + rowClass + '" data-term-id="' + escapeHtml(t.id) + '"><td>' + escapeHtml(t.term) + '</td>' +
        '<td>' + fmtNumber(t.selection_volume_selected_week) + '</td>' +
        '<td>' + fmtPct(t.impression_share) + '</td>' +
        '<td>' + fmtPct(t.purchase_share) + '</td>' +
        '<td>' + fmtPct(t.asin_cvr) + '</td></tr>';
    });
    html += '</tbody></table>';
    container.innerHTML = html;
    container.querySelectorAll("[data-term-id]").forEach(function(row) {
      row.addEventListener("click", function() {
        selectTerm(clusterId, row.getAttribute("data-term-id"));
      });
    });
  }

  /* ===== SQP TAB: FUNNEL REPORT ===== */

  function renderFunnel() {
    var panel = document.getElementById("funnel-panel");
    if (!hasInitializedSqpSelection) {
      if (activeData.clusters.length > 0) {
        setRootSelection(activeData.clusters[0].id, true);
        return;
      }
    }
    var selection = activeSqpSelection();
    if (activeData.clusters.length === 0) {
      panel.innerHTML = '<div class="panel funnel-empty"><div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--dim);font-size:12px;letter-spacing:0.04em;">No SQP-backed roots for the selected window</div></div>';
      return;
    }

    var cluster = selection.cluster;
    var baselineWindowLabel = windowRangeLabel(activeData.meta.baselineWindow);
    var anchorWeekLabel = activeData.meta.anchorWeek;
    var metrics = selection.metrics;
    var currentMetrics = null;
    if (metrics !== null && selection.scopeType !== "no-terms") {
      currentMetrics = selectedWeekSqpMetrics(selection.weekly);
    }
    var metaParts = [];
    var heroName = '';
    if (selection.scopeType === "empty") {
      heroName = "SQP Selection";
      metaParts = ["0 roots selected", selectedWeekLabel];
    } else if (selection.scopeType === "no-terms") {
      if (selection.rootIds.length > 1) {
        heroName = selection.rootIds.length + ' Roots';
        metaParts = [escapeHtml(selection.rootLabels.slice(0, 3).join(', ')), '0 / ' + selection.allIds.length + ' SQP terms selected'];
      } else {
        heroName = cluster.cluster;
        metaParts = [escapeHtml(cluster.family), '0 / ' + selection.allIds.length + ' SQP terms selected'];
      }
      metaParts.push(selectedWeekLabel);
    } else if (selection.scopeType === "root") {
      heroName = cluster.cluster;
      metaParts.unshift(escapeHtml(cluster.family), selection.selectedIds.length + " / " + selection.allIds.length + " SQP terms selected", selectedWeekLabel);
    } else if (selection.scopeType === "term") {
      heroName = selection.singleTerm.term;
      metaParts = [escapeHtml(cluster.cluster), "1 / " + selection.allIds.length + " SQP terms selected", selectedWeekLabel];
    } else if (selection.scopeType === "multi") {
      heroName = cluster.cluster;
      metaParts = [escapeHtml(cluster.family), selection.selectedIds.length + " / " + selection.allIds.length + " SQP terms selected", selectedWeekLabel];
    } else if (selection.scopeType === "multi-root") {
      heroName = selection.rootIds.length + ' Roots';
      var rootPreview = selection.rootLabels.slice(0, 3).join(', ');
      if (selection.rootLabels.length > 3) {
        rootPreview += ' +' + (selection.rootLabels.length - 3);
      }
      metaParts = [escapeHtml(rootPreview), selection.selectedIds.length + " / " + selection.allIds.length + " SQP terms selected", selectedWeekLabel];
    }
    var recentSqpWeeks = null;
    if ((selection.scopeType === "root" || selection.scopeType === "no-terms") && cluster && cluster.coverage) {
      recentSqpWeeks = cluster.coverage.recent_4w.weeks_sqp;
    } else if (metrics) {
      recentSqpWeeks = metrics.weeks_sqp;
    }

    var html = '<div class="panel"><div class="funnel-report funnel-report-sqp">';
    html += '<div class="funnel-hero">';
    html += '<h1 class="funnel-hero-name">' + escapeHtml(heroName) + '</h1>';
    html += '<div class="funnel-hero-meta">' + metaParts.join(" &middot; ") + '</div>';
    html += '</div>';
    if (metrics !== null) {
      var sqpBlankTopValues = selection.scopeType === "no-terms";
      html += '<div class="volume-strip">';
      html += '<div class="vol-item"><div class="vol-label">Query Volume</div>' + (sqpBlankTopValues ? blankVolumeValueHtml() : '<div class="vol-val">' + fmtNumber(currentMetrics.query_volume) + '</div>') + '</div>';
      html += '<div class="vol-item"><div class="vol-label">Market Purchases</div>' + (sqpBlankTopValues ? blankVolumeValueHtml() : '<div class="vol-val">' + fmtNumber(currentMetrics.market_purchases) + '</div>') + '</div>';
      html += '<div class="vol-item"><div class="vol-label">Our Purchases</div>' + (sqpBlankTopValues ? blankVolumeValueHtml() : '<div class="vol-val">' + fmtNumber(currentMetrics.asin_purchases) + '</div>') + '</div>';
      html += '</div>';
      var sqpFooter = [
        '<span>Source: <strong>SQP</strong></span>',
        '<span>Scope: <strong>' + selection.scopeType + '</strong></span>',
        '<span>Roots: <strong>' + selection.rootIds.length + '</strong></span>',
        '<span>SQP terms: <strong>' + selection.selectedIds.length + ' / ' + selection.allIds.length + '</strong></span>',
        '<span>Table week: <strong>' + escapeHtml(selectedWeekLabel) + '</strong></span>',
        '<span>Chart history: <strong>' + escapeHtml(baselineWindowLabel) + '</strong></span>'
      ];
      html += buildSqpWeeklyGraphHtml(sqpFooter, baselineWindowLabel, anchorWeekLabel);
    } else {
      html += '<div class="volume-strip">';
      html += '<div class="vol-item"><div class="vol-label">Query Volume</div>' + blankVolumeValueHtml() + '</div>';
      html += '<div class="vol-item"><div class="vol-label">Market Purchases</div>' + blankVolumeValueHtml() + '</div>';
      html += '<div class="vol-item"><div class="vol-label">Our Purchases</div>' + blankVolumeValueHtml() + '</div>';
      html += '</div>';
      html += buildEmptyFunnelGraphHtml(
        'No terms selected in the chosen roots. Use the table below to reselect SQP terms.',
        [
          '<span>Source: <strong>SQP</strong></span>',
          '<span>Scope: <strong>' + selection.scopeType + '</strong></span>',
          '<span>Roots: <strong>' + selection.rootIds.length + '</strong></span>',
          '<span>SQP terms: <strong>' + selection.selectedIds.length + ' / ' + selection.allIds.length + '</strong></span>',
          '<span>Table week: <strong>' + escapeHtml(selectedWeekLabel) + '</strong></span>',
          '<span>Chart history: <strong>' + escapeHtml(baselineWindowLabel) + '</strong></span>'
        ]
      );
    }

    html += buildSqpTermsTableHtml(selection);
    html += '</div></div></div>';
    panel.innerHTML = html;

    panel.querySelectorAll("[data-sqp-root-row]").forEach(function(row) {
      row.addEventListener("click", function(event) {
        if (event.target.closest("[data-sqp-root-checkbox]")) {
          return;
        }
        if (event.target.closest("[data-sqp-root-toggle]")) {
          return;
        }
        var rootId = row.getAttribute("data-sqp-root-row");
        var state = rootSelectionState(rootId);
        setRootSelection(rootId, !state.checked);
      });
      row.addEventListener("keydown", function(event) {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          row.click();
        }
      });
    });
    panel.querySelectorAll("[data-sqp-root-checkbox]").forEach(function(input) {
      input.addEventListener("click", function(event) {
        event.stopPropagation();
      });
      input.addEventListener("change", function() {
        setRootSelection(input.getAttribute("data-sqp-root-checkbox"), input.checked);
      });
    });
    panel.querySelectorAll("[data-sqp-root-toggle]").forEach(function(button) {
      button.addEventListener("click", function(event) {
        event.stopPropagation();
        toggleRootExpansion(button.getAttribute("data-sqp-root-toggle"));
      });
    });
    panel.querySelectorAll("[data-sqp-term-row]").forEach(function(row) {
      row.addEventListener("click", function(event) {
        if (event.target.closest("[data-sqp-term-checkbox]")) {
          return;
        }
        selectTerm(row.getAttribute("data-sqp-term-root"), row.getAttribute("data-sqp-term-row"));
      });
      row.addEventListener("keydown", function(event) {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          row.click();
        }
      });
    });
    panel.querySelectorAll("[data-sqp-term-checkbox]").forEach(function(input) {
      input.addEventListener("click", function(event) {
        event.stopPropagation();
      });
      input.addEventListener("change", function() {
        var row = input.closest("[data-sqp-term-row]");
        selectTerm(row.getAttribute("data-sqp-term-root"), input.getAttribute("data-sqp-term-checkbox"));
      });
    });
    var sqpAllTermsCheckbox = panel.querySelector("[data-sqp-all-terms-checkbox]");
    if (sqpAllTermsCheckbox) {
      sqpAllTermsCheckbox.indeterminate = selection.selectedIds.length > 0 && !selection.isAllSelected;
      sqpAllTermsCheckbox.addEventListener("click", function(event) {
        event.stopPropagation();
      });
      sqpAllTermsCheckbox.addEventListener("change", function() {
        if (sqpAllTermsCheckbox.checked) {
          selectAllRoots();
          return;
        }
        clearAllRoots();
      });
    }
    var sqpSelectAllBtn = panel.querySelector("[data-sqp-all]");
    var sqpClearBtn = panel.querySelector("[data-sqp-none]");
    var sqpExpandBtn = panel.querySelector("[data-sqp-expand-all]");
    var sqpCollapseBtn = panel.querySelector("[data-sqp-collapse-all]");
    if (sqpSelectAllBtn) {
      sqpSelectAllBtn.addEventListener("click", function() {
        selectAllRoots();
      });
    }
    if (sqpClearBtn) {
      sqpClearBtn.addEventListener("click", function() {
        clearAllRoots();
      });
    }
    if (sqpExpandBtn) {
      sqpExpandBtn.addEventListener("click", function() {
        expandedRootIds = new Set(allRootIds());
        renderFunnel();
      });
    }
    if (sqpCollapseBtn) {
      sqpCollapseBtn.addEventListener("click", function() {
        expandedRootIds = new Set();
        renderFunnel();
      });
    }
    panel.querySelectorAll("[data-sqp-sort]").forEach(function(header) {
      header.addEventListener("click", function() {
        toggleSqpTableSort(header.getAttribute("data-sqp-sort"));
      });
    });
    syncSqpSelectionUi();
    if (metrics !== null && selection.scopeType !== "no-terms") {
      renderSqpWeeklyChart(selection.weekly);
      document.querySelectorAll("[data-sqp-toggle]").forEach(function(btn) {
        btn.addEventListener("click", function() {
          var key = btn.getAttribute("data-sqp-toggle");
          sqpWowVisible[key] = !sqpWowVisible[key];
          btn.classList.toggle("active", sqpWowVisible[key]);
          renderSqpWeeklyChart(selection.weekly);
        });
      });
    }
  }

  function renderScpPanel() {
    var panel = document.getElementById("scp-panel");
    if (!panel) {
      return;
    }
    var scpData = activeData.scp;
    if (!scpData || !scpData.asins || scpData.asins.length === 0) {
      panel.innerHTML = '<div class="panel funnel-empty"><div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--dim);font-size:12px;letter-spacing:0.04em;">No SCP data for the selected window</div></div>';
      return;
    }
    if (!hasInitializedScpSelection) {
      selectedScpAsinIds = new Set(allScpAsinIds());
      hasInitializedScpSelection = true;
      renderScpPanel();
      return;
    }

    var baselineWindowLabel = windowRangeLabel(activeData.meta.baselineWindow);
    var anchorWeekLabel = activeData.meta.anchorWeek;
    var selection = activeScpSelection();
    var metrics = selection.current;
    var scpBlankTopValues = selection.scopeType === "empty";
    var html = '<div class="panel"><div class="funnel-report funnel-report-sqp">';
    html += '<div class="funnel-hero">';
    html += '<h1 class="funnel-hero-name">Search Catalog Performance</h1>';
    html += '<div class="funnel-hero-meta">Catalog search funnel · ' + escapeHtml(selectedWeekLabel) + '</div>';
    html += '</div>';
    html += '<div class="volume-strip">';
    html += '<div class="vol-item"><div class="vol-label">Search Impressions</div>' + (scpBlankTopValues ? blankVolumeValueHtml() : '<div class="vol-val">' + fmtNumber(metrics.impressions) + '</div>') + '</div>';
    html += '<div class="vol-item"><div class="vol-label">Search Purchases</div>' + (scpBlankTopValues ? blankVolumeValueHtml() : '<div class="vol-val">' + fmtNumber(metrics.purchases) + '</div>') + '</div>';
    html += '<div class="vol-item"><div class="vol-label">Search Sales</div>' + (scpBlankTopValues ? blankVolumeValueHtml() : '<div class="vol-val">' + fmtMoney(metrics.sales) + '</div>') + '</div>';
    html += '</div>';
    var footerParts = [
      '<span>Source: <strong>SCP</strong></span>',
      '<span>Scope: <strong>catalog search</strong></span>',
      '<span>ASINs: <strong>' + selection.selectedIds.length + ' / ' + selection.allIds.length + '</strong></span>',
      '<span>Target ASIN: <strong>' + escapeHtml(scpData.meta.targetAsin) + '</strong></span>',
      '<span>Table week: <strong>' + escapeHtml(selectedWeekLabel) + '</strong></span>',
      '<span>Chart history: <strong>' + escapeHtml(baselineWindowLabel) + '</strong></span>'
    ];

    if (selection.scopeType === "empty") {
      html += buildEmptyFunnelGraphHtml('No ASINs selected. Use the table below to filter SCP rows.', footerParts);
    } else {
      html += buildScpWeeklyGraphHtml(footerParts, baselineWindowLabel, anchorWeekLabel);
    }

    html += buildScpTableHtml(scpData, selection);
    html += '</div></div>';
    panel.innerHTML = html;

    var allCheckbox = panel.querySelector("[data-scp-all-checkbox]");
    if (allCheckbox) {
      allCheckbox.indeterminate = selection.selectedIds.length > 0 && !selection.isAllSelected;
      allCheckbox.addEventListener("click", function(event) {
        event.stopPropagation();
      });
      allCheckbox.addEventListener("change", function() {
        setAllScpAsinSelection(allCheckbox.checked);
      });
    }
    panel.querySelectorAll("[data-scp-asin-row]").forEach(function(row) {
      row.addEventListener("click", function(event) {
        if (event.target.closest("[data-scp-asin-checkbox]")) {
          return;
        }
        toggleScpAsinSelection(row.getAttribute("data-scp-asin-row"));
      });
    });
    panel.querySelectorAll("[data-scp-asin-checkbox]").forEach(function(input) {
      input.addEventListener("click", function(event) {
        event.stopPropagation();
      });
      input.addEventListener("change", function() {
        toggleScpAsinSelection(input.getAttribute("data-scp-asin-checkbox"));
      });
    });
    panel.querySelectorAll("[data-scp-sort]").forEach(function(header) {
      header.addEventListener("click", function() {
        toggleScpTableSort(header.getAttribute("data-scp-sort"));
      });
    });
    if (selection.scopeType !== "empty") {
      renderScpWeeklyChart(selection.weekly);
      document.querySelectorAll("[data-scp-toggle]").forEach(function(button) {
        button.addEventListener("click", function() {
          var key = button.getAttribute("data-scp-toggle");
          scpWowVisible[key] = !scpWowVisible[key];
          button.classList.toggle("active", scpWowVisible[key]);
          renderScpWeeklyChart(selection.weekly);
        });
      });
    }
  }

  function renderBusinessReportsPanel() {
    var panel = document.getElementById("br-panel");
    if (!panel) {
      return;
    }
    var brData = activeData.businessReports;
    if (!brData || !brData.asins || brData.asins.length === 0) {
      panel.innerHTML = '<div class="panel funnel-empty"><div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--dim);font-size:12px;letter-spacing:0.04em;">No Business Reports data in the available history</div></div>';
      return;
    }
    if (!hasInitializedBrSelection) {
      selectedBrAsinIds = new Set(allBrAsinIds());
      hasInitializedBrSelection = true;
      renderBusinessReportsPanel();
      return;
    }

    var anchorWeekLabel = activeData.meta.anchorWeek;
    var baselineWindowLabel = windowRangeLabel(activeData.meta.baselineWindow);
    var selection = activeBusinessSelection();
    var selectedRecord = selectedWeekRecord(selection.weekly);
    var metrics = selection.current;
    var dailySeries = brData.dailyByWeek && brData.dailyByWeek[selectedWeekLabel] ? brData.dailyByWeek[selectedWeekLabel] : [];
    var dailyWindowLabel = dailySeries.length ? (dailySeries[0].day_label + ' to ' + dailySeries[dailySeries.length - 1].day_label) : "No daily business-report history";
    var chartWindowLabel = brViewMode === "daily" ? dailyWindowLabel : baselineWindowLabel;
    var blankTopValues = selection.scopeType === "empty" || selectedRecord === null;
    var html = '<div class="panel"><div class="funnel-report funnel-report-sqp">';
    html += '<div class="funnel-hero">';
    html += '<h1 class="funnel-hero-name">Business Reports</h1>';
    html += '<div class="funnel-hero-meta">Retail detail-page metrics · ' + escapeHtml(selectedWeekLabel) + '</div>';
    html += '</div>';
    html += '<div class="volume-strip">';
    html += '<div class="vol-item"><div class="vol-label">Sessions</div>' + (blankTopValues ? blankVolumeValueHtml() : '<div class="vol-val">' + fmtNumber(metrics.sessions) + '</div>') + '</div>';
    html += '<div class="vol-item"><div class="vol-label">Order Item %</div>' + (blankTopValues ? blankVolumeValueHtml() : '<div class="vol-val">' + fmtPct(metrics.order_item_session_percentage) + '</div>') + '</div>';
    html += '<div class="vol-item"><div class="vol-label">Unit Session %</div>' + (blankTopValues ? blankVolumeValueHtml() : '<div class="vol-val">' + fmtPct(metrics.unit_session_percentage) + '</div>') + '</div>';
    html += '</div>';
    var footerParts = [
      '<span>Source: <strong>Business Reports</strong></span>',
      '<span>Scope: <strong>detail page retail</strong></span>',
      '<span>ASINs: <strong>' + selection.selectedIds.length + ' / ' + selection.allIds.length + '</strong></span>',
      '<span>Target ASIN: <strong>' + escapeHtml(brData.meta.targetAsin) + '</strong></span>',
      '<span>Table week: <strong>' + escapeHtml(selectedWeekLabel) + '</strong></span>',
      '<span>Chart window: <strong>' + escapeHtml(chartWindowLabel) + '</strong></span>'
    ];

    if (selection.scopeType === "empty") {
      html += buildEmptyFunnelGraphHtml('No ASINs selected. Use the table below to filter Business Reports rows.', footerParts);
    } else if (brViewMode === "daily" && dailySeries.length === 0) {
      html += buildEmptyFunnelGraphHtml('No Business Reports ByDate data is available for ' + escapeHtml(selectedWeekLabel) + '.', footerParts);
    } else {
      html += buildBusinessReportsWeeklyGraphHtml(footerParts, chartWindowLabel, anchorWeekLabel);
    }

    html += buildBusinessReportsTableHtml(brData, selection);
    html += '</div></div>';
    panel.innerHTML = html;

    var allCheckbox = panel.querySelector("[data-br-all-checkbox]");
    if (allCheckbox) {
      allCheckbox.indeterminate = selection.selectedIds.length > 0 && !selection.isAllSelected;
      allCheckbox.addEventListener("click", function(event) {
        event.stopPropagation();
      });
      allCheckbox.addEventListener("change", function() {
        setAllBrAsinSelection(allCheckbox.checked);
      });
    }
    panel.querySelectorAll("[data-br-asin-row]").forEach(function(row) {
      row.addEventListener("click", function(event) {
        if (event.target.closest("[data-br-asin-checkbox]")) {
          return;
        }
        toggleBrAsinSelection(row.getAttribute("data-br-asin-row"));
      });
    });
    panel.querySelectorAll("[data-br-asin-checkbox]").forEach(function(input) {
      input.addEventListener("click", function(event) {
        event.stopPropagation();
      });
      input.addEventListener("change", function() {
        toggleBrAsinSelection(input.getAttribute("data-br-asin-checkbox"));
      });
    });
    panel.querySelectorAll("[data-br-sort]").forEach(function(header) {
      header.addEventListener("click", function() {
        toggleBrTableSort(header.getAttribute("data-br-sort"));
      });
    });
    if (selection.scopeType !== "empty" && (brViewMode === "weekly" || dailySeries.length > 0)) {
      if (brViewMode === "daily") {
        renderBusinessReportsDailyChart(dailySeries);
      } else {
        renderBusinessReportsWeeklyChart(selection.weekly);
      }
      document.querySelectorAll("[data-br-view]").forEach(function(button) {
        button.addEventListener("click", function() {
          brViewMode = button.getAttribute("data-br-view");
          renderBusinessReportsPanel();
        });
      });
      document.querySelectorAll("[data-br-toggle]").forEach(function(button) {
        button.addEventListener("click", function() {
          var key = button.getAttribute("data-br-toggle");
          brWowVisible[key] = !brWowVisible[key];
          button.classList.toggle("active", brWowVisible[key]);
          if (brViewMode === "daily") {
            renderBusinessReportsDailyChart(dailySeries);
            return;
          }
          renderBusinessReportsWeeklyChart(selection.weekly);
        });
      });
    }
  }

  /* ===== COMPETITOR TAB ===== */

  function renderCompetitorTab() {
    renderCompetitorPanel();
  }

  function renderChangeLogTab() {
    var container = document.getElementById("change-log-panel");
    if (!container) {
      return;
    }
    var entries = reportData.changeLogByWeek[selectedWeekLabel];
    if (!entries || entries.length === 0) {
      container.innerHTML = '<div class="panel"><div class="panel-body panel-body-change-log"><div class="competitor-empty">No tracked changes in the available history.</div></div></div>';
      return;
    }

    var html = '<div class="panel">';
    html += '<div class="panel-head">';
    html += '<span class="panel-title">Change Log</span>';
    html += '<div class="panel-head-tools">';
    html += '<span class="panel-badge">' + entries.length + ' tracked changes</span>';
    html += '<span class="panel-badge">Through ' + escapeHtml(selectedWeekLabel) + '</span>';
    html += '</div>';
    html += '</div>';
    html += '<div class="panel-body panel-body-change-log">';
    html += '<div class="change-log-table-wrap"><table class="change-log-table"><thead><tr>';
    html += '<th style="width:72px;">Week</th>';
    html += '<th style="width:156px;">Date</th>';
    html += '<th style="width:92px;">Source</th>';
    html += '<th style="width:92px;">Type</th>';
    html += '<th style="width:280px;">Title</th>';
    html += '<th>Summary</th>';
    html += '<th style="width:180px;">ASINs</th>';
    html += '<th style="width:180px;">Fields</th>';
    html += '</tr></thead><tbody>';
    entries.forEach(function(entry) {
      var tagClass = entry.kind === "manual" ? "change-tag-manual" : "change-tag-listing";
      var summary = entry.summary;
      if (!summary && entry.highlights && entry.highlights.length > 0) {
        summary = entry.highlights.join(" | ");
      }
      var asins = entry.asins && entry.asins.length > 0 ? entry.asins.join(", ") : "—";
      var fields = entry.field_labels && entry.field_labels.length > 0 ? entry.field_labels.join(", ") : "—";
      html += '<tr>';
      html += '<td><span class="change-log-week">W' + escapeHtml(entry.week_label.replace(/^W/, "")) + '</span></td>';
      html += '<td><div class="change-log-date">' + escapeHtml(entry.date_label) + '</div></td>';
      html += '<td><span class="change-tag change-tag-source">' + escapeHtml(entry.source) + '</span></td>';
      html += '<td><span class="change-tag ' + tagClass + '">' + escapeHtml(entry.category) + '</span></td>';
      html += '<td><div class="change-log-title change-log-cell-compact">' + escapeHtml(entry.title) + '</div></td>';
      html += '<td><div class="change-log-summary change-log-cell-compact">' + escapeHtml(summary || "—") + '</div></td>';
      html += '<td><div class="change-log-cell-compact">' + escapeHtml(asins) + '</div></td>';
      html += '<td><div class="change-log-cell-compact">' + escapeHtml(fields) + '</div></td>';
      html += '</tr>';
    });
    html += '</tbody></table></div>';
    html += '</div>';
    html += '</div>';
    container.innerHTML = html;
  }

  function renderCompetitorRootTable() {
    var tbody = document.getElementById("competitor-root-tbody");
    var panel = document.getElementById("competitor-panel");
    tbody.innerHTML = "";

    var clusters = activeData.clusters.slice();

    if (!clusters.length) {
      tbody.innerHTML = '<tr><td colspan="3" style="padding:18px 12px;color:var(--dim);font-size:11px;">No roots available for TST comparison.</td></tr>';
      panel.innerHTML = '<div class="panel funnel-empty"><div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--dim);font-size:12px;letter-spacing:0.04em;">No TST data for the selected week</div></div>';
      return;
    }

    var families = {};
    var familyOrder = [];
    clusters.forEach(function(c) {
      if (!families[c.family]) {
        families[c.family] = [];
        familyOrder.push(c.family);
      }
      families[c.family].push(c);
    });

    familyOrder.forEach(function(family) {
      families[family].sort(function(a, b) {
        return compareSortValues(
          sqpSortValueForCluster(a, sqpTableSort.key),
          sqpSortValueForCluster(b, sqpTableSort.key),
          sqpTableSort.dir,
          sqpTableSort.key === "term" ? "text" : "number"
        );
      });
      var groupRow = document.createElement("tr");
      groupRow.innerHTML = '<td colspan="3" class="family-group">' + escapeHtml(family.toUpperCase()) + '</td>';
      tbody.appendChild(groupRow);

      families[family].forEach(function(cluster) {
        var recentCoverage = selectedWeekTstCompare(cluster.tstCompare.weekly).coverage;
        var row = document.createElement("tr");
        row.className = "root-row";
        row.setAttribute("data-competitor-root-id", cluster.id);
        row.innerHTML =
          '<td><div class="root-name"><label class="root-check"><input type="checkbox" data-competitor-root-checkbox="' + escapeHtml(cluster.id) + '"><span class="root-label-text">' + escapeHtml(cluster.cluster) + '</span></label></div>' +
          '<div class="root-indicators"><span class="ind ind-sqp">' + recentCoverage.terms_covered + ' terms</span></div></td>' +
          '<td>' + fmtPct(recentCoverage.avg_purchase_pool_share) + '</td>' +
          '<td>' + fmtPct(recentCoverage.avg_click_pool_share) + '</td>';
        row.addEventListener("click", function(event) {
          if (event.target.closest(".root-check")) {
            return;
          }
          var state = competitorRootSelectionState(cluster.id);
          setCompetitorRootSelection(cluster.id, !state.checked);
        });
        tbody.appendChild(row);
      });
    });

    tbody.querySelectorAll("[data-competitor-root-checkbox]").forEach(function(input) {
      input.addEventListener("click", function(event) {
        event.stopPropagation();
      });
      input.addEventListener("change", function() {
        setCompetitorRootSelection(input.getAttribute("data-competitor-root-checkbox"), input.checked);
      });
    });

    if (!hasInitializedCompetitorSelection) {
      setCompetitorRootSelection(clusters[0].id, true);
      return;
    }
    syncCompetitorSelectionUi();
    renderCompetitorPanel();
  }

  function renderCompetitorPanel() {
    var panel = document.getElementById("competitor-panel");
    if (!hasInitializedCompetitorSelection) {
      if (activeData.clusters.length > 0) {
        setCompetitorRootSelection(activeData.clusters[0].id, true);
        return;
      }
    }
    var selection = activeCompetitorSelection();
    if (activeData.clusters.length === 0) {
      panel.innerHTML = '<div class="panel funnel-empty"><div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--dim);font-size:12px;letter-spacing:0.04em;">No TST data for the selected window</div></div>';
      return;
    }

    var baselineWindowLabel = windowRangeLabel(activeData.meta.baselineWindow);
    var anchorWeekLabel = activeData.meta.anchorWeek;
    var competitor = activeData.clusters[0].tstCompare.competitor;
    if (selection.competitor != null) {
      competitor = selection.competitor;
    }
    var rootLabel = selection.rootLabels.slice(0, 3).join(', ');
    if (selection.rootLabels.length > 3) {
      rootLabel += ' +' + (selection.rootLabels.length - 3);
    }

    var html = '<div class="panel"><div class="funnel-report funnel-report-competitor">';
    html += '<div class="funnel-hero">';
    if (selection.scopeType === "empty") {
      html += '<h1 class="funnel-hero-name">TST Selection</h1>';
      html += '<div class="funnel-hero-meta">0 roots selected &middot; ' + escapeHtml(selectedWeekLabel) + '</div>';
    } else if (selection.scopeType === "no-terms") {
      html += '<h1 class="funnel-hero-name">' + (selection.rootIds.length > 1 ? selection.rootIds.length + ' Roots' : escapeHtml(selection.rootLabels[0])) + '</h1>';
      html += '<div class="funnel-hero-meta">' + escapeHtml(rootLabel) + ' &middot; 0 terms selected &middot; ' + escapeHtml(selectedWeekLabel) + '</div>';
    } else {
      html += '<h1 class="funnel-hero-name">' + (selection.scopeType === "multi-root" ? selection.rootIds.length + ' Roots' : escapeHtml(selection.rootLabels[0])) + '</h1>';
      html += '<div class="funnel-hero-meta">' + escapeHtml(rootLabel) + ' &middot; ' + escapeHtml(selectedWeekLabel) + '</div>';
    }
    html += '</div>';

    if (selection.scopeType === "empty") {
      html += '<div class="volume-strip">';
      html += '<div class="vol-item"><div class="vol-label">Terms Covered</div>' + blankVolumeValueHtml() + '</div>';
      html += '<div class="vol-item"><div class="vol-label">Term-Weeks</div>' + blankVolumeValueHtml() + '</div>';
      html += '<div class="vol-item"><div class="vol-label">Our Click Share</div>' + blankVolumeValueHtml() + '</div>';
      html += '<div class="vol-item"><div class="vol-label">' + escapeHtml(competitor.brand) + ' Click Share</div>' + blankVolumeValueHtml() + '</div>';
      html += '</div>';
      html += buildEmptyFunnelGraphHtml(
        'Use the table below to select roots and TST terms for the TST view.',
        [
          '<span>Source: <strong>TST</strong></span>',
          '<span>Scope: <strong>' + selection.scopeType + '</strong></span>',
          '<span>Roots: <strong>' + selection.rootIds.length + '</strong></span>',
          '<span>TST terms: <strong>' + selection.selectedTermIds.length + ' / ' + selection.allTermIds.length + '</strong></span>',
          '<span>Table week: <strong>' + escapeHtml(selectedWeekLabel) + '</strong></span>',
          '<span>Chart history: <strong>' + escapeHtml(baselineWindowLabel) + '</strong></span>'
        ]
      );
      html += buildCompetitorTermsTableHtml(selection, competitor);
    } else {
      var current = selection.current;
      var coverage = current.coverage;
      var observed = current.observed;
      var competitorBlankTopValues = selection.scopeType === "no-terms";
      html += '<div class="volume-strip">';
      html += '<div class="vol-item"><div class="vol-label">Terms Covered</div>' + (competitorBlankTopValues ? blankVolumeValueHtml() : '<div class="vol-val">' + coverage.terms_covered + '</div>') + '</div>';
      html += '<div class="vol-item"><div class="vol-label">Term-Weeks</div>' + (competitorBlankTopValues ? blankVolumeValueHtml() : '<div class="vol-val">' + coverage.term_weeks_covered + '</div>') + '</div>';
      html += '<div class="vol-item"><div class="vol-label">Our Click Share</div>' + (competitorBlankTopValues ? blankVolumeValueHtml() : '<div class="vol-val">' + fmtPct(observed.our_click_share) + '</div>') + '</div>';
      html += '<div class="vol-item"><div class="vol-label">' + escapeHtml(competitor.brand) + ' Click Share</div>' + (competitorBlankTopValues ? blankVolumeValueHtml() : '<div class="vol-val">' + fmtPct(observed.competitor_click_share) + '</div>') + '</div>';
      html += '</div>';

      if (selection.scopeType === "no-terms") {
        var noTermsFooter = [
          '<span>Source: <strong>TST</strong></span>',
          '<span>Scope: <strong>' + selection.scopeType + '</strong></span>',
          '<span>Roots: <strong>' + selection.rootIds.length + '</strong></span>',
          '<span>TST terms: <strong>' + selection.selectedTermIds.length + ' / ' + selection.allTermIds.length + '</strong></span>',
          '<span>Table week: <strong>' + escapeHtml(selectedWeekLabel) + '</strong></span>',
          '<span>Chart history: <strong>' + escapeHtml(baselineWindowLabel) + '</strong></span>'
        ];
        html += buildEmptyFunnelGraphHtml(
          'No terms selected. Use the table below to reselect TST terms.',
          noTermsFooter
        );
        html += buildCompetitorTermsTableHtml(selection, competitor);
        html += '</div></div>';
        panel.innerHTML = html;
        return;
      }
      var competitorFooter = [
        '<span>Covered terms: <strong>' + coverage.terms_covered + ' / ' + selection.allTermIds.length + '</strong></span>',
        '<span>Term-weeks: <strong>' + coverage.term_weeks_covered + '</strong></span>',
        '<span>TST rows capture: <strong>' + fmtPct(coverage.avg_click_pool_share) + ' clicks</strong></span>',
        '<span>TST rows capture: <strong>' + fmtPct(coverage.avg_purchase_pool_share) + ' purchases</strong></span>',
        '<span>Table week: <strong>' + escapeHtml(selectedWeekLabel) + '</strong></span>',
        '<span>Chart history: <strong>' + escapeHtml(baselineWindowLabel) + '</strong></span>'
      ];
      html += buildCompetitorWeeklyGraphHtml(competitorFooter, competitor, baselineWindowLabel, anchorWeekLabel);
      html += buildCompetitorTermsTableHtml(selection, competitor);
    }
    html += '</div></div>';
    panel.innerHTML = html;
    if (selection.scopeType !== "empty" && selection.scopeType !== "no-terms") {
      renderCompetitorWeeklyChart(selection.weekly, competitor);
      document.querySelectorAll("[data-comp-toggle]").forEach(function(btn) {
        btn.addEventListener("click", function() {
          var key = btn.getAttribute("data-comp-toggle");
          compWowVisible[key] = !compWowVisible[key];
          btn.classList.toggle("active", compWowVisible[key]);
          renderCompetitorWeeklyChart(selection.weekly, competitor);
        });
      });
    }

    panel.querySelectorAll("[data-competitor-root-row]").forEach(function(row) {
      row.addEventListener("click", function(event) {
        if (event.target.closest("[data-competitor-root-checkbox]")) {
          return;
        }
        if (event.target.closest("[data-competitor-root-toggle]")) {
          return;
        }
        var rootId = row.getAttribute("data-competitor-root-row");
        var state = competitorRootSelectionState(rootId);
        setCompetitorRootSelection(rootId, !state.checked);
      });
    });
    panel.querySelectorAll("[data-competitor-root-checkbox]").forEach(function(input) {
      input.addEventListener("click", function(event) {
        event.stopPropagation();
      });
      input.addEventListener("change", function() {
        setCompetitorRootSelection(input.getAttribute("data-competitor-root-checkbox"), input.checked);
      });
    });
    panel.querySelectorAll("[data-competitor-root-toggle]").forEach(function(button) {
      button.addEventListener("click", function(event) {
        event.stopPropagation();
        toggleCompetitorRootExpansion(button.getAttribute("data-competitor-root-toggle"));
      });
    });
    panel.querySelectorAll("[data-competitor-term-row]").forEach(function(row) {
      row.addEventListener("click", function(event) {
        if (event.target.closest("[data-competitor-term-checkbox]")) {
          return;
        }
        selectCompetitorTerm(row.getAttribute("data-competitor-term-row"));
      });
    });
    panel.querySelectorAll("[data-competitor-term-checkbox]").forEach(function(input) {
      input.addEventListener("click", function(event) {
        event.stopPropagation();
      });
      input.addEventListener("change", function() {
        selectCompetitorTerm(input.getAttribute("data-competitor-term-checkbox"));
      });
    });
    var competitorAllTermsCheckbox = panel.querySelector("[data-competitor-all-terms-checkbox]");
    if (competitorAllTermsCheckbox) {
      var competitorAllTermsSelected = selection.allTermIds.length > 0 && selection.selectedTermIds.length === selection.allTermIds.length;
      competitorAllTermsCheckbox.indeterminate = selection.selectedTermIds.length > 0 && !competitorAllTermsSelected;
      competitorAllTermsCheckbox.addEventListener("click", function(event) {
        event.stopPropagation();
      });
      competitorAllTermsCheckbox.addEventListener("change", function() {
        if (competitorAllTermsCheckbox.checked) {
          selectAllCompetitorRoots();
          return;
        }
        clearAllCompetitorRoots();
      });
    }
    var competitorSelectAll = panel.querySelector("[data-competitor-all]");
    if (competitorSelectAll) {
      competitorSelectAll.addEventListener("click", function() {
        selectAllCompetitorRoots();
      });
    }
    var competitorClear = panel.querySelector("[data-competitor-none]");
    if (competitorClear) {
      competitorClear.addEventListener("click", function() {
        clearAllCompetitorRoots();
      });
    }
    var competitorExpandAll = panel.querySelector("[data-competitor-expand-all]");
    if (competitorExpandAll) {
      competitorExpandAll.addEventListener("click", function() {
        expandedCompetitorRootIds = new Set(allRootIds());
        renderCompetitorPanel();
      });
    }
    var competitorCollapseAll = panel.querySelector("[data-competitor-collapse-all]");
    if (competitorCollapseAll) {
      competitorCollapseAll.addEventListener("click", function() {
        expandedCompetitorRootIds = new Set();
        renderCompetitorPanel();
      });
    }
    panel.querySelectorAll("[data-competitor-sort]").forEach(function(header) {
      header.addEventListener("click", function() {
        toggleCompetitorTableSort(header.getAttribute("data-competitor-sort"));
      });
    });
    syncCompetitorSelectionUi();
  }

  /* ===== COMPARE TAB ===== */

  function renderCompareTab() {
    syncCompareOrganicUi();
    renderBrandMetrics();
    renderPpcBars();
    renderCompareOrganic();
  }

  function syncCompareOrganicUi() {
    var badge = document.getElementById("compare-organic-badge");
    if (badge) {
      badge.textContent = compareOrganicMode === "map" ? "Demand vs Rank" : "Trend + heatmap";
    }
    document.querySelectorAll("[data-compare-organic-mode]").forEach(function(button) {
      var mode = button.getAttribute("data-compare-organic-mode");
      var isActive = mode === compareOrganicMode;
      button.classList.toggle("active", isActive);
      button.setAttribute("aria-pressed", isActive ? "true" : "false");
    });
    document.querySelectorAll("[data-compare-organic-view]").forEach(function(view) {
      var mode = view.getAttribute("data-compare-organic-view");
      view.classList.toggle("active", mode === compareOrganicMode);
    });
  }

  function setCompareOrganicMode(nextMode) {
    if (nextMode !== "map" && nextMode !== "trend") return;
    if (compareOrganicMode === nextMode) return;
    compareOrganicMode = nextMode;
    hideTooltip();
    syncCompareOrganicUi();
    renderCompareOrganic();
  }

  function initCompareControls() {
    document.querySelectorAll("[data-compare-organic-mode]").forEach(function(button) {
      button.addEventListener("click", function() {
        setCompareOrganicMode(button.getAttribute("data-compare-organic-mode"));
      });
    });
    syncCompareOrganicUi();
  }

  function renderCompareOrganic() {
    if (compareOrganicMode === "map") {
      renderScatter();
      return;
    }
    renderRankTrend();
    renderRankHeatmap();
  }

  function renderBrandMetrics() {
    var container = document.getElementById("brand-metrics-chart");
    if (!container) return;
    var data = activeData.brandMetrics;
    if (!data) { container.innerHTML = '<div style="padding:20px;color:var(--dim);font-size:11px;">No brand metrics data</div>'; return; }

    var weekKeys = activeData.weeks.filter(function(w) { return data[w]; });
    if (!weekKeys.length) { container.innerHTML = '<div style="padding:20px;color:var(--dim);font-size:11px;">No brand metrics data</div>'; return; }

    var rect = container.getBoundingClientRect();
    var width = Math.max(480, Math.round(rect.width));
    var height = Math.max(220, Math.round(rect.height));
    var svg = createSvg(container, width, height);
    var margin = { top: 18, right: 100, bottom: 26, left: 50 };

    var series = [
      { key: "awareness", label: "Awareness", color: "#8fc7ff" },
      { key: "consideration", label: "Consideration", color: "#77dfd0" },
      { key: "purchase", label: "Purchase", color: "#d5ff62" }
    ];

    var allValues = [];
    weekKeys.forEach(function(w) {
      var d = data[w];
      series.forEach(function(s) { if (d[s.key] != null && d[s.key] > 0) allValues.push(d[s.key]); });
    });
    var yMax = Math.max.apply(null, allValues.concat([0.01]));

    var xScale = scaleLinear(0, Math.max(weekKeys.length - 1, 1), margin.left, width - margin.right);
    var yScale = scaleLinear(0, yMax * 1.1, height - margin.bottom, margin.top);
    var weekSeries = weekKeys.map(function(weekLabel) { return { week_label: weekLabel }; });
    var changeInfo = changeWeekInfoForAnchor();

    weekKeys.forEach(function(w, i) {
      if (i % 2 === 0) {
        var label = appendSvg(svg, "text", { x: xScale(i), y: height - 6, fill: "#93a399", "font-size": 9, "text-anchor": "middle" });
        label.textContent = w;
      }
    });

    drawWeeklyChangeMarkers(svg, weekSeries, xScale, margin.top, height - margin.bottom);

    var hoverGuide = appendSvg(svg, "line", {
      x1: margin.left, x2: margin.left, y1: margin.top, y2: height - margin.bottom,
      stroke: "rgba(241,235,222,0.28)", "stroke-width": 1, "stroke-dasharray": "3 4", opacity: 0
    });
    var hoverDots = {};

    series.forEach(function(s) {
      var points = [];
      weekKeys.forEach(function(w, i) {
        var d = data[w];
        if (d[s.key] != null && d[s.key] > 0) points.push({ x: xScale(i), y: yScale(d[s.key]) });
      });
      if (!points.length) return;
      var d = points.map(function(p, idx) { return (idx === 0 ? "M" : "L") + " " + p.x.toFixed(1) + " " + p.y.toFixed(1); }).join(" ");
      appendSvg(svg, "path", { d: d, fill: "none", stroke: s.color, "stroke-width": 2, "stroke-linecap": "round", "stroke-linejoin": "round", opacity: 0.85 });
      var last = points[points.length - 1];
      var label = appendSvg(svg, "text", { x: last.x + 8, y: last.y + 4, fill: s.color, "font-size": 10 });
      label.textContent = s.label;
      hoverDots[s.key] = appendSvg(svg, "circle", {
        cx: last.x,
        cy: last.y,
        r: 4,
        fill: s.color,
        stroke: "#09100f",
        "stroke-width": 1.5,
        opacity: 0,
        "pointer-events": "none"
      });
    });

    weekKeys.forEach(function(w, i) {
      var x = xScale(i);
      var left = i === 0 ? margin.left : (xScale(i - 1) + x) / 2;
      var right = i === weekKeys.length - 1 ? width - margin.right : (x + xScale(i + 1)) / 2;
      var hitArea = appendSvg(svg, "rect", {
        x: left,
        y: margin.top,
        width: Math.max(right - left, 12),
        height: Math.max(height - margin.top - margin.bottom, 12),
        fill: "transparent"
      });
      hitArea.style.cursor = "pointer";
      hitArea.addEventListener("mouseenter", function(event) {
        hoverGuide.setAttribute("x1", String(x));
        hoverGuide.setAttribute("x2", String(x));
        hoverGuide.setAttribute("opacity", "1");
        var lines = ['<strong>' + escapeHtml(w) + '</strong>'];
        series.forEach(function(s) {
          var value = data[w][s.key];
          lines.push('<span style="color:' + s.color + '">' + escapeHtml(s.label) + ': ' + fmtNumber(value) + '</span>');
          var dot = hoverDots[s.key];
          if (dot && value != null) {
            dot.setAttribute("cx", String(x));
            dot.setAttribute("cy", String(yScale(Math.max(value, 0))));
            dot.setAttribute("opacity", "1");
          }
        });
        var marker = changeInfo.get(w);
        if (marker) {
          lines.push('<span style="color:rgba(241,235,222,0.6);border-top:1px solid rgba(255,255,255,0.1);padding-top:3px;display:inline-block;margin-top:2px;">' + marker.count + ' change' + (marker.count === 1 ? '' : 's') + '</span>');
          marker.titles.forEach(function(title) {
            lines.push('<span style="color:rgba(241,235,222,0.8);font-size:10px;">• ' + escapeHtml(title) + '</span>');
          });
        }
        showTooltip(event, lines.join('<br>'));
      });
      hitArea.addEventListener("mousemove", moveTooltip);
      hitArea.addEventListener("mouseleave", function() {
        hoverGuide.setAttribute("opacity", "0");
        Object.keys(hoverDots).forEach(function(key) {
          hoverDots[key].setAttribute("opacity", "0");
        });
        hideTooltip();
      });
    });
  }

  function renderScatter() {
    var container = document.getElementById("scatter-chart");
    if (!container) return;
    var allClusters = activeData.scatterClusterIds.map(function(id) { return clusterMap.get(id); }).filter(Boolean);
    var clusters = allClusters.filter(function(cluster) {
      return cluster.avg_rank != null && cluster.eligibility.rank_eligible;
    });
    if (!clusters.length) { container.innerHTML = '<div style="padding:40px 20px;text-align:center;color:var(--dim);font-size:11px;">No rank data available for scatter plot</div>'; return; }
    var rect = container.getBoundingClientRect();
    var width = Math.max(480, Math.round(rect.width));
    var height = Math.max(280, Math.round(rect.height));
    var svg = createSvg(container, width, height);
    var margin = { top: 28, right: 32, bottom: 48, left: 60 };

    var maxX = 18;
    var maxY = 30;
    var maxDemand = 1;
    clusters.forEach(function(c) {
      if ((c.purchase_share * 100) > maxX) maxX = c.purchase_share * 100;
      if (c.avg_rank > maxY) maxY = c.avg_rank;
      if (c.market_purchases > maxDemand) maxDemand = c.market_purchases;
    });
    maxY += 10;

    var xScale = scaleLinear(0, maxX * 1.06, margin.left, width - margin.right);
    var yRank = scaleLinear(0, maxY, height - margin.bottom, margin.top);
    var yTicks = buildAxisTicks(maxY, 5, 5);
    var xTicks = buildAxisTicks(maxX * 1.06, 4, 5);

    /* Grid */
    yTicks.forEach(function(tick) {
      appendSvg(svg, "line", { x1: margin.left, x2: width - margin.right, y1: yRank(tick), y2: yRank(tick), stroke: "rgba(255,255,255,0.06)", "stroke-width": 1 });
      var label = appendSvg(svg, "text", { x: margin.left - 10, y: yRank(tick) + 4, fill: "#93a399", "font-size": 10, "text-anchor": "end" });
      label.textContent = tick;
    });
    xTicks.forEach(function(tick) {
      appendSvg(svg, "line", { x1: xScale(tick), x2: xScale(tick), y1: margin.top, y2: height - margin.bottom, stroke: "rgba(255,255,255,0.05)", "stroke-width": 1 });
      var label = appendSvg(svg, "text", { x: xScale(tick), y: height - margin.bottom + 18, fill: "#93a399", "font-size": 10, "text-anchor": "middle" });
      label.textContent = tick + "%";
    });

    clusters.forEach(function(cluster) {
      var cx = xScale(cluster.purchase_share * 100);
      var cy = yRank(cluster.avg_rank);
      var r = 7 + Math.sqrt(cluster.market_purchases / maxDemand) * 24;
      var rankColor = colorForRank(cluster.avg_rank);
      var group = appendSvg(svg, "g", {});
      appendSvg(group, "circle", { cx: cx, cy: cy, r: r, fill: rankColor, opacity: 0.86, stroke: "rgba(255,255,255,0.42)", "stroke-width": 1.2 });
      if (cluster.market_purchases >= maxDemand * 0.35) {
        var label = appendSvg(group, "text", { x: cx + r + 6, y: cy + 4, fill: "#f1ebde", "font-size": 10, "font-weight": 600 });
        label.textContent = cluster.cluster;
      }
      group.addEventListener("mouseenter", function(e) {
        showTooltip(e, '<strong>' + escapeHtml(cluster.cluster) + '</strong><br>' +
          'Our purchase share: ' + fmtPct(cluster.purchase_share) + '<br>' +
          'Avg organic rank: ' + fmtRank(cluster.avg_rank) + '<br>' +
          'Root demand: ' + fmtNumber(cluster.market_purchases) + ' market purchases');
      });
      group.addEventListener("mousemove", moveTooltip);
      group.addEventListener("mouseleave", hideTooltip);
      group.style.cursor = "pointer";
    });

    var xLabel = appendSvg(svg, "text", { x: (width - margin.left - margin.right) / 2 + margin.left, y: height - 8, fill: "#93a399", "font-size": 11, "text-anchor": "middle" });
    xLabel.textContent = "Our purchase share within root (%)";
    var yLabel = appendSvg(svg, "text", { x: 16, y: (height - margin.top - margin.bottom) / 2 + margin.top, fill: "#93a399", "font-size": 11, transform: "rotate(-90 16 " + ((height - margin.top - margin.bottom) / 2 + margin.top) + ")", "text-anchor": "middle" });
    yLabel.textContent = "Organic rank (top = better)";
  }

  function renderRankTrend() {
    var container = document.getElementById("rank-trend-chart");
    if (!container) return;
    var clusters = activeData.lineClusterIds.map(function(id) { return clusterMap.get(id); }).filter(Boolean);
    if (!clusters.length) { container.innerHTML = '<div style="padding:40px 20px;text-align:center;color:var(--dim);font-size:11px;">No rank trend data</div>'; return; }
    var rect = container.getBoundingClientRect();
    var width = Math.max(480, Math.round(rect.width));
    var height = Math.max(220, Math.round(rect.height));
    var svg = createSvg(container, width, height);
    var margin = { top: 22, right: 22, bottom: 30, left: 44 };
    var weeks = activeData.weeks;

    var rankValues = [];
    clusters.forEach(function(c) { c.weekly.forEach(function(w) { if (w.avg_rank != null) rankValues.push(w.avg_rank); }); });
    var yMax = 30;
    rankValues.forEach(function(v) { if (v > yMax) yMax = v; });
    yMax += 8;

    var xScale = scaleLinear(0, Math.max(weeks.length - 1, 1), margin.left, width - margin.right);
    var yScale = scaleLinear(0, yMax, height - margin.bottom, margin.top);
    var weekSeries = weeks.map(function(weekLabel) { return { week_label: weekLabel }; });
    var changeInfo = changeWeekInfoForAnchor();

    drawWeeklyChangeMarkers(svg, weekSeries, xScale, margin.top, height - margin.bottom);

    buildAxisTicks(yMax, 5, 5).forEach(function(tick) {
      appendSvg(svg, "line", { x1: margin.left, x2: width - margin.right, y1: yScale(tick), y2: yScale(tick), stroke: "rgba(255,255,255,0.06)", "stroke-width": 1 });
    });
    weeks.forEach(function(week, index) {
      var x = xScale(index);
      var label = appendSvg(svg, "text", { x: x, y: height - 8, fill: "#93a399", "font-size": 9, "text-anchor": "middle" });
      label.textContent = week;
    });

    clusters.forEach(function(cluster) {
      var usable = [];
      cluster.weekly.forEach(function(w, i) { if (w.avg_rank != null) usable.push({ rank: w.avg_rank, i: i }); });
      if (!usable.length) return;
      var rankColor = colorForRank(cluster.avg_rank);
      var d = usable.map(function(p, idx) { return (idx === 0 ? "M" : "L") + " " + xScale(p.i).toFixed(1) + " " + yScale(p.rank).toFixed(1); }).join(" ");
      var group = appendSvg(svg, "g", {});
      appendSvg(group, "path", { d: d, fill: "none", stroke: rankColor, "stroke-width": 2.4, "stroke-linecap": "round", "stroke-linejoin": "round", opacity: 0.9 });
      usable.forEach(function(p) {
        appendSvg(group, "circle", { cx: xScale(p.i), cy: yScale(p.rank), r: 3, fill: colorForRank(p.rank), stroke: "#09100f", "stroke-width": 1 });
      });
      var last = usable[usable.length - 1];
      var label = appendSvg(group, "text", { x: xScale(last.i) + 8, y: yScale(last.rank) + 4, fill: rankColor, "font-size": 10, "font-weight": 600 });
      label.textContent = cluster.cluster;
    });

    var colW = weeks.length > 1 ? (xScale(1) - xScale(0)) : (width - margin.left - margin.right);
    var guide = appendSvg(svg, "line", {
      x1: 0, y1: margin.top, x2: 0, y2: height - margin.bottom,
      stroke: "rgba(255,255,255,0.15)", "stroke-width": 1, "pointer-events": "none", opacity: 0
    });
    weeks.forEach(function(weekLabel, index) {
      var rect = appendSvg(svg, "rect", {
        x: xScale(index) - colW / 2,
        y: margin.top,
        width: colW,
        height: height - margin.top - margin.bottom,
        fill: "transparent",
        cursor: "crosshair"
      });
      rect.addEventListener("mouseenter", function(event) {
        var lines = ['<strong>' + weekLabel + '</strong>'];
        clusters.forEach(function(cluster) {
          var week = cluster.weekly[index];
          lines.push('<span style="color:' + colorForRank(cluster.avg_rank) + '">' + escapeHtml(cluster.cluster) + ': ' + fmtRank(week ? week.avg_rank : null) + '</span>');
        });
        var marker = changeInfo.get(weekLabel);
        if (marker) {
          lines.push('<span style="color:rgba(241,235,222,0.6);border-top:1px solid rgba(255,255,255,0.1);padding-top:3px;display:inline-block;margin-top:2px;">' + marker.count + ' change' + (marker.count === 1 ? '' : 's') + '</span>');
          marker.titles.forEach(function(title) {
            lines.push('<span style="color:rgba(241,235,222,0.8);font-size:10px;">• ' + escapeHtml(title) + '</span>');
          });
        }
        showTooltip(event, lines.join('<br>'));
        guide.setAttribute("x1", xScale(index));
        guide.setAttribute("x2", xScale(index));
        guide.setAttribute("opacity", "1");
      });
      rect.addEventListener("mousemove", moveTooltip);
      rect.addEventListener("mouseleave", function() {
        hideTooltip();
        guide.setAttribute("opacity", "0");
      });
    });
  }

  function renderRankHeatmap() {
    var container = document.getElementById("rank-heatmap-chart");
    if (!container) return;
    var rect = container.getBoundingClientRect();
    var width = Math.max(480, Math.round(rect.width));
    var clusters = activeData.lineClusterIds.map(function(id) { return clusterMap.get(id); }).filter(Boolean);
    var weeks = activeData.weeks;
    var height = Math.max(60, 28 + clusters.length * 22);
    var svg = createSvg(container, width, height);
    var margin = { top: 20, right: 12, bottom: 6, left: 140 };
    var cellW = (width - margin.left - margin.right) / Math.max(weeks.length, 1);
    var cellH = (height - margin.top - margin.bottom) / Math.max(clusters.length, 1);

    weeks.forEach(function(week, index) {
      var label = appendSvg(svg, "text", { x: margin.left + index * cellW + cellW / 2, y: 14, fill: "#93a399", "font-size": 9, "text-anchor": "middle" });
      label.textContent = week;
    });
    clusters.forEach(function(cluster, rowIndex) {
      var y = margin.top + rowIndex * cellH;
      var label = appendSvg(svg, "text", { x: margin.left - 8, y: y + cellH / 2 + 3, fill: "#f1ebde", "font-size": 10, "text-anchor": "end" });
      label.textContent = cluster.cluster;
      cluster.weekly.forEach(function(week, colIndex) {
        var cell = appendSvg(svg, "rect", {
          x: margin.left + colIndex * cellW + 2, y: y + 1,
          width: Math.max(cellW - 4, 6), height: Math.max(cellH - 2, 8),
          rx: 5,
          fill: colorForRank(week.avg_rank),
          opacity: week.avg_rank == null ? 0.12 : 0.9,
          stroke: "rgba(255,255,255,0.06)",
          "stroke-width": 1
        });
        cell.addEventListener("mouseenter", function(e) {
          var html = '<strong>' + escapeHtml(cluster.cluster) + '</strong><br>' +
            'Week: ' + escapeHtml(week.week_label) + '<br>' +
            'Avg organic rank: ' + fmtRank(week.avg_rank) + '<br>' +
            'Purchase share: ' + fmtPct(week.purchase_share);
          if (week.avg_rank == null) {
            html += '<br><span style="color:#93a399;">No rank observation in this week.</span>';
          }
          showTooltip(e, html);
          cell.setAttribute("stroke", "rgba(213,255,98,0.9)");
          cell.setAttribute("stroke-width", "1.5");
        });
        cell.addEventListener("mousemove", moveTooltip);
        cell.addEventListener("mouseleave", function() {
          hideTooltip();
          cell.setAttribute("stroke", "rgba(255,255,255,0.06)");
          cell.setAttribute("stroke-width", "1");
        });
        cell.style.cursor = "pointer";
      });
    });
  }

  function renderPpcBars() {
    var container = document.getElementById("ppc-chart");
    if (!container) return;
    var clusters = activeData.ppcClusterIds.map(function(id) { return clusterMap.get(id); }).filter(Boolean);
    if (!clusters.length) { container.innerHTML = '<div style="padding:40px 20px;text-align:center;color:var(--dim);font-size:11px;">No PPC data available</div>'; return; }
    var rect = container.getBoundingClientRect();
    var width = Math.max(480, Math.round(rect.width));
    var height = 300;
    var svg = createSvg(container, width, height);
    var margin = { top: 18, right: 26, bottom: 20, left: 160 };
    var rowH = (height - margin.top - margin.bottom) / Math.max(clusters.length, 1);
    var maxSpend = 100;
    clusters.forEach(function(c) { if (c.ppc_spend > maxSpend) maxSpend = c.ppc_spend; });
    var xScale = scaleLinear(0, maxSpend * 1.08, margin.left, width - margin.right);

    clusters.forEach(function(cluster, index) {
      var y = margin.top + index * rowH;
      var group = appendSvg(svg, "g", {});
      var label = appendSvg(group, "text", { x: margin.left - 10, y: y + rowH / 2 + 4, fill: "#f1ebde", "font-size": 11, "text-anchor": "end" });
      label.textContent = cluster.cluster;
      appendSvg(group, "line", { x1: margin.left, x2: width - margin.right, y1: y + rowH / 2, y2: y + rowH / 2, stroke: "rgba(255,255,255,0.06)", "stroke-width": 8, "stroke-linecap": "round" });
      appendSvg(group, "line", { x1: margin.left, x2: xScale(cluster.ppc_spend), y1: y + rowH / 2, y2: y + rowH / 2, stroke: clusterColor(cluster), "stroke-width": 8, "stroke-linecap": "round" });
      var spendLabel = appendSvg(group, "text", { x: xScale(cluster.ppc_spend) + 8, y: y + rowH / 2 + 4, fill: "#f1ebde", "font-size": 10 });
      spendLabel.textContent = fmtMoney(cluster.ppc_spend) + " | ACOS " + fmtPct(cluster.ppc_acos);
      group.addEventListener("mouseenter", function(e) {
        showTooltip(e, '<strong>' + escapeHtml(cluster.cluster) + '</strong><br>' +
          'PPC Spend: ' + fmtMoney(cluster.ppc_spend) + '<br>' +
          'PPC Sales: ' + fmtMoney(cluster.ppc_sales) + '<br>' +
          'ACOS: ' + fmtPct(cluster.ppc_acos) + '<br>' +
          'PPC Clicks: ' + fmtNumber(cluster.ppc_clicks) + '<br>' +
          'PPC CVR: ' + fmtPct(cluster.ppc_cvr));
      });
      group.addEventListener("mousemove", moveTooltip);
      group.addEventListener("mouseleave", hideTooltip);
      group.style.cursor = "pointer";
    });
  }

  /* ===== SOURCES TAB ===== */

  var CRITICAL_SOURCES = ["SQP", "Rank Radar", "SP Search Term"];

  function renderSourceHeatmap() {
    var overview = reportData.sourceOverview;
    if (!overview) return;
    var container = document.getElementById("source-heatmap");
    var weekRange = document.getElementById("source-week-range");
    var weeks = overview.week_labels;
    var matrix = overview.matrix;
    var recentWindow = activeData.meta.recentWindow;
    var recentWindowSet = new Set(recentWindow);
    var anchorWeek = activeData.meta.anchorWeek;

    weekRange.textContent = "Anchor " + anchorWeek + " \u2022 Selected week " + recentWindow[0];

    var colCount = weeks.length + 1;
    var currentGroup = "";
    var html = '<div class="source-grid">';

    /* Header row */
    html += '<div class="source-row" style="grid-template-columns: 180px repeat(' + weeks.length + ', 1fr);">';
    html += '<div></div>';
    weeks.forEach(function(w) {
      var headerCls = 'source-header';
      if (recentWindowSet.has(w)) headerCls += ' source-header-window';
      if (w === anchorWeek) headerCls += ' source-header-anchor';
      html += '<div class="' + headerCls + '">' + escapeHtml(w) + '</div>';
    });
    html += '</div>';

    matrix.forEach(function(source) {
      if (source.group !== currentGroup) {
        currentGroup = source.group;
        html += '<div class="source-group-label">' + escapeHtml(currentGroup) + '</div>';
      }
      html += '<div class="source-row" style="grid-template-columns: 180px repeat(' + weeks.length + ', 1fr);">';
      html += '<div class="source-name">' + escapeHtml(source.name) + '</div>';
      var isCritical = CRITICAL_SOURCES.indexOf(source.name) !== -1;
      weeks.forEach(function(w) {
        var cell = source.weeks[w];
        var present = cell && cell.present;
        var cls;
        if (present) {
          cls = "source-present";
        } else if (isCritical) {
          cls = "source-critical";
        } else {
          cls = "source-missing";
        }
        if (recentWindowSet.has(w)) cls += " source-window";
        if (w === anchorWeek) cls += " source-anchor";
        var count = cell ? cell.file_count : 0;
        var title = present ? count + " file" + (count !== 1 ? "s" : "") + ": " + (cell.files ? cell.files.join(", ") : "") : "Missing";
        html += '<div class="source-cell ' + cls + '" title="' + escapeHtml(title) + '"></div>';
      });
      html += '</div>';
    });
    html += '</div>';
    container.innerHTML = html;
  }

  /* ===== RENDER ALL ===== */

  function renderAll() {
    renderFunnel();
    renderScpPanel();
    renderBusinessReportsPanel();
    renderCompetitorPanel();
    renderChangeLogTab();
    renderCompareTab();
    renderSourceHeatmap();
  }

  /* ===== INITIALIZATION ===== */

  setActiveWeek(reportData.defaultWeek);
  initWeekSelector();
  initTopControls();
  initTabs();
  initCompareControls();
  initRootSelectionControls();
  initCompetitorSelectionControls();
  renderAll();
</script>
</body>
</html>
"""
    return template.replace("__DATA__", data_json)



def build_payload(
    default_bundle: dict[str, object],
    week_order: list[str],
    week_start_dates: dict[str, str],
    source_overview: dict[str, object],
    windows_by_week: dict[str, dict[str, object]],
    change_log_by_week: dict[str, list[dict[str, object]]],
    audit_output: dict[str, object],
) -> dict[str, object]:
    return {
        "defaultWeek": str(default_bundle["meta"]["anchorWeek"]),
        "weeks": week_order,
        "weekStartDates": week_start_dates,
        "windowsByWeek": windows_by_week,
        "meta": default_bundle["meta"],
        "clusters": default_bundle["clusters"],
        "scatterClusterIds": default_bundle["scatterClusterIds"],
        "lineClusterIds": default_bundle["lineClusterIds"],
        "shareClusterIds": default_bundle["shareClusterIds"],
        "ppcClusterIds": default_bundle["ppcClusterIds"],
        "defaultClusterIds": default_bundle["defaultClusterIds"],
        "sqpTerms": default_bundle["sqpTerms"],
        "sqpClusterTerms": default_bundle["sqpClusterTerms"],
        "sqpGlobalTermIds": default_bundle["sqpGlobalTermIds"],
        "regression": default_bundle["regression"],
        "sourceOverview": source_overview,
        "changeLogByWeek": change_log_by_week,
        "brandMetrics": default_bundle["brandMetrics"],
        "competitorWeekly": default_bundle["competitorWeekly"],
        "scp": default_bundle["scp"],
        "businessReports": default_bundle["businessReports"],
        "audit": audit_output,
    }


def main() -> None:
    cluster_week: dict[tuple[str, str, str], dict[str, float]] = defaultdict(lambda: defaultdict(float))
    cluster_terms: dict[tuple[str, str], set[str]] = defaultdict(set)
    term_rollup: dict[str, dict[str, float]] = defaultdict(lambda: defaultdict(float))
    week_meta: dict[str, dict[str, object]] = {}
    term_info: dict[str, dict[str, object]] = {}
    sqp_term_week: dict[tuple[str, str], dict[str, float]] = defaultdict(lambda: defaultdict(float))
    tst_term_week: dict[tuple[str, str], dict[str, float]] = defaultdict(make_tst_term_week)
    rank_term_week_detail: dict[tuple[str, str], dict[str, object]] = defaultdict(make_rank_term_week)
    ppc_term_week: dict[tuple[str, str], dict[str, float]] = defaultdict(lambda: defaultdict(float))

    target_asin = detect_target_asin_from_sqp_files()
    load_sqp(cluster_week, cluster_terms, term_rollup, week_meta, term_info, sqp_term_week)
    scp_week_asin = load_scp(week_meta)
    business_week_asin = load_business_reports(week_meta)
    business_day_metrics = load_business_reports_daily(week_meta)
    tst_term_week = load_tst(week_meta, cluster_terms, target_asin, term_info)
    load_rank_radar(cluster_week, cluster_terms, term_rollup, week_meta, term_info, rank_term_week_detail)
    load_ppc(cluster_week, cluster_terms, term_rollup, week_meta, term_info, ppc_term_week)

    if not week_meta:
        raise SystemExit("No weekly data found.")

    week_order = [
        label
        for label, _ in sorted(
            ((label, meta["week_number"]) for label, meta in week_meta.items()),
            key=lambda item: int(item[1]),
        )
    ]
    latest_week_label = week_order[-1]
    latest_week_number = int(week_meta[latest_week_label]["week_number"])
    latest_week_start = str(week_meta[latest_week_label]["start_date"])
    output_dir = WPR_PATHS.data_dir
    output_dir.mkdir(parents=True, exist_ok=True)

    brand_metrics = load_brand_metrics(week_meta)
    competitor_ranks = load_dd_keywords(week_meta)
    competitor_weekly = load_competitors(week_meta)
    source_overview = scan_sources(week_meta)
    cluster_week_records, primary_terms_by_cluster = build_cluster_week_records_primary(
        cluster_terms,
        term_info,
        sqp_term_week,
        ppc_term_week,
        rank_term_week_detail,
        week_meta,
        week_order,
    )
    week_start_dates = {
        week_label: str(week_meta[week_label]["start_date"])
        for week_label in week_order
    }
    change_log_by_week = build_change_log_by_week(week_order, week_meta)
    windows_by_week: dict[str, dict[str, object]] = {}
    audits_by_week: dict[str, dict[str, object]] = {}
    for anchor_week in week_order:
        window_bundle, window_audit = build_window_bundle(
            anchor_week,
            week_order,
            week_meta,
            cluster_terms,
            term_info,
            sqp_term_week,
            tst_term_week,
            ppc_term_week,
            rank_term_week_detail,
            cluster_week_records,
            primary_terms_by_cluster,
            competitor_ranks,
            competitor_weekly,
            brand_metrics,
            scp_week_asin,
            business_week_asin,
            business_day_metrics,
            target_asin,
            change_log_by_week,
        )
        windows_by_week[anchor_week] = window_bundle
        audits_by_week[anchor_week] = window_audit

    default_bundle = windows_by_week[latest_week_label]
    audit_output = audits_by_week[latest_week_label]
    payload = build_payload(
        default_bundle,
        week_order,
        week_start_dates,
        source_overview,
        windows_by_week,
        change_log_by_week,
        audit_output,
    )
    html_output = build_html(payload)

    today = date.today().isoformat()
    html_path = output_dir / f"{today}_WPR-Dashboard.html"
    csv_path = output_dir / f"{today}_Intent-Cluster-Summary.csv"
    audit_path = output_dir / f"{today}_Intent-Cluster-Audit.json"
    json_path = output_dir / f"{today}_wpr-data.json"
    latest_html_path = output_dir / "WPR-Dashboard-latest.html"
    latest_csv_path = output_dir / "Intent-Cluster-Summary-latest.csv"
    latest_audit_path = output_dir / "Intent-Cluster-Audit-latest.json"
    latest_json_path = output_dir / "wpr-data-latest.json"
    html_path.write_text(html_output, encoding="utf-8")
    latest_html_path.write_text(html_output, encoding="utf-8")
    write_summary_csv(
        csv_path,
        default_bundle["clusters"],
        latest_week_label,
        default_bundle["meta"]["recentWindow"],
        default_bundle["meta"]["baselineWindow"],
    )
    latest_csv_path.write_text(csv_path.read_text(encoding="utf-8"), encoding="utf-8")
    audit_json = json.dumps(audit_output, indent=2)
    audit_path.write_text(audit_json, encoding="utf-8")
    latest_audit_path.write_text(audit_json, encoding="utf-8")
    payload_json = json.dumps(payload, separators=(",", ":"), default=str)
    json_path.write_text(payload_json, encoding="utf-8")
    latest_json_path.write_text(payload_json, encoding="utf-8")

    top_clusters = default_bundle["clusters"][:6]

    print(f"HTML: {html_path}")
    print(f"Latest HTML: {latest_html_path}")
    print(f"CSV:  {csv_path}")
    print(f"Latest CSV: {latest_csv_path}")
    print(f"Audit: {audit_path}")
    print(f"Latest Audit: {latest_audit_path}")
    print(f"JSON: {json_path}")
    print(f"Latest JSON: {latest_json_path}")
    print("")
    print("Top demand-backed clusters:")
    for item in top_clusters:
        avg_rank = "-" if item["avg_rank"] is None else f"{float(item['avg_rank']):.1f}"
        print(
            f"- {item['cluster']} | avg rank {avg_rank} | "
            f"ASIN CVR {format_percent(float(item['asin_cvr']))} | "
            f"market CVR {format_percent(float(item['market_cvr']))} | "
            f"share {format_percent(float(item['purchase_share']))}"
        )


if __name__ == "__main__":
    main()
