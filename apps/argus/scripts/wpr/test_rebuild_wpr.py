import csv
import json
import os
import sys
import tempfile
import unittest
from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path


SCRIPT_DIR = Path(__file__).resolve().parent
SCRIPT_PATH = SCRIPT_DIR / "rebuild_wpr.py"


def load_module(data_dir: Path, monitoring_root: Path, market: str = "us"):
    os.environ["WPR_DATA_DIR"] = str(data_dir)
    os.environ["ARGUS_MARKET"] = market
    os.environ[f"ARGUS_MONITORING_ROOT_{market.upper()}"] = str(monitoring_root)
    if str(SCRIPT_DIR) not in sys.path:
        sys.path.insert(0, str(SCRIPT_DIR))
    spec = spec_from_file_location(f"rebuild_wpr_{id(data_dir)}", SCRIPT_PATH)
    module = module_from_spec(spec)
    assert spec.loader is not None
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def write_required_empty_sources(monitoring_root: Path) -> None:
    account_health_root = monitoring_root / "Daily" / "Account Health Dashboard (API)"
    account_health_root.mkdir(parents=True, exist_ok=True)
    with (account_health_root / "account-health.csv").open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=["date"])
        writer.writeheader()

    hourly_root = monitoring_root / "Hourly" / "Listing Attributes (API)"
    hourly_root.mkdir(parents=True, exist_ok=True)
    for name in ("Listings-Changes-History.csv", "Listings-Snapshot-History.csv"):
        with (hourly_root / name).open("w", newline="", encoding="utf-8") as handle:
            writer = csv.DictWriter(handle, fieldnames=["snapshot_timestamp_utc"])
            writer.writeheader()


