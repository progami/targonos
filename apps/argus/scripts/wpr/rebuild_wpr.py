#!/usr/bin/env python3

from __future__ import annotations

import csv
import filecmp
import shutil
from collections import defaultdict
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from pathlib import Path
import re

from common import resolve_wpr_paths


WPR_PATHS = resolve_wpr_paths()
WPR_ROOT = WPR_PATHS.wpr_root
SALES_ROOT = WPR_PATHS.sales_root
MONITORING_ROOT = WPR_PATHS.monitoring_root

EXISTING_WEEK_RE = re.compile(r"^Week (\d+) - (\d{4}-\d{2}-\d{2}) \(Sun\)(?: \(Partial\))?$")
PPC_WEEK_RE = re.compile(r"^Week (\d+) - (\d{4}-\d{2}-\d{2})$")
WEEK_FILE_RE = re.compile(r"W(\d{2})_(\d{4}-\d{2}-\d{2})")
WEEK_RANGE_RE = re.compile(r"W(\d{2})_W(\d{2})")
ISO_DATE_RE = re.compile(r"(?<!\d)(\d{4}-\d{2}-\d{2})(?!\d)")
MDY_DATE_RE = re.compile(r"(?<!\d)(\d{1,2})[ _-](\d{1,2})[ _-](\d{4})(?!\d)")

IGNORED_NAMES = {".DS_Store"}
LEGACY_INPUT_NAMES = {"Daily", "Hourly", "Weekly"}
EXCLUDED_INPUT_SOURCES = {"Visuals (Browser)"}


@dataclass(frozen=True)
class WeekMeta:
    week: int
    start_date: date
    end_date: date
    partial: bool = False

    @property
    def folder_name(self) -> str:
        suffix = " (Partial)" if self.partial else ""
        return f"Week {self.week} - {self.start_date.isoformat()} (Sun){suffix}"


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


def unique_path(path: Path) -> Path:
    if not path.exists():
        return path
    stem = path.stem
    suffix = path.suffix
    counter = 2
    while True:
        candidate = path.with_name(f"{stem}__dup{counter}{suffix}")
        if not candidate.exists():
            return candidate
        counter += 1


def merge_move(src: Path, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    if src.is_dir():
        if not dest.exists():
            shutil.move(str(src), str(dest))
            return
        if not dest.is_dir():
            raise ValueError(f"Cannot merge directory into file: {src} -> {dest}")
        for child in list(src.iterdir()):
            merge_move(child, dest / child.name)
        if src.exists() and not any(src.iterdir()):
            src.rmdir()
        return

    if dest.exists():
        if dest.is_dir():
            raise ValueError(f"Cannot merge file into directory: {src} -> {dest}")
        if filecmp.cmp(src, dest, shallow=False):
            src.unlink()
            return
        dest = unique_path(dest)
        dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.move(str(src), str(dest))


def discover_anchor_week() -> WeekMeta:
    weekly_root = MONITORING_ROOT / "Weekly"
    anchors: dict[int, date] = {}
    for path in weekly_root.rglob("*"):
        if not path.is_file() or path.name in IGNORED_NAMES:
            continue
        match = WEEK_FILE_RE.search(path.name)
        if not match:
            continue
        week = int(match.group(1))
        end_date = parse_iso_date(match.group(2))
        anchors.setdefault(week, end_date)
        if anchors[week] != end_date:
            raise ValueError(f"Inconsistent week end date for W{week:02d}: {path}")
    if 1 not in anchors:
        raise ValueError("Could not determine Week 1 from Monitoring/Weekly")
    end_date = anchors[1]
    return WeekMeta(week=1, start_date=end_date - timedelta(days=6), end_date=end_date)


def discover_existing_wpr_weeks() -> dict[int, date]:
    weeks: dict[int, date] = {}
    for path in WPR_ROOT.iterdir():
        if not path.is_dir():
            continue
        match = EXISTING_WEEK_RE.match(path.name)
        if not match:
            continue
        weeks[int(match.group(1))] = parse_iso_date(match.group(2))
    return weeks


def discover_existing_week_dirs() -> list[tuple[int, date, Path]]:
    week_dirs: list[tuple[int, date, Path]] = []
    for path in WPR_ROOT.iterdir():
        if not path.is_dir():
            continue
        match = EXISTING_WEEK_RE.match(path.name)
        if not match:
            continue
        week_dirs.append((int(match.group(1)), parse_iso_date(match.group(2)), path))
    return week_dirs


def week_number_for_date(anchor_start: date, value: date) -> int | None:
    if value < anchor_start:
        return None
    return ((value - anchor_start).days // 7) + 1


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
            MONITORING_ROOT / "Daily" / "Account Health Dashboard (API)" / "account-health.csv",
            "date",
            parse_iso_date,
        )
    )
    consider(
        scan_csv_max_date(
            MONITORING_ROOT / "Daily" / "Voice of the Customer (Manual)" / "voc-by-asin.csv",
            "date",
            parse_iso_date,
        )
    )
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
    for path in (MONITORING_ROOT / "Weekly").rglob("*"):
        if not path.is_file() or path.name in IGNORED_NAMES:
            continue
        match = WEEK_FILE_RE.search(path.name)
        if match:
            max_week_from_monitoring = max(max_week_from_monitoring, int(match.group(1)))

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
    sources: set[str] = set()
    for cadence in ("Daily", "Hourly", "Weekly"):
        cadence_root = MONITORING_ROOT / cadence
        if not cadence_root.exists():
            continue
        for child in cadence_root.iterdir():
            if child.is_dir() and child.name not in IGNORED_NAMES and child.name not in EXCLUDED_INPUT_SOURCES:
                sources.add(child.name)

    for meta in weeks.values():
        week_dir = WPR_ROOT / meta.folder_name
        input_dir = week_dir / "input"
        output_dir = week_dir / "output"
        output_dir.mkdir(parents=True, exist_ok=True)
        if input_dir.exists():
            shutil.rmtree(input_dir)
        input_dir.mkdir(parents=True, exist_ok=True)
        for source in sorted(sources):
            (input_dir / source).mkdir(parents=True, exist_ok=True)


