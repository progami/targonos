#!/usr/bin/env python3

from __future__ import annotations

import csv
import filecmp
import json
import os
import re
from dataclasses import dataclass
from pathlib import Path

from common import resolve_wpr_paths
from market_config import required_env, resolve_argus_market, wpr_market_config


WEEK_FILE_RE = re.compile(r"W(\d{2})_(\d{4}-\d{2}-\d{2})")
IGNORED_NAMES = {".DS_Store"}


@dataclass(frozen=True)
class SourceRule:
    name: str
    relative_dir: Path
    critical: bool = False


SOURCE_RULES = [
    SourceRule(
        name="SP Search Term",
        relative_dir=Path("Ad Console/SP - Sponsored Products (API)/SP - Search Term Report (API)"),
        critical=True,
    ),
    SourceRule(
        name="SQP",
        relative_dir=Path("Brand Analytics (API)/SQP - Search Query Performance (API)"),
        critical=True,
    ),
    SourceRule(
        name="Rank Radar",
        relative_dir=Path("Datadive (API)/Rank Radar - Datadive Rank Radar (API)"),
        critical=True,
    ),
    SourceRule(
        name="SP Advertised Product",
        relative_dir=Path("Ad Console/SP - Sponsored Products (API)/SP - Advertised Product Report (API)"),
    ),
    SourceRule(
        name="SP Campaign",
        relative_dir=Path("Ad Console/SP - Sponsored Products (API)/SP - Campaign Report (API)"),
    ),
    SourceRule(
        name="SP Placement",
        relative_dir=Path("Ad Console/SP - Sponsored Products (API)/SP - Placement Report (API)"),
    ),
    SourceRule(
        name="SP Purchased Product",
        relative_dir=Path("Ad Console/SP - Sponsored Products (API)/SP - Purchased Product Report (API)"),
    ),
    SourceRule(
        name="SP Targeting",
        relative_dir=Path("Ad Console/SP - Sponsored Products (API)/SP - Targeting Report (API)"),
    ),
    SourceRule(
        name="DD-Keywords",
        relative_dir=Path("Datadive (API)/DD-Keywords - Datadive Keywords (API)"),
    ),
    SourceRule(
        name="DD-Competitors",
        relative_dir=Path("Datadive (API)/DD-Competitors - Datadive Competitors (API)"),
    ),
    SourceRule(
        name="Product Opportunity Explorer",
        relative_dir=Path("Product Opportunity Explorer (Browser)"),
    ),
    SourceRule(
        name="Category Insights",
        relative_dir=Path("Category Insights (Browser)"),
    ),
]


def monitoring_weekly_root() -> Path:
    return resolve_wpr_paths().monitoring_root / "Weekly"


def sales_root_for_market(market: str) -> Path:
    return Path(required_env(f"ARGUS_SALES_ROOT_{market.upper()}")).expanduser().resolve()


def sibling_market(market: str) -> str:
    if market == "us":
        return "uk"
    if market == "uk":
        return "us"
    raise RuntimeError(f"Unsupported Argus market: {market}")


def week_key(path: Path) -> tuple[int, str]:
    match = WEEK_FILE_RE.search(path.name)
    if not match:
        return (0, "")
    return (int(match.group(1)), match.group(2))


def csv_data_row_count(path: Path) -> int:
    if path.suffix.lower() != ".csv":
        return 1 if path.stat().st_size > 0 else 0
    with path.open("r", newline="", encoding="utf-8-sig") as handle:
        reader = csv.reader(handle)
        rows = [row for row in reader if any(cell.strip() for cell in row)]
    if not rows:
        return 0
    return max(0, len(rows) - 1)


def source_files(rule: SourceRule, weekly_root: Path | None = None) -> list[Path]:
    root = (weekly_root or monitoring_weekly_root()) / rule.relative_dir
    if not root.exists():
        return []
    return sorted(
        [path for path in root.iterdir() if path.is_file() and path.name not in IGNORED_NAMES],
        key=week_key,
    )


def latest_source_file(rule: SourceRule) -> Path | None:
    files = [path for path in source_files(rule) if week_key(path)[0] > 0]
    if not files:
        return None
    return files[-1]


def matching_sibling_file(path: Path, market: str) -> Path:
    current_sales_root = sales_root_for_market(market)
    other_sales_root = sales_root_for_market(sibling_market(market))
    relative = path.resolve().relative_to(current_sales_root)
    return other_sales_root / relative


