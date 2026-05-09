#!/usr/bin/env python3

from __future__ import annotations

import csv
import filecmp
import json
import shutil
import sys
from collections import defaultdict
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
import re

from common import resolve_wpr_paths
from market_config import resolve_argus_market


csv.field_size_limit(sys.maxsize)

WPR_PATHS = resolve_wpr_paths()
ARGUS_MARKET = resolve_argus_market()
WPR_ROOT = WPR_PATHS.wpr_root
MONITORING_ROOT = WPR_PATHS.monitoring_root

CANONICAL_WEEK_RE = re.compile(r"^W(\d{1,2})(?: Partial)?$")
LEGACY_WEEK_RE = re.compile(r"^Week (\d+) - (\d{4}-\d{2}-\d{2}) \(Sun\)(?: \(Partial\))?$")
PPC_WEEK_RE = re.compile(r"^Week (\d+) - (\d{4}-\d{2}-\d{2})$")
WEEK_FILE_RE = re.compile(r"W(\d{2})_(\d{4}-\d{2}-\d{2})")
WEEK_RANGE_RE = re.compile(r"W(\d{2})_W(\d{2})")
ISO_DATE_RE = re.compile(r"(?<!\d)(\d{4}-\d{2}-\d{2})(?!\d)")
YMD_UNDERSCORE_DATE_RE = re.compile(r"(?<!\d)(\d{4})_(\d{2})_(\d{2})(?!\d)")
MDY_DATE_RE = re.compile(r"(?<!\d)(\d{1,2})[ _-](\d{1,2})[ _-](\d{4})(?!\d)")
MONTH_NAME_DATE_RE = re.compile(
    r"(?<![A-Za-z])"
    r"(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)"
    r"[ _-](\d{1,2})[ _-](\d{4})(?!\d)",
    re.IGNORECASE,
)
LEGACY_WEEK_NUMBER_RE = re.compile(r"(?:^|[^A-Za-z0-9])Week[ _-](\d{1,2})(?!\d)", re.IGNORECASE)
BROWSER_DUPLICATE_SUFFIX_RE = re.compile(r" \(\d+\)(?=\.|$)")
NONCANONICAL_ARTIFACT_SUFFIX_RE = re.compile(r"__(?:backup|wpr_recovery|legacy|dup\d+)(?=\.|$)", re.IGNORECASE)

IGNORED_NAMES = {".DS_Store"}
LEGACY_INPUT_NAMES = {"Daily", "Hourly", "Weekly"}
WPR_WEEKLY_SOURCE_DIRS = (
    Path("Brand Analytics (API)") / "SQP - Search Query Performance (API)",
    Path("Brand Analytics (API)") / "TST - Top Search Terms (API)",
    Path("Brand Analytics (API)") / "SCP - Search Catalog Performance (API)",
    Path("Ad Console") / "SP - Sponsored Products (API)" / "SP - Search Term Report (API)",
    Path("Ad Console") / "Brand Metrics (Browser)",
    Path("Datadive (API)") / "Rank Radar - Datadive Rank Radar (API)",
    Path("Datadive (API)") / "DD-Keywords - Datadive Keywords (API)",
    Path("Datadive (API)") / "DD-Competitors - Datadive Competitors (API)",
    Path("Business Reports (API)") / "Sales & Traffic (API)",
)
TST_SOURCE_DIR = Path("Brand Analytics (API)") / "TST - Top Search Terms (API)"
TST_TERM_FILTER_BY_MARKET = {
    "uk": "dust sheet",
}
GENERATED_INPUT_ROOT_NAMES = {
    "Account Health Dashboard (API)",
    "Ad Console",
    "Amazon Inventory Ledger (API)",
    "Brand Analytics (API)",
    "Business Reports (API)",
    "Category Insights (Browser)",
    "Datadive (API)",
    "Listing Attributes (API)",
    "Product Opportunity Explorer (Browser)",
    "ScaleInsights",
    "Sellerboard (API)",
    "Voice of the Customer (Manual)",
}
QUARANTINE_ROOT = WPR_ROOT / "wpr-workspace" / "rejected"
QUARANTINE_LEDGER = QUARANTINE_ROOT / "rebuild-conflicts.jsonl"
BASE_WEEK_1_START = date(2025, 12, 28)
MONTH_NAME_TO_NUMBER = {
    "jan": 1,
    "feb": 2,
    "mar": 3,
    "apr": 4,
    "may": 5,
    "jun": 6,
    "jul": 7,
    "aug": 8,
    "sep": 9,
    "sept": 9,
    "oct": 10,
    "nov": 11,
    "dec": 12,
}
QUARANTINED_CONFLICTS: list[tuple[Path, Path, str]] = []