def canonicalize_existing_week_dirs(weeks: dict[int, WeekMeta]) -> None:
    for week, _start, path in discover_existing_week_dirs():
        meta = weeks.get(week)
        if meta is None:
            continue
        canonical = WPR_ROOT / meta.folder_name
        if path == canonical:
            continue
        canonical.mkdir(parents=True, exist_ok=True)
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
            if item.is_dir():
                shutil.rmtree(item)
            else:
                item.unlink(missing_ok=True)
            continue

        if item.is_dir() and item.name == "Plans":
            merge_move(item, output_dir / "Plans")
            continue
        if item.is_dir() and item.name in LEGACY_INPUT_NAMES:
            shutil.rmtree(item)
            continue
        if item.is_file():
            merge_move(item, output_dir / "Reports" / item.name)
            continue
        merge_move(item, output_dir / item.name)


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


def resolve_week_for_weekly_file(path: Path, weeks: dict[int, WeekMeta]) -> int | None:
    match = WEEK_FILE_RE.search(path.name)
    if match:
        return int(match.group(1))

    range_match = WEEK_RANGE_RE.search(path.name)
    if range_match:
        return int(range_match.group(2))

    iso_match = ISO_DATE_RE.search(path.stem)
    if iso_match:
        return week_for_date(parse_iso_date(iso_match.group(1)), weeks)

    mdy_match = MDY_DATE_RE.search(path.stem)
    if mdy_match:
        month, day, year = map(int, mdy_match.groups())
        return week_for_date(date(year, month, day), weeks)

    return None


def copy_file_into_week(src: Path, dest: Path, stats: dict[int, int], week: int) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src, dest)
    stats[week] += 1


def populate_weekly_inputs(weeks: dict[int, WeekMeta], stats: dict[int, int]) -> list[str]:
    skipped: list[str] = []
    weekly_root = MONITORING_ROOT / "Weekly"
    for src in weekly_root.rglob("*"):
        if not src.is_file() or src.name in IGNORED_NAMES:
            continue
        week = resolve_week_for_weekly_file(src, weeks)
        if week is None:
            skipped.append(str(src.relative_to(SALES_ROOT)))
            continue
        rel = src.relative_to(weekly_root)
        dest = WPR_ROOT / weeks[week].folder_name / "input" / rel
        copy_file_into_week(src, dest, stats, week)
    return skipped


def split_csv_by_week(
    src: Path,
    weeks: dict[int, WeekMeta],
    rel_dest: Path,
    date_field: str,
    parser,
    stats: dict[int, int],
) -> dict[int, int]:
    row_counts: dict[int, int] = defaultdict(int)
    file_handles: dict[int, tuple[object, csv.DictWriter]] = {}

    with src.open("r", newline="", encoding="utf-8-sig") as infile:
        reader = csv.DictReader(infile)
        if not reader.fieldnames:
            return row_counts

        for row in reader:
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


def populate_daily_inputs(weeks: dict[int, WeekMeta], stats: dict[int, int]) -> None:
    split_csv_by_week(
        src=MONITORING_ROOT / "Daily" / "Account Health Dashboard (API)" / "account-health.csv",
        weeks=weeks,
        rel_dest=Path("Account Health Dashboard (API)") / "account-health.csv",
        date_field="date",
        parser=parse_iso_date,
        stats=stats,
    )

    split_csv_by_week(
        src=MONITORING_ROOT / "Daily" / "Voice of the Customer (Manual)" / "voc-by-asin.csv",
        weeks=weeks,
        rel_dest=Path("Voice of the Customer (Manual)") / "voc-by-asin.csv",
        date_field="date",
        parser=parse_iso_date,
        stats=stats,
    )


def populate_hourly_inputs(weeks: dict[int, WeekMeta], stats: dict[int, int]) -> None:
    hourly_root = MONITORING_ROOT / "Hourly" / "Listing Attributes (API)"
    split_csv_by_week(
        src=hourly_root / "Listings-Changes-History.csv",
        weeks=weeks,
        rel_dest=Path("Listing Attributes (API)") / "Listings-Changes-History.csv",
        date_field="snapshot_timestamp_utc",
        parser=parse_timestamp,
        stats=stats,
    )


def main() -> None:
    weeks = build_weeks()
    input_file_counts: dict[int, int] = defaultdict(int)

    canonicalize_existing_week_dirs(weeks)

    for meta in weeks.values():
        migrate_existing_week_payload(meta)

    remove_legacy_output_snapshots(weeks)
    create_input_scaffold(weeks)
    migrate_top_level_ppc_audits(weeks)

    skipped_weekly_files = populate_weekly_inputs(weeks, input_file_counts)
    populate_daily_inputs(weeks, input_file_counts)
    populate_hourly_inputs(weeks, input_file_counts)

    print("Rebuilt WPR week folders:")
    for week in sorted(weeks):
        meta = weeks[week]
        label = f"Week {week:02d}{' (Partial)' if meta.partial else ''}"
        print(
            f"  {label}: {meta.start_date.isoformat()} to {meta.end_date.isoformat()} "
            f"-> {input_file_counts.get(week, 0)} input files"
        )

    if skipped_weekly_files:
        print("\nSkipped monitoring files without a resolvable week:")
        for path in skipped_weekly_files:
            print(f"  {path}")


if __name__ == "__main__":
    main()
