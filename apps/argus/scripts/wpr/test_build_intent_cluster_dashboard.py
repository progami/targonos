import csv
import os
import sys
import tempfile
import unittest
from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path


SCRIPT_DIR = Path(__file__).resolve().parent
SCRIPT_PATH = SCRIPT_DIR / "build_intent_cluster_dashboard.py"


def load_module(data_dir: Path):
    os.environ["WPR_DATA_DIR"] = str(data_dir)
    if str(SCRIPT_DIR) not in sys.path:
        sys.path.insert(0, str(SCRIPT_DIR))
    spec = spec_from_file_location(f"build_intent_cluster_dashboard_{id(data_dir)}", SCRIPT_PATH)
    module = module_from_spec(spec)
    assert spec.loader is not None
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


class ChangeLogDateFormatTest(unittest.TestCase):
    def test_formats_iso_date_as_human_readable_day(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            data_dir = Path(tmp_dir) / "Sales" / "WPR" / "wpr-workspace" / "output"
            data_dir.mkdir(parents=True, exist_ok=True)
            module = load_module(data_dir)
            self.assertEqual(
                module.format_change_log_date_label("2026-03-08"),
                "08 Mar 2026 (Sunday)",
            )


class ListingChangeAggregationTest(unittest.TestCase):
    def test_groups_changes_by_timestamp_and_fields(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            sales_root = Path(tmp_dir) / "Sales"
            data_dir = sales_root / "WPR" / "wpr-workspace" / "output"
            data_dir.mkdir(parents=True, exist_ok=True)
            week_input_dir = sales_root / "WPR" / "Week 1 - 2025-12-28 (Sun)" / "input" / "Listing Attributes (API)"
            week_input_dir.mkdir(parents=True, exist_ok=True)
            csv_path = week_input_dir / "Listings-Changes-History.csv"
            with csv_path.open("w", newline="", encoding="utf-8") as handle:
                writer = csv.DictWriter(
                    handle,
                    fieldnames=[
                        "owner_type",
                        "changed",
                        "snapshot_timestamp_utc",
                        "changed_fields",
                        "asin",
                    ],
                )
                writer.writeheader()
                writer.writerow(
                    {
                        "owner_type": "our",
                        "changed": "yes",
                        "snapshot_timestamp_utc": "2026-01-02T12:00:00Z",
                        "changed_fields": "listing_price_changed",
                        "asin": "B001234567",
                    }
                )
                writer.writerow(
                    {
                        "owner_type": "our",
                        "changed": "yes",
                        "snapshot_timestamp_utc": "2026-01-02T12:00:00Z",
                        "changed_fields": "listing_price_changed",
                        "asin": "B009876543",
                    }
                )
                writer.writerow(
                    {
                        "owner_type": "competitor",
                        "changed": "yes",
                        "snapshot_timestamp_utc": "2026-01-02T12:00:00Z",
                        "changed_fields": "listing_price_changed",
                        "asin": "B000000000",
                    }
                )
            module = load_module(data_dir)
            entries = module.load_listing_change_entries(
                {
                    "W01": {
                        "week_number": 1,
                        "start_date": "2025-12-28",
                    }
                }
            )

            self.assertEqual(len(entries), 1)
            self.assertEqual(entries[0]["week_label"], "W01")
            self.assertEqual(entries[0]["title"], "Price update across 2 ASINs")
            self.assertEqual(entries[0]["asins"], ["B001234567", "B009876543"])
            self.assertEqual(entries[0]["summary"], "Listing price")


class ManualChangeLogParsingTest(unittest.TestCase):
    def test_parses_standardized_plan_log_metadata(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            sales_root = Path(tmp_dir) / "Sales"
            data_dir = sales_root / "WPR" / "wpr-workspace" / "output"
            data_dir.mkdir(parents=True, exist_ok=True)

            week_dir = sales_root / "WPR" / "Week 16 - 2026-04-12 (Sun)" / "output" / "Plans"
            week_dir.mkdir(parents=True, exist_ok=True)
            log_path = week_dir / "W16_Content_update_across_2_ASINs_Log_2026-04-20.md"
            log_path.write_text(
                "\n".join(
                    [
                        "# Content update across 2 ASINs",
                        "",
                        "Entry date: 2026-04-20",
                        "Source: Plan Log",
                        "Type: CONTENT",
                        "ASINs: B09HXC3NL8, B0CR1GSBQ9",
                        "Fields: Backend terms, Bullet points",
                        "",
                        "## Change Summary",
                        "Backend terms and bullets refreshed.",
                        "",
                        "## What Changed (Observed)",
                        "- Rewrote backend terms for root coverage.",
                        "- Tightened bullet hierarchy for mobile.",
                        "",
                        "## Status",
                        "- Submitted in Seller Central.",
                    ]
                ),
                encoding="utf-8",
            )

            module = load_module(data_dir)
            entries = module.load_manual_change_logs(
                {
                    "W16": {
                        "week_number": 16,
                        "start_date": "2026-04-12",
                    }
                }
            )

            self.assertEqual(len(entries), 1)
            self.assertEqual(entries[0]["source"], "Plan Log")
            self.assertEqual(entries[0]["category"], "CONTENT")
            self.assertEqual(entries[0]["asins"], ["B09HXC3NL8", "B0CR1GSBQ9"])
            self.assertEqual(entries[0]["field_labels"], ["Backend terms", "Bullet points"])
            self.assertEqual(
                entries[0]["highlights"],
                [
                    "Rewrote backend terms for root coverage.",
                    "Tightened bullet hierarchy for mobile.",
                ],
            )


if __name__ == "__main__":
    unittest.main()