class RebuildWprTest(unittest.TestCase):
    def test_slices_listing_attribute_changes_and_preserves_existing_inputs(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            sales_root = Path(tmp_dir) / "Sales"
            monitoring_root = Path(tmp_dir) / "Monitoring"
            wpr_data_dir = sales_root / "WPR" / "wpr-workspace" / "output"
            wpr_data_dir.mkdir(parents=True, exist_ok=True)

            weekly_root = monitoring_root / "Weekly" / "Business Reports (API)" / "Sales & Traffic (API)"
            weekly_root.mkdir(parents=True, exist_ok=True)
            (weekly_root / "report_W01_2026-01-03.csv").write_text("header\nvalue\n", encoding="utf-8")
            (weekly_root / "Glossary.docx").write_text("not a week file\n", encoding="utf-8")

            preserved_input = (
                sales_root
                / "WPR"
                / "Week 1 - 2025-12-28 (Sun)"
                / "input"
                / "Manual Source"
                / "preserved.csv"
            )
            preserved_input.parent.mkdir(parents=True, exist_ok=True)
            preserved_input.write_text("manual\nvalue\n", encoding="utf-8")
            legacy_input = sales_root / "WPR" / "Week 1 - 2025-12-28 (Sun)" / "Daily" / "legacy.csv"
            legacy_input.parent.mkdir(parents=True, exist_ok=True)
            legacy_input.write_text("legacy\nvalue\n", encoding="utf-8")
            partial_input = (
                sales_root
                / "WPR"
                / "Week 1 - 2025-12-28 (Sun) (Partial)"
                / "input"
                / "Manual Source"
                / "partial.csv"
            )
            partial_input.parent.mkdir(parents=True, exist_ok=True)
            partial_input.write_text("partial\nvalue\n", encoding="utf-8")

            account_health_root = monitoring_root / "Daily" / "Account Health Dashboard (API)"
            account_health_root.mkdir(parents=True, exist_ok=True)
            with (account_health_root / "account-health.csv").open("w", newline="", encoding="utf-8") as handle:
                writer = csv.DictWriter(handle, fieldnames=["date", "payload"])
                writer.writeheader()
                writer.writerow({"date": "2026-01-03", "payload": "x" * 150_000})

            voc_root = monitoring_root / "Daily" / "Voice of the Customer (Manual)"
            voc_root.mkdir(parents=True, exist_ok=True)
            with (voc_root / "voc-by-asin.csv").open("w", newline="", encoding="utf-8") as handle:
                writer = csv.DictWriter(handle, fieldnames=["date"])
                writer.writeheader()

            hourly_root = monitoring_root / "Hourly" / "Listing Attributes (API)"
            hourly_root.mkdir(parents=True, exist_ok=True)
            with (hourly_root / "Listings-Changes-History.csv").open("w", newline="", encoding="utf-8") as handle:
                writer = csv.DictWriter(handle, fieldnames=["snapshot_timestamp_utc", "owner_type", "changed", "changed_fields"])
                writer.writeheader()
                writer.writerow({
                    "snapshot_timestamp_utc": "2026-01-01T12:00:00Z",
                    "owner_type": "our",
                    "changed": "yes",
                    "changed_fields": "title_changed",
                })
                writer.writerow({
                    "snapshot_timestamp_utc": "2026-01-01T13:00:00Z",
                    "owner_type": "our",
                    "changed": "no",
                    "changed_fields": "",
                })
            with (hourly_root / "Listings-Snapshot-History.csv").open("w", newline="", encoding="utf-8") as handle:
                writer = csv.DictWriter(handle, fieldnames=["snapshot_timestamp_utc"])
                writer.writeheader()
                writer.writerow({"snapshot_timestamp_utc": "2026-01-08T12:00:00Z"})
            (hourly_root / "latest_state.json").write_text(
                json.dumps({"timestamp_utc": "2026-01-08T12:00:00Z"}),
                encoding="utf-8",
            )

            module = load_module(wpr_data_dir, monitoring_root)
            module.main()

            week_one_input_dir = sales_root / "WPR" / "W01" / "input" / "Listing Attributes (API)"
            week_two_input_dir = sales_root / "WPR" / "W02" / "input" / "Listing Attributes (API)"
            self.assertTrue((week_one_input_dir / "Listings-Changes-History.csv").exists())
            with (week_one_input_dir / "Listings-Changes-History.csv").open(newline="", encoding="utf-8") as handle:
                rows = list(csv.DictReader(handle))
            self.assertEqual(len(rows), 1)
            self.assertEqual(rows[0]["changed"], "yes")
            self.assertFalse((week_one_input_dir / "Listings-Snapshot-History.csv").exists())
            self.assertFalse((week_two_input_dir / "Listings-Snapshot-History.csv").exists())
            self.assertFalse((week_one_input_dir / "latest_state.json").exists())
            self.assertTrue((sales_root / "WPR" / "W01" / "input" / "Manual Source" / "preserved.csv").exists())
            self.assertTrue((sales_root / "WPR" / "W01" / "Daily" / "legacy.csv").exists())
            self.assertTrue((sales_root / "WPR" / "W01" / "input" / "Manual Source" / "partial.csv").exists())
            self.assertFalse(preserved_input.exists())
            self.assertFalse(legacy_input.exists())
            self.assertFalse(partial_input.exists())

    def test_copies_partial_week_payload_into_final_canonical_folder(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            sales_root = Path(tmp_dir) / "Sales"
            monitoring_root = Path(tmp_dir) / "Monitoring"
            wpr_data_dir = sales_root / "WPR" / "wpr-workspace" / "output"
            wpr_data_dir.mkdir(parents=True, exist_ok=True)

            partial_input = (
                sales_root
                / "WPR"
                / "Week 2 - 2026-01-04 (Sun) (Partial)"
                / "input"
                / "Manual Source"
                / "manual.csv"
            )
            partial_input.parent.mkdir(parents=True, exist_ok=True)
            partial_input.write_text("manual\nvalue\n", encoding="utf-8")

            weekly_root = monitoring_root / "Weekly" / "Business Reports (API)" / "Sales & Traffic (API)"
            weekly_root.mkdir(parents=True, exist_ok=True)
            (weekly_root / "report_W02_2026-01-10.csv").write_text("header\nvalue\n", encoding="utf-8")

            account_health_root = monitoring_root / "Daily" / "Account Health Dashboard (API)"
            account_health_root.mkdir(parents=True, exist_ok=True)
            with (account_health_root / "account-health.csv").open("w", newline="", encoding="utf-8") as handle:
                writer = csv.DictWriter(handle, fieldnames=["date"])
                writer.writeheader()

            hourly_root = monitoring_root / "Hourly" / "Listing Attributes (API)"
            hourly_root.mkdir(parents=True, exist_ok=True)
            for name in ("Listings-Changes-History.csv", "Listings-Snapshot-History.csv"):
                with (hourly_root / name).open("w", newline="", encoding="utf-8") as handle:
                    writer = csv.DictWriter(handle, fieldnames=["snapshot_timestamp_utc"])
                    writer.writeheader()

            module = load_module(wpr_data_dir, monitoring_root)
            module.main()

            canonical_input = (
                sales_root
                / "WPR"
                / "W02"
                / "input"
                / "Manual Source"
                / "manual.csv"
            )
            self.assertTrue(canonical_input.exists())
            self.assertFalse(partial_input.exists())

    def test_removes_generated_week_folders_without_source_payload(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            sales_root = Path(tmp_dir) / "Sales"
            monitoring_root = Path(tmp_dir) / "Monitoring"
            wpr_data_dir = sales_root / "WPR" / "wpr-workspace" / "output"
            wpr_data_dir.mkdir(parents=True, exist_ok=True)

            weekly_root = monitoring_root / "Weekly" / "Business Reports (API)" / "Sales & Traffic (API)"
            weekly_root.mkdir(parents=True, exist_ok=True)
            (weekly_root / "report_W03_2026-01-17.csv").write_text("header\nvalue\n", encoding="utf-8")

            account_health_root = monitoring_root / "Daily" / "Account Health Dashboard (API)"
            account_health_root.mkdir(parents=True, exist_ok=True)
            with (account_health_root / "account-health.csv").open("w", newline="", encoding="utf-8") as handle:
                writer = csv.DictWriter(handle, fieldnames=["date"])
                writer.writeheader()

            hourly_root = monitoring_root / "Hourly" / "Listing Attributes (API)"
            hourly_root.mkdir(parents=True, exist_ok=True)
            for name in ("Listings-Changes-History.csv", "Listings-Snapshot-History.csv"):
                with (hourly_root / name).open("w", newline="", encoding="utf-8") as handle:
                    writer = csv.DictWriter(handle, fieldnames=["snapshot_timestamp_utc"])
                    writer.writeheader()

            module = load_module(wpr_data_dir, monitoring_root)
            module.main()

            self.assertFalse((sales_root / "WPR" / "W01").exists())
            self.assertFalse((sales_root / "WPR" / "W02").exists())
            self.assertTrue((sales_root / "WPR" / "W03").exists())

    def test_routes_legacy_day_month_year_weekly_files(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            sales_root = Path(tmp_dir) / "Sales"
            monitoring_root = Path(tmp_dir) / "Monitoring"
            wpr_data_dir = sales_root / "WPR" / "wpr-workspace" / "output"
            wpr_data_dir.mkdir(parents=True, exist_ok=True)

            weekly_root = monitoring_root / "Weekly" / "Business Reports (API)" / "Sales & Traffic (API)"
            weekly_root.mkdir(parents=True, exist_ok=True)
            (weekly_root / "BusinessReport-21-04-2026.csv").write_text("header\nvalue\n", encoding="utf-8")
            (weekly_root / "GB_Search_catalogue_performance_Simple_Week_2026_04_18.csv").write_text(
                "header\nvalue\n",
                encoding="utf-8",
            )
            (weekly_root / "Products_Apr_21_2026.csv").write_text("header\nvalue\n", encoding="utf-8")
            (weekly_root / "Sponsored_Products_Search_term_report_-_Week_9.xlsx").write_text(
                "binary-ish\n",
                encoding="utf-8",
            )

            account_health_root = monitoring_root / "Daily" / "Account Health Dashboard (API)"
            account_health_root.mkdir(parents=True, exist_ok=True)
            with (account_health_root / "account-health.csv").open("w", newline="", encoding="utf-8") as handle:
                writer = csv.DictWriter(handle, fieldnames=["date"])
                writer.writeheader()
                writer.writerow({"date": "2026-04-21"})

            hourly_root = monitoring_root / "Hourly" / "Listing Attributes (API)"
            hourly_root.mkdir(parents=True, exist_ok=True)
            for name in ("Listings-Changes-History.csv", "Listings-Snapshot-History.csv"):
                with (hourly_root / name).open("w", newline="", encoding="utf-8") as handle:
                    writer = csv.DictWriter(handle, fieldnames=["snapshot_timestamp_utc"])
                    writer.writeheader()

            module = load_module(wpr_data_dir, monitoring_root)
            module.main()

            routed_file = (
                sales_root
                / "WPR"
                / "W17"
                / "input"
                / "Business Reports (API)"
                / "Sales & Traffic (API)"
                / "BusinessReport-21-04-2026.csv"
            )
            self.assertTrue(routed_file.exists())
            self.assertTrue(
                (
                    sales_root
                    / "WPR"
                    / "W16"
                    / "input"
                    / "Business Reports (API)"
                    / "Sales & Traffic (API)"
                    / "GB_Search_catalogue_performance_Simple_Week_2026_04_18.csv"
                ).exists()
            )

    def test_uk_routes_ambiguous_day_month_business_report_dates(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            sales_root = Path(tmp_dir) / "Sales"
            monitoring_root = Path(tmp_dir) / "Monitoring"
            wpr_data_dir = sales_root / "WPR" / "wpr-workspace" / "output"
            wpr_data_dir.mkdir(parents=True, exist_ok=True)

            weekly_root = monitoring_root / "Weekly" / "Business Reports (API)" / "Sales & Traffic (API)"
            weekly_root.mkdir(parents=True, exist_ok=True)
            (weekly_root / "BusinessReport-10-04-2026.csv").write_text("header\nvalue\n", encoding="utf-8")
            write_required_empty_sources(monitoring_root)

            module = load_module(wpr_data_dir, monitoring_root, market="uk")
            module.main()

            self.assertTrue(
                (
                    sales_root
                    / "WPR"
                    / "W15"
                    / "input"
                    / "Business Reports (API)"
                    / "Sales & Traffic (API)"
                    / "BusinessReport-10-04-2026.csv"
                ).exists()
            )
            self.assertFalse((sales_root / "WPR" / "W41").exists())

    def test_wpr_copies_only_needed_weekly_sources(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            sales_root = Path(tmp_dir) / "Sales"
            monitoring_root = Path(tmp_dir) / "Monitoring"
            wpr_data_dir = sales_root / "WPR" / "wpr-workspace" / "output"
            wpr_data_dir.mkdir(parents=True, exist_ok=True)

            tst_root = monitoring_root / "Weekly" / "Brand Analytics (API)" / "TST - Top Search Terms (API)"
            sellerboard_root = monitoring_root / "Weekly" / "Sellerboard (API)" / "SB - Orders Report (API)"
            manifest_root = monitoring_root / "Weekly" / "Ad Console" / "SP - Sponsored Products (API)"
            tst_root.mkdir(parents=True, exist_ok=True)
            sellerboard_root.mkdir(parents=True, exist_ok=True)
            manifest_root.mkdir(parents=True, exist_ok=True)
            (tst_root / "W01_2026-01-03_TST.csv").write_text("searchTerm,clickedAsin\nplastic sheet,B000000001\n", encoding="utf-8")
            (sellerboard_root / "W01_2026-01-03_orders.csv").write_text("order\n1\n", encoding="utf-8")
            (manifest_root / "W01_2026-01-03_SP-Manifest.json").write_text("{}\n", encoding="utf-8")
            stale_inventory = sales_root / "WPR" / "W01" / "input" / "Amazon Inventory Ledger (API)" / "ledger.csv"
            stale_inventory.parent.mkdir(parents=True, exist_ok=True)
            stale_inventory.write_text("sku\nabc\n", encoding="utf-8")
            write_required_empty_sources(monitoring_root)

            module = load_module(wpr_data_dir, monitoring_root)
            module.main()

            wpr_root = sales_root / "WPR" / "W01" / "input"
            self.assertTrue((wpr_root / "Brand Analytics (API)" / "TST - Top Search Terms (API)" / "W01_2026-01-03_TST.csv").exists())
            self.assertFalse((wpr_root / "Sellerboard (API)").exists())
            self.assertFalse((wpr_root / "Amazon Inventory Ledger (API)").exists())
            self.assertFalse((wpr_root / "Ad Console" / "SP - Sponsored Products (API)" / "W01_2026-01-03_SP-Manifest.json").exists())

    def test_uk_tst_rows_are_filtered_to_dust_sheet_terms(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            sales_root = Path(tmp_dir) / "Sales"
            monitoring_root = Path(tmp_dir) / "Monitoring"
            wpr_data_dir = sales_root / "WPR" / "wpr-workspace" / "output"
            wpr_data_dir.mkdir(parents=True, exist_ok=True)

            tst_root = monitoring_root / "Weekly" / "Brand Analytics (API)" / "TST - Top Search Terms (API)"
            tst_root.mkdir(parents=True, exist_ok=True)
            with (tst_root / "W01_2026-01-03_TST.csv").open("w", newline="", encoding="utf-8") as handle:
                writer = csv.DictWriter(handle, fieldnames=["searchTerm", "clickedAsin"])
                writer.writeheader()
                writer.writerow({"searchTerm": "dust sheet", "clickedAsin": "B09HXC3NL8"})
                writer.writerow({"searchTerm": "plastic cover", "clickedAsin": "B09HXC3NL8"})
                writer.writerow({"searchTerm": "heavy dust sheets", "clickedAsin": "B08QZHS7V6"})
            with (tst_root / "W02_2026-01-10_TST.csv").open("w", newline="", encoding="utf-8") as handle:
                writer = csv.DictWriter(handle, fieldnames=["searchTerm", "clickedAsin"])
                writer.writeheader()
                writer.writerow({"searchTerm": "plastic cover", "clickedAsin": "B09HXC3NL8"})
            write_required_empty_sources(monitoring_root)

            module = load_module(wpr_data_dir, monitoring_root, market="uk")
            module.main()

            copied = sales_root / "WPR" / "W01" / "input" / "Brand Analytics (API)" / "TST - Top Search Terms (API)" / "W01_2026-01-03_TST.csv"
            with copied.open(newline="", encoding="utf-8-sig") as handle:
                rows = list(csv.DictReader(handle))
            self.assertEqual([row["searchTerm"] for row in rows], ["dust sheet", "heavy dust sheets"])
            self.assertFalse(
                (
                    sales_root
                    / "WPR"
                    / "W02"
                    / "input"
                    / "Brand Analytics (API)"
                    / "TST - Top Search Terms (API)"
                    / "W02_2026-01-10_TST.csv"
                ).exists()
            )

    def test_rejects_google_drive_mount_paths(self) -> None:
        cloud_wpr_data_dir = (
            Path("/Users/test/Library/CloudStorage/GoogleDrive-test@example.com/Shared drives/Dust Sheets - US")
            / "Sales"
            / "WPR"
            / "wpr-workspace"
            / "output"
        )
        with tempfile.TemporaryDirectory() as tmp_dir:
            with self.assertRaisesRegex(RuntimeError, "must be local"):
                load_module(cloud_wpr_data_dir, Path(tmp_dir) / "Monitoring")

    def test_canonicalizes_browser_duplicate_download_names(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            sales_root = Path(tmp_dir) / "Sales"
            monitoring_root = Path(tmp_dir) / "Monitoring"
            wpr_data_dir = sales_root / "WPR" / "wpr-workspace" / "output"
            wpr_data_dir.mkdir(parents=True, exist_ok=True)

            weekly_root = monitoring_root / "Weekly" / "Business Reports (API)" / "Sales & Traffic (API)"
            weekly_root.mkdir(parents=True, exist_ok=True)
            (weekly_root / "report_W01_2026-01-03 (1).csv").write_text("header\nvalue\n", encoding="utf-8")
            write_required_empty_sources(monitoring_root)

            module = load_module(wpr_data_dir, monitoring_root)
            module.main()

            canonical = sales_root / "WPR" / "W01" / "input" / "Business Reports (API)" / "Sales & Traffic (API)" / "report_W01_2026-01-03.csv"
            duplicate = sales_root / "WPR" / "W01" / "input" / "Business Reports (API)" / "Sales & Traffic (API)" / "report_W01_2026-01-03 (1).csv"
            self.assertTrue(canonical.exists())
            self.assertFalse(duplicate.exists())

    def test_quarantines_divergent_browser_duplicate_download_names(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            sales_root = Path(tmp_dir) / "Sales"
            monitoring_root = Path(tmp_dir) / "Monitoring"
            wpr_data_dir = sales_root / "WPR" / "wpr-workspace" / "output"
            wpr_data_dir.mkdir(parents=True, exist_ok=True)

            weekly_root = monitoring_root / "Weekly" / "Business Reports (API)" / "Sales & Traffic (API)"
            weekly_root.mkdir(parents=True, exist_ok=True)
            (weekly_root / "report_W01_2026-01-03.csv").write_text("header\nvalue\n", encoding="utf-8")
            (weekly_root / "report_W01_2026-01-03 (1).csv").write_text("header\nother\n", encoding="utf-8")
            write_required_empty_sources(monitoring_root)

            module = load_module(wpr_data_dir, monitoring_root)
            module.main()

            canonical = sales_root / "WPR" / "W01" / "input" / "Business Reports (API)" / "Sales & Traffic (API)" / "report_W01_2026-01-03.csv"
            duplicate = weekly_root / "report_W01_2026-01-03 (1).csv"
            rejected = (
                sales_root
                / "WPR"
                / "wpr-workspace"
                / "rejected"
                / "Monitoring"
                / "Weekly"
                / "Business Reports (API)"
                / "Sales & Traffic (API)"
                / "report_W01_2026-01-03 (1).csv"
            )
            ledger = sales_root / "WPR" / "wpr-workspace" / "rejected" / "rebuild-conflicts.jsonl"
            self.assertEqual(canonical.read_text(encoding="utf-8"), "header\nvalue\n")
            self.assertFalse(duplicate.exists())
            self.assertEqual(rejected.read_text(encoding="utf-8"), "header\nother\n")
            self.assertIn("different content", ledger.read_text(encoding="utf-8"))

    def test_quarantines_legacy_week_conflicts(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            sales_root = Path(tmp_dir) / "Sales"
            monitoring_root = Path(tmp_dir) / "Monitoring"
            wpr_data_dir = sales_root / "WPR" / "wpr-workspace" / "output"
            wpr_data_dir.mkdir(parents=True, exist_ok=True)

            canonical = sales_root / "WPR" / "W01" / "input" / "Manual Source" / "manual.csv"
            legacy = (
                sales_root
                / "WPR"
                / "Week 1 - 2025-12-28 (Sun)"
                / "input"
                / "Manual Source"
                / "manual.csv"
            )
            canonical.parent.mkdir(parents=True, exist_ok=True)
            legacy.parent.mkdir(parents=True, exist_ok=True)
            canonical.write_text("canonical\n", encoding="utf-8")
            legacy.write_text("legacy\n", encoding="utf-8")
            write_required_empty_sources(monitoring_root)

            module = load_module(wpr_data_dir, monitoring_root)
            module.main()

            rejected = (
                sales_root
                / "WPR"
                / "wpr-workspace"
                / "rejected"
                / "WPR"
                / "Week 1 - 2025-12-28 (Sun)"
                / "input"
                / "Manual Source"
                / "manual.csv"
            )
            self.assertEqual(canonical.read_text(encoding="utf-8"), "canonical\n")
            self.assertFalse(legacy.exists())
            self.assertEqual(rejected.read_text(encoding="utf-8"), "legacy\n")

    def test_quarantines_noncanonical_files_inside_canonical_week_trees(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            sales_root = Path(tmp_dir) / "Sales"
            monitoring_root = Path(tmp_dir) / "Monitoring"
            wpr_data_dir = sales_root / "WPR" / "wpr-workspace" / "output"
            wpr_data_dir.mkdir(parents=True, exist_ok=True)

            canonical = sales_root / "WPR" / "W01" / "input" / "Manual Source" / "manual.csv"
            duplicate = sales_root / "WPR" / "W01" / "input" / "Manual Source" / "manual (1).csv"
            canonical.parent.mkdir(parents=True, exist_ok=True)
            canonical.write_text("canonical\n", encoding="utf-8")
            duplicate.write_text("duplicate\n", encoding="utf-8")
            write_required_empty_sources(monitoring_root)

            module = load_module(wpr_data_dir, monitoring_root)
            module.main()

            rejected = (
                sales_root
                / "WPR"
                / "wpr-workspace"
                / "rejected"
                / "WPR"
                / "W01"
                / "input"
                / "Manual Source"
                / "manual (1).csv"
            )
            self.assertEqual(canonical.read_text(encoding="utf-8"), "canonical\n")
            self.assertFalse(duplicate.exists())
            self.assertEqual(rejected.read_text(encoding="utf-8"), "duplicate\n")

    def test_quarantines_rejected_suffix_names_without_a_destination(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            sales_root = Path(tmp_dir) / "Sales"
            monitoring_root = Path(tmp_dir) / "Monitoring"
            wpr_data_dir = sales_root / "WPR" / "wpr-workspace" / "output"
            wpr_data_dir.mkdir(parents=True, exist_ok=True)

            bad_file = sales_root / "WPR" / "W01" / "input" / "Manual Source" / "manual__backup.csv"
            bad_file.parent.mkdir(parents=True, exist_ok=True)
            bad_file.write_text("backup\n", encoding="utf-8")
            write_required_empty_sources(monitoring_root)

            module = load_module(wpr_data_dir, monitoring_root)
            module.main()

            rejected = (
                sales_root
                / "WPR"
                / "wpr-workspace"
                / "rejected"
                / "WPR"
                / "W01"
                / "input"
                / "Manual Source"
                / "manual__backup.csv"
            )
            self.assertFalse(bad_file.exists())
            self.assertEqual(rejected.read_text(encoding="utf-8"), "backup\n")

    def test_clears_stale_rebuild_quarantine_before_run(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            sales_root = Path(tmp_dir) / "Sales"
            monitoring_root = Path(tmp_dir) / "Monitoring"
            wpr_data_dir = sales_root / "WPR" / "wpr-workspace" / "output"
            wpr_data_dir.mkdir(parents=True, exist_ok=True)

            stale_rejected = sales_root / "WPR" / "wpr-workspace" / "rejected" / "stale.csv"
            stale_rejected.parent.mkdir(parents=True, exist_ok=True)
            stale_rejected.write_text("stale\n", encoding="utf-8")
            write_required_empty_sources(monitoring_root)

            module = load_module(wpr_data_dir, monitoring_root)
            module.main()

            self.assertFalse(stale_rejected.exists())
            self.assertFalse((sales_root / "WPR" / "wpr-workspace" / "rejected").exists())


if __name__ == "__main__":
    unittest.main()
