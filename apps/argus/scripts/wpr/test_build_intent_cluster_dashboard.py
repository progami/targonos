import csv
import os
import sys
import tempfile
import unittest
from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path


SCRIPT_DIR = Path(__file__).resolve().parent
SCRIPT_PATH = SCRIPT_DIR / "build_intent_cluster_dashboard.py"


def load_module(data_dir: Path, market: str = "us"):
    os.environ["WPR_DATA_DIR"] = str(data_dir)
    os.environ["ARGUS_MARKET"] = market
    os.environ["WPR_HERO_ASIN_US"] = "B09HXC3NL8"
    os.environ["WPR_HERO_ASIN_UK"] = "B09HXC3NL8"
    os.environ["WPR_COMPETITOR_ASIN_US"] = "B0DQDWV1SV"
    os.environ["WPR_COMPETITOR_ASIN_UK"] = "B08QZHS7V6"
    os.environ["WPR_COMPETITOR_BRAND_US"] = "Axgatoxe"
    os.environ["WPR_COMPETITOR_BRAND_UK"] = "ARVO"
    os.environ["DATADIVE_NICHE_ID_US"] = "79IvywKLfF"
    os.environ["DATADIVE_NICHE_ID_UK"] = "NqAfkOXzuP"
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


class MarketTaxonomyTest(unittest.TestCase):
    def test_uk_assigns_dust_sheet_terms_to_dust_sheet_cluster(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            data_dir = Path(tmp_dir) / "Sales" / "WPR" / "wpr-workspace" / "output"
            data_dir.mkdir(parents=True, exist_ok=True)
            module = load_module(data_dir, market="uk")

            self.assertEqual(
                module.assign_cluster("dust sheets for decorating"),
                ("Dust Sheet", "Dust Sheet for Decorating"),
            )
            self.assertEqual(
                module.assign_cluster("heavy duty dust sheet"),
                ("Dust Sheet", "Dust Sheet"),
            )


class DefaultWeekSelectionTest(unittest.TestCase):
    def test_defaults_to_latest_stable_week(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            data_dir = Path(tmp_dir) / "Sales" / "WPR" / "wpr-workspace" / "output"
            data_dir.mkdir(parents=True, exist_ok=True)
            module = load_module(data_dir)
            week_meta = {
                "W16": {"week_number": 16, "week_label": "W16", "start_date": "2026-04-12"},
                "W17": {"week_number": 17, "week_label": "W17", "start_date": "2026-04-19"},
                "W18": {"week_number": 18, "week_label": "W18", "start_date": "2026-04-26"},
            }

            self.assertEqual(
                module.select_default_week_label(["W16", "W17", "W18"], week_meta, module.date(2026, 4, 28)),
                "W16",
            )

    def test_chart_week_order_excludes_current_and_newest_completed_week(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            data_dir = Path(tmp_dir) / "Sales" / "WPR" / "wpr-workspace" / "output"
            data_dir.mkdir(parents=True, exist_ok=True)
            module = load_module(data_dir)
            week_meta = {
                "W16": {"week_number": 16, "week_label": "W16", "start_date": "2026-04-12"},
                "W17": {"week_number": 17, "week_label": "W17", "start_date": "2026-04-19"},
                "W18": {"week_number": 18, "week_label": "W18", "start_date": "2026-04-26"},
            }

            self.assertEqual(
                module.chart_week_order(["W16", "W17", "W18"], week_meta, module.date(2026, 4, 28)),
                ["W16"],
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
            self.assertEqual(entries[0]["category"], "Content")
            self.assertEqual(entries[0]["asins"], ["B09HXC3NL8", "B0CR1GSBQ9"])
            self.assertEqual(entries[0]["field_labels"], ["Backend terms", "Bullet points"])
            self.assertEqual(
                entries[0]["highlights"],
                [
                    "Rewrote backend terms for root coverage.",
                    "Tightened bullet hierarchy for mobile.",
                ],
            )

    def test_legacy_plan_log_without_type_defaults_to_content(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            sales_root = Path(tmp_dir) / "Sales"
            data_dir = sales_root / "WPR" / "wpr-workspace" / "output"
            data_dir.mkdir(parents=True, exist_ok=True)

            week_dir = sales_root / "WPR" / "Week 12 - 2026-03-15 (Sun)" / "output" / "Plans"
            week_dir.mkdir(parents=True, exist_ok=True)
            log_path = week_dir / "Week12_Legacy_EBC_Log_2026-03-21.md"
            log_path.write_text(
                "\n".join(
                    [
                        "# Legacy EBC update",
                        "",
                        "Entry date: 2026-03-21",
                        "Source: Plan Log",
                        "",
                        "## Change Summary",
                        "EBC modules refreshed for the current pack structure.",
                        "",
                        "## What Changed (Observed)",
                        "- Updated EBC comparison blocks.",
                    ]
                ),
                encoding="utf-8",
            )

            module = load_module(data_dir)
            entries = module.load_manual_change_logs(
                {
                    "W12": {
                        "week_number": 12,
                        "start_date": "2026-03-15",
                    }
                }
            )

            self.assertEqual(len(entries), 1)
            self.assertEqual(entries[0]["category"], "Content")


class SourceOverviewTest(unittest.TestCase):
    def test_scan_sources_emits_presence_only_cells(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            sales_root = Path(tmp_dir) / "Sales"
            data_dir = sales_root / "WPR" / "wpr-workspace" / "output"
            data_dir.mkdir(parents=True, exist_ok=True)

            week_input_dir = (
                sales_root
                / "WPR"
                / "Week 16 - 2026-04-12 (Sun)"
                / "input"
                / "Business Reports (API)"
                / "Sales & Traffic (API)"
            )
            week_input_dir.mkdir(parents=True, exist_ok=True)
            (week_input_dir / "W16_2026-04-18_SalesTraffic-ByAsin.csv").write_text("asin\nB000000001\n", encoding="utf-8")
            (week_input_dir / "W16_2026-04-18_SalesTraffic-ByDate.csv").write_text("date\n2026-04-18\n", encoding="utf-8")

            module = load_module(data_dir)
            overview = module.scan_sources(
                {
                    "W16": {
                        "week_number": 16,
                        "start_date": "2026-04-12",
                    }
                }
            )

            sales_and_traffic = next(
                row for row in overview["matrix"]
                if row["name"] == "Sales & Traffic"
            )
            self.assertEqual(sales_and_traffic["weeks"]["W16"], {"present": True})


if __name__ == "__main__":
    unittest.main()