@dataclass(frozen=True)
class WeekMeta:
    week: int
    start_date: date
    end_date: date
    partial: bool = False

    @property
    def folder_name(self) -> str:
        return f"W{self.week:02d}"


def parse_iso_date(value: str) -> date:
    return date.fromisoformat(value)


def parse_timestamp(value: str) -> date:
    cleaned = value.strip()
    if cleaned.endswith("Z"):
        cleaned = cleaned[:-1] + "+00:00"
    return datetime.fromisoformat(cleaned).date()


def payload_exists(path: Path) -> bool:
    if path.is_file():
        return path.name not in IGNORED_NAMES
    if not path.exists():
        return False
    for child in path.rglob("*"):
        if child.is_file() and child.name not in IGNORED_NAMES:
            return True
    return False


def remove_empty_tree(path: Path) -> None:
    if not path.exists():
        return
    if path.is_file():
        path.unlink()
        return
    for child in sorted(path.iterdir(), reverse=True):
        if child.is_dir():
            remove_empty_tree(child)
        else:
            child.unlink()
    path.rmdir()


def remove_empty_directories(path: Path) -> None:
    if not path.exists() or not path.is_dir():
        return
    for child in sorted(path.iterdir(), reverse=True):
        if child.is_dir():
            remove_empty_directories(child)
    if path.exists() and not any(path.iterdir()):
        path.rmdir()


def canonical_wpr_name(name: str) -> str:
    cleaned = BROWSER_DUPLICATE_SUFFIX_RE.sub("", name)
    if cleaned in {"", ".", ".."}:
        raise ValueError(f"Invalid WPR artifact name: {name}")
    if NONCANONICAL_ARTIFACT_SUFFIX_RE.search(cleaned):
        raise ValueError(f"WPR artifact name contains a noncanonical suffix: {name}")
    return cleaned


def canonical_wpr_relative_path(path: Path) -> Path:
    return Path(*(canonical_wpr_name(part) for part in path.parts))


def path_is_relative_to(path: Path, parent: Path) -> bool:
    try:
        path.relative_to(parent)
    except ValueError:
        return False
    return True


def is_needed_weekly_source(path: Path) -> bool:
    return any(path_is_relative_to(path, source_dir) for source_dir in WPR_WEEKLY_SOURCE_DIRS)


def is_tst_source(path: Path) -> bool:
    return path_is_relative_to(path, TST_SOURCE_DIR)


def current_tst_term_filter() -> str | None:
    return TST_TERM_FILTER_BY_MARKET.get(ARGUS_MARKET)


def row_matches_tst_filter(row: dict[str, str], term_filter: str) -> bool:
    search_term = " ".join(str(row.get("searchTerm", "")).split()).casefold()
    return term_filter.casefold() in search_term


def canonical_wpr_sort_path(path: Path) -> Path:
    parts: list[str] = []
    for part in path.parts:
        try:
            parts.append(canonical_wpr_name(part))
        except ValueError:
            parts.append(part)
    return Path(*parts)


def has_noncanonical_artifact_name(path: Path) -> bool:
    for part in path.parts:
        try:
            if canonical_wpr_name(part) != part:
                return True
        except ValueError:
            return True
    return False