def validate_duplicate_market_files(market: str, rules: list[SourceRule] = SOURCE_RULES) -> list[str]:
    errors: list[str] = []
    for rule in rules:
        path = latest_source_file(rule)
        if path is None or csv_data_row_count(path) == 0:
            continue
        other = matching_sibling_file(path, market)
        if other.exists() and other.is_file() and filecmp.cmp(path, other, shallow=False):
            errors.append(f"{rule.name} {path.name} duplicates {sibling_market(market).upper()} file")
    return errors


def validate_critical_sources(rules: list[SourceRule] = SOURCE_RULES) -> list[str]:
    errors: list[str] = []
    for rule in rules:
        if not rule.critical:
            continue
        latest = latest_source_file(rule)
        if latest is None:
            errors.append(f"{rule.name} missing critical source file")
            continue
        row_count = csv_data_row_count(latest)
        if row_count == 0:
            errors.append(f"{rule.name} latest source has no data rows: {latest.name}")
    return errors


def latest_json_file(directory: Path, pattern: str) -> Path | None:
    if not directory.exists():
        return None
    files = sorted(
        [path for path in directory.glob(pattern) if path.is_file() and week_key(path)[0] > 0],
        key=week_key,
    )
    if not files:
        return None
    return files[-1]


def validate_datadive_manifest() -> None:
    config = wpr_market_config(resolve_argus_market())
    manifest = latest_json_file(monitoring_weekly_root() / "Datadive (API)", "*_DD-Manifest.json")
    if manifest is None:
        raise ValueError("Datadive manifest missing.")

    payload = json.loads(manifest.read_text(encoding="utf-8"))
    if payload.get("nicheId") != config.datadive_niche_id:
        raise ValueError(
            f"Datadive manifest {manifest.name} nicheId={payload.get('nicheId')} "
            f"does not match DATADIVE_NICHE_ID_{config.market.upper()}={config.datadive_niche_id}"
        )
    if str(payload.get("heroAsin") or "").upper() != config.hero_asin:
        raise ValueError(
            f"Datadive manifest {manifest.name} heroAsin={payload.get('heroAsin')} "
            f"does not match WPR_HERO_ASIN_{config.market.upper()}={config.hero_asin}"
        )


def validate_sp_ads_manifest(market: str) -> list[str]:
    errors: list[str] = []
    manifest = latest_json_file(
        monitoring_weekly_root() / "Ad Console" / "SP - Sponsored Products (API)",
        "*_SP-Manifest.json",
    )
    if manifest is None:
        return ["SP Ads manifest missing."]

    payload = json.loads(manifest.read_text(encoding="utf-8"))
    if payload.get("market") != market:
        errors.append(f"SP Ads manifest {manifest.name} missing market={market}")
    if not str(payload.get("profileId") or "").strip():
        errors.append(f"SP Ads manifest {manifest.name} missing profileId")
    return errors


def validate_business_report_currency(market: str) -> list[str]:
    expected_currency = {"us": "USD", "uk": "GBP"}[market]
    sales_dir = monitoring_weekly_root() / "Business Reports (API)" / "Sales & Traffic (API)"
    latest = latest_json_file(sales_dir, "*.json")
    if latest is not None:
        return []

    csv_files = sorted(
        [path for path in sales_dir.glob("*SalesTraffic-By*.csv") if path.is_file() and week_key(path)[0] > 0],
        key=week_key,
    )
    if not csv_files:
        return []

    errors: list[str] = []
    for path in csv_files[-2:]:
        with path.open("r", newline="", encoding="utf-8-sig") as handle:
            reader = csv.DictReader(handle)
            currency_fields = [field for field in (reader.fieldnames or []) if field.endswith("currencyCode")]
            for row in reader:
                for field in currency_fields:
                    value = str(row.get(field) or "").strip()
                    if value and value != expected_currency:
                        errors.append(f"{path.name} has {field}={value}, expected {expected_currency}")
                        return errors
    return errors


def validate_market_sources() -> None:
    market = resolve_argus_market()
    errors: list[str] = []
    errors.extend(validate_duplicate_market_files(market))
    errors.extend(validate_critical_sources())
    errors.extend(validate_sp_ads_manifest(market))
    errors.extend(validate_business_report_currency(market))

    try:
        validate_datadive_manifest()
    except ValueError as error:
        errors.append(str(error))

    if errors:
        joined = "\n- ".join(errors)
        raise ValueError(f"WPR source validation failed for market={market}:\n- {joined}")

    print(f"WPR source validation passed for market={market}")


def main() -> None:
    validate_market_sources()


if __name__ == "__main__":
    main()