def quarantine_relative_path(src: Path) -> Path:
    resolved = src.resolve()
    for label, root in (("WPR", WPR_ROOT), ("Monitoring", MONITORING_ROOT)):
        try:
            return Path(label) / resolved.relative_to(root)
        except ValueError:
            continue
    raise ValueError(f"Cannot quarantine path outside WPR or monitoring roots: {src}")


def unique_quarantine_path(src: Path) -> Path:
    base = QUARANTINE_ROOT / quarantine_relative_path(src)
    if not base.exists():
        return base

    index = 1
    while True:
        if src.is_dir():
            candidate = base.with_name(f"{base.name}__rejected{index}")
        else:
            candidate = base.with_name(f"{base.stem}__rejected{index}{base.suffix}")
        if not candidate.exists():
            return candidate
        index += 1


def quarantine_conflict(src: Path, dest: Path, reason: str) -> None:
    quarantined = unique_quarantine_path(src)
    quarantined.parent.mkdir(parents=True, exist_ok=True)
    shutil.move(str(src), str(quarantined))
    QUARANTINED_CONFLICTS.append((src, quarantined, reason))
    QUARANTINE_LEDGER.parent.mkdir(parents=True, exist_ok=True)
    with QUARANTINE_LEDGER.open("a", encoding="utf-8") as handle:
        handle.write(
            json.dumps(
                {
                    "rejectedAt": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
                    "reason": reason,
                    "source": str(src),
                    "quarantined": str(quarantined),
                    "target": str(dest),
                },
                sort_keys=True,
            )
            + "\n"
        )


def reset_quarantine() -> None:
    QUARANTINED_CONFLICTS.clear()
    if QUARANTINE_ROOT.exists():
        shutil.rmtree(QUARANTINE_ROOT)


def merge_move(src: Path, dest: Path) -> None:
    dest = dest.with_name(canonical_wpr_name(dest.name))
    dest.parent.mkdir(parents=True, exist_ok=True)
    if src.is_dir():
        if not dest.exists():
            shutil.move(str(src), str(dest))
            return
        if not dest.is_dir():
            quarantine_conflict(src, dest, "directory collides with canonical file")
            return
        for child in list(src.iterdir()):
            merge_move(child, dest / child.name)
        if src.exists() and not any(src.iterdir()):
            src.rmdir()
        return

    if dest.exists():
        if dest.is_dir():
            quarantine_conflict(src, dest, "file collides with canonical directory")
            return
        if filecmp.cmp(src, dest, shallow=False):
            src.unlink()
            return
        quarantine_conflict(src, dest, "different content after canonicalizing artifact name")
        return
    shutil.move(str(src), str(dest))


def discover_anchor_week() -> WeekMeta:
    return WeekMeta(week=1, start_date=BASE_WEEK_1_START, end_date=BASE_WEEK_1_START + timedelta(days=6))


def week_start_for_number(week: int) -> date:
    return BASE_WEEK_1_START + timedelta(days=(week - 1) * 7)


def parse_existing_week_dir_name(name: str) -> tuple[int, date] | None:
    canonical_match = CANONICAL_WEEK_RE.match(name)
    if canonical_match:
        week = int(canonical_match.group(1))
        return week, week_start_for_number(week)

    legacy_match = LEGACY_WEEK_RE.match(name)
    if legacy_match:
        return int(legacy_match.group(1)), parse_iso_date(legacy_match.group(2))

    return None


def discover_existing_wpr_weeks() -> dict[int, date]:
    weeks: dict[int, date] = {}
    for path in WPR_ROOT.iterdir():
        if not path.is_dir():
            continue
        parsed = parse_existing_week_dir_name(path.name)
        if parsed is None:
            continue
        week, start = parsed
        weeks[week] = start
    return weeks


def discover_existing_week_dirs() -> list[tuple[int, date, Path]]:
    week_dirs: list[tuple[int, date, Path]] = []
    for path in WPR_ROOT.iterdir():
        if not path.is_dir():
            continue
        parsed = parse_existing_week_dir_name(path.name)
        if parsed is None:
            continue
        week, start = parsed
        week_dirs.append((week, start, path))
    return week_dirs


def week_number_for_date(anchor_start: date, value: date) -> int | None:
    if value < anchor_start:
        return None
    return ((value - anchor_start).days // 7) + 1


def week_number_for_weekly_file(path: Path, anchor_start: date) -> int | None:
    match = WEEK_FILE_RE.search(path.name)
    if match:
        return int(match.group(1))

    range_match = WEEK_RANGE_RE.search(path.name)
    if range_match:
        return int(range_match.group(2))

    iso_match = ISO_DATE_RE.search(path.stem)
    if iso_match:
        return week_number_for_date(anchor_start, parse_iso_date(iso_match.group(1)))

    ymd_match = YMD_UNDERSCORE_DATE_RE.search(path.stem)
    if ymd_match:
        year, month, day = map(int, ymd_match.groups())
        return week_number_for_date(anchor_start, date(year, month, day))

    month_name_match = MONTH_NAME_DATE_RE.search(path.stem)
    if month_name_match:
        month_name, day, year = month_name_match.groups()
        month = MONTH_NAME_TO_NUMBER[month_name.lower()]
        return week_number_for_date(anchor_start, date(int(year), month, int(day)))

    legacy_week_match = LEGACY_WEEK_NUMBER_RE.search(path.stem)
    if legacy_week_match:
        return int(legacy_week_match.group(1))

    mdy_match = MDY_DATE_RE.search(path.stem)
    if mdy_match:
        first, second, year = map(int, mdy_match.groups())
        ordered_pairs = ((first, second), (second, first))
        if ARGUS_MARKET == "uk":
            ordered_pairs = ((second, first), (first, second))
        candidates: list[date] = []
        for month, day in ordered_pairs:
            try:
                candidate = date(year, month, day)
            except ValueError:
                continue
            if candidate not in candidates:
                candidates.append(candidate)
        for candidate in candidates:
            week = week_number_for_date(anchor_start, candidate)
            if week is not None:
                return week

    return None


def scan_csv_max_date(src: Path, field_name: str, parser) -> date | None:
    if not src.exists():
        return None
    latest: date | None = None
    with src.open("r", newline="", encoding="utf-8-sig") as infile:
        reader = csv.DictReader(infile)
        for row in reader:
            value = row.get(field_name)
            if not value:
                continue
            parsed = parser(value)
            if latest is None or parsed > latest:
                latest = parsed
    return latest


def discover_max_dated_monitoring_week(anchor_start: date) -> int:
    latest_date: date | None = None

    def consider(candidate: date | None) -> None:
        nonlocal latest_date
        if candidate is None:
            return
        if latest_date is None or candidate > latest_date:
            latest_date = candidate

    consider(
        scan_csv_max_date(
            MONITORING_ROOT / "Hourly" / "Listing Attributes (API)" / "Listings-Changes-History.csv",
            "snapshot_timestamp_utc",
            parse_timestamp,
        )
    )

    if latest_date is None:
        return 0
    return week_number_for_date(anchor_start, latest_date) or 0


def build_weeks() -> dict[int, WeekMeta]:
    anchor = discover_anchor_week()
    existing_wpr_weeks = discover_existing_wpr_weeks()
    max_existing_week = max(existing_wpr_weeks, default=anchor.week)

    max_week_from_monitoring = anchor.week
    weekly_root = MONITORING_ROOT / "Weekly"
    for path in weekly_root.rglob("*"):
        if not path.is_file() or path.name in IGNORED_NAMES:
            continue
        if not is_needed_weekly_source(path.relative_to(weekly_root)):
            continue
        week = week_number_for_weekly_file(path, anchor.start_date)
        if week is not None:
            max_week_from_monitoring = max(max_week_from_monitoring, week)

    max_week_from_dated_monitoring = discover_max_dated_monitoring_week(anchor.start_date)
    max_week = max(max_existing_week, max_week_from_monitoring, max_week_from_dated_monitoring)
    partial_weeks = set(range(max_week_from_monitoring + 1, max_week_from_dated_monitoring + 1))
    weeks: dict[int, WeekMeta] = {}
    for week in range(1, max_week + 1):
        start = anchor.start_date + timedelta(days=(week - 1) * 7)
        weeks[week] = WeekMeta(
            week=week,
            start_date=start,
            end_date=start + timedelta(days=6),
            partial=week in partial_weeks,
        )
    return weeks


def week_for_date(value: date, weeks: dict[int, WeekMeta]) -> int | None:
    for week, meta in weeks.items():
        if meta.start_date <= value <= meta.end_date:
            return week
    return None


def create_input_scaffold(weeks: dict[int, WeekMeta]) -> None:
    for meta in weeks.values():
        week_dir = WPR_ROOT / meta.folder_name
        output_dir = week_dir / "output"
        output_dir.mkdir(parents=True, exist_ok=True)


def reset_generated_week_inputs(weeks: dict[int, WeekMeta]) -> None:
    for meta in weeks.values():
        input_dir = WPR_ROOT / meta.folder_name / "input"
        if not input_dir.exists():
            continue
        for child in list(input_dir.iterdir()):
            if child.name not in GENERATED_INPUT_ROOT_NAMES:
                continue
            if child.is_dir():
                shutil.rmtree(child)
            else:
                child.unlink()


def remove_empty_week_input_dirs(weeks: dict[int, WeekMeta]) -> None:
    for meta in weeks.values():
        remove_empty_directories(WPR_ROOT / meta.folder_name / "input")


def canonicalize_existing_week_dirs(weeks: dict[int, WeekMeta]) -> None:
    for week, _start, path in discover_existing_week_dirs():
        meta = weeks.get(week)
        if meta is None:
            continue
        canonical = WPR_ROOT / meta.folder_name
        canonical.mkdir(parents=True, exist_ok=True)
        if path == canonical:
            continue
        for child in list(path.iterdir()):
            if child.name in IGNORED_NAMES:
                child.unlink(missing_ok=True)
                continue
            merge_move(child, canonical / child.name)
        if path.exists() and not any(path.iterdir()):
            path.rmdir()


def migrate_existing_week_payload(meta: WeekMeta) -> None:
    week_dir = WPR_ROOT / meta.folder_name
    week_dir.mkdir(parents=True, exist_ok=True)
    output_dir = week_dir / "output"
    output_dir.mkdir(parents=True, exist_ok=True)

    for item in list(week_dir.iterdir()):
        if item.name in {"input", "output"}:
            continue
        if item.name in IGNORED_NAMES:
            item.unlink(missing_ok=True)
            continue
        if not payload_exists(item):
            continue

        if item.is_dir() and item.name == "Plans":
            merge_move(item, output_dir / "Plans")
            continue
        if item.is_dir() and item.name in LEGACY_INPUT_NAMES:
            continue
        if item.is_file():
            merge_move(item, output_dir / "Reports" / item.name)
            continue
        merge_move(item, output_dir / item.name)


def canonicalize_existing_week_tree(root: Path) -> None:
    if not root.exists():
        return
    for child in list(root.iterdir()):
        if child.name in IGNORED_NAMES:
            child.unlink(missing_ok=True)
            continue
        try:
            canonical_name = canonical_wpr_name(child.name)
        except ValueError as error:
            quarantine_conflict(child, child, str(error))
            continue
        current = child
        if canonical_name != child.name:
            current = child.with_name(canonical_name)
            merge_move(child, current)
        if current.exists() and current.is_dir():
            canonicalize_existing_week_tree(current)


def migrate_top_level_ppc_audits(weeks: dict[int, WeekMeta]) -> None:
    ppc_root = WPR_ROOT / "PPC_Audits"
    if not ppc_root.exists():
        return
    for item in list(ppc_root.iterdir()):
        if item.name in IGNORED_NAMES:
            item.unlink(missing_ok=True)
            continue
        if not item.is_dir():
            continue
        match = PPC_WEEK_RE.match(item.name)
        if not match:
            continue
        week = int(match.group(1))
        meta = weeks.get(week)
        if meta is None:
            continue
        if not payload_exists(item):
            shutil.rmtree(item)
            continue
        merge_move(item, WPR_ROOT / meta.folder_name / "output" / "PPC_Audits")
    if ppc_root.exists() and not payload_exists(ppc_root):
        shutil.rmtree(ppc_root)


def remove_legacy_output_snapshots(weeks: dict[int, WeekMeta]) -> None:
    for meta in weeks.values():
        legacy_dir = WPR_ROOT / meta.folder_name / "output" / "legacy_wpr_snapshot"
        if legacy_dir.exists():
            shutil.rmtree(legacy_dir)


def remove_empty_week_scaffolds(weeks: dict[int, WeekMeta]) -> list[WeekMeta]:
    removed: list[WeekMeta] = []
    for meta in weeks.values():
        week_dir = WPR_ROOT / meta.folder_name
        if not week_dir.exists():
            continue
        if payload_exists(week_dir):
            continue
        remove_empty_tree(week_dir)
        removed.append(meta)
    return removed


def resolve_week_for_weekly_file(path: Path, weeks: dict[int, WeekMeta]) -> int | None:
    week = week_number_for_weekly_file(path, discover_anchor_week().start_date)
    if week in weeks:
        return week
    return None


def copy_file_into_week(src: Path, dest: Path, stats: dict[int, int], week: int) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.exists():
        if dest.is_dir():
            quarantine_conflict(src, dest, "file collides with canonical directory")
            return
        if filecmp.cmp(src, dest, shallow=False):
            return
        if has_noncanonical_artifact_name(src.relative_to(MONITORING_ROOT)):
            quarantine_conflict(src, dest, "different content after canonicalizing artifact name")
            return
        shutil.copy2(src, dest)
        stats[week] += 1
        return
    shutil.copy2(src, dest)
    stats[week] += 1


def copy_filtered_csv_into_week(src: Path, dest: Path, stats: dict[int, int], week: int, term_filter: str) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.exists() and dest.is_dir():
        quarantine_conflict(src, dest, "file collides with canonical directory")
        return

    with src.open(newline="", encoding="utf-8-sig") as infile:
        reader = csv.DictReader(infile)
        fieldnames = reader.fieldnames
        if not fieldnames:
            return
        rows = [row for row in reader if row_matches_tst_filter(row, term_filter)]

    if len(rows) == 0:
        if dest.exists():
            dest.unlink()
        return

    if dest.exists():
        dest.unlink()

    with dest.open("w", newline="", encoding="utf-8") as outfile:
        writer = csv.DictWriter(outfile, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)
    stats[week] += 1


def populate_weekly_inputs(weeks: dict[int, WeekMeta], stats: dict[int, int]) -> list[str]:
    skipped: list[str] = []
    weekly_root = MONITORING_ROOT / "Weekly"
    source_files = [src for src in weekly_root.rglob("*") if src.is_file() and src.name not in IGNORED_NAMES]
    source_files.sort(
        key=lambda src: (
            str(canonical_wpr_sort_path(src.relative_to(weekly_root))),
            has_noncanonical_artifact_name(src.relative_to(weekly_root)),
            str(src.relative_to(weekly_root)),
        )
    )
    for src in source_files:
        source_relative = src.relative_to(weekly_root)
        if not is_needed_weekly_source(source_relative):
            continue
        week = resolve_week_for_weekly_file(src, weeks)
        if week is None:
            skipped.append(str(src.relative_to(MONITORING_ROOT)))
            continue
        try:
            rel = canonical_wpr_relative_path(source_relative)
        except ValueError as error:
            target = WPR_ROOT / weeks[week].folder_name / "input" / src.relative_to(weekly_root)
            quarantine_conflict(src, target, str(error))
            continue
        dest = WPR_ROOT / weeks[week].folder_name / "input" / rel
        tst_filter = current_tst_term_filter()
        if tst_filter is not None and is_tst_source(source_relative):
            copy_filtered_csv_into_week(src, dest, stats, week, tst_filter)
            continue
        copy_file_into_week(src, dest, stats, week)
    return skipped


def split_csv_by_week(
    src: Path,
    weeks: dict[int, WeekMeta],
    rel_dest: Path,
    date_field: str,
    parser,
    stats: dict[int, int],
    required: bool = True,
    row_predicate=None,
) -> dict[int, int]:
    row_counts: dict[int, int] = defaultdict(int)
    file_handles: dict[int, tuple[object, csv.DictWriter]] = {}

    if not src.exists():
        if required:
            raise FileNotFoundError(src)
        return row_counts

    with src.open("r", newline="", encoding="utf-8-sig") as infile:
        reader = csv.DictReader(infile)
        if not reader.fieldnames:
            return row_counts

        for row in reader:
            if row_predicate is not None and not row_predicate(row):
                continue
            value = row.get(date_field)
            if not value:
                continue
            week = week_for_date(parser(value), weeks)
            if week is None:
                continue
            if week not in file_handles:
                dest = WPR_ROOT / weeks[week].folder_name / "input" / rel_dest
                dest.parent.mkdir(parents=True, exist_ok=True)
                outfile = dest.open("w", newline="", encoding="utf-8")
                writer = csv.DictWriter(outfile, fieldnames=reader.fieldnames)
                writer.writeheader()
                file_handles[week] = (outfile, writer)
                stats[week] += 1
            outfile, writer = file_handles[week]
            writer.writerow(row)
            row_counts[week] += 1

    for outfile, _writer in file_handles.values():
        outfile.close()
    return row_counts


def populate_hourly_inputs(weeks: dict[int, WeekMeta], stats: dict[int, int]) -> None:
    hourly_root = MONITORING_ROOT / "Hourly" / "Listing Attributes (API)"
    split_csv_by_week(
        src=hourly_root / "Listings-Changes-History.csv",
        weeks=weeks,
        rel_dest=Path("Listing Attributes (API)") / "Listings-Changes-History.csv",
        date_field="snapshot_timestamp_utc",
        parser=parse_timestamp,
        stats=stats,
        row_predicate=lambda row: row.get("owner_type") == "our" and row.get("changed") == "yes",
    )


def main() -> None:
    weeks = build_weeks()
    input_file_counts: dict[int, int] = defaultdict(int)

    reset_quarantine()
    canonicalize_existing_week_dirs(weeks)

    for meta in weeks.values():
        migrate_existing_week_payload(meta)
        canonicalize_existing_week_tree(WPR_ROOT / meta.folder_name)

    remove_legacy_output_snapshots(weeks)
    reset_generated_week_inputs(weeks)
    create_input_scaffold(weeks)
    migrate_top_level_ppc_audits(weeks)

    skipped_weekly_files = populate_weekly_inputs(weeks, input_file_counts)
    populate_hourly_inputs(weeks, input_file_counts)
    remove_empty_week_input_dirs(weeks)
    removed_empty_weeks = remove_empty_week_scaffolds(weeks)

    print("Rebuilt WPR week folders:")
    for week in sorted(weeks):
        meta = weeks[week]
        if meta in removed_empty_weeks:
            continue
        label = f"W{week:02d}{' (partial)' if meta.partial else ''}"
        print(
            f"  {label}: {meta.start_date.isoformat()} to {meta.end_date.isoformat()} "
            f"-> {input_file_counts.get(week, 0)} input files"
        )

    if removed_empty_weeks:
        print("\nRemoved generated week folders without source payload:")
        for meta in removed_empty_weeks:
            print(f"  {meta.folder_name}")

    if skipped_weekly_files:
        print("\nSkipped monitoring files without a resolvable week:")
        for path in skipped_weekly_files:
            print(f"  {path}")

    if QUARANTINED_CONFLICTS:
        print("\nQuarantined WPR rebuild conflicts:")
        for src, quarantined, reason in QUARANTINED_CONFLICTS:
            print(f"  {reason}: {src} -> {quarantined}")


if __name__ == "__main__":
    main()
