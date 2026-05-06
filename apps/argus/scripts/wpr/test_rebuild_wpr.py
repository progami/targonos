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


def load_module(data_dir: Path, monitoring_root: Path):
    os.environ["WPR_DATA_DIR"] = str(data_dir)
    os.environ["ARGUS_MARKET"] = "us"
    os.environ["ARGUS_MONITORING_ROOT_US"] = str(monitoring_root)
    if str(SCRIPT_DIR) not in sys.path:
        sys.path.insert(0, str(SCRIPT_DIR))
    spec = spec_from_file_location(f"rebuild_wpr_{id(data_dir)}", SCRIPT_PATH)
    module = module_from_spec(spec)
    assert spec.loader is not None
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


class RebuildWprTest(unittest.TestCase):
    def test_slices_listing_attribute_history_and_preserves_existing_inputs(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            sales_root = Path(tmp_dir) / "Sales"
            monitoring_root = Path(tmp_dir) / "Monitoring"
            wpr_data_dir = sales_root / "WPR" / "wpr-workspace" / "output"
            wpr_data_dir.mkdir(parents=True, exist_ok=True)

            weekly_root = monitoring_root / "Weekly" / "Dummy Source"
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
                writer = csv.DictWriter(handle, fieldnames=["snapshot_timestamp_utc"])
                writer.writeheader()
                writer.writerow({"snapshot_timestamp_utc": "2026-01-01T12:00:00Z"})
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

            week_one_input_dir = sales_root / "WPR" / "Week 1 - 2025-12-28 (Sun)" / "input" / "Listing Attributes (API)"
            week_two_input_dir = sales_root / "WPR" / "Week 2 - 2026-01-04 (Sun) (Partial)" / "input" / "Listing Attributes (API)"
            self.assertTrue((week_one_input_dir / "Listings-Changes-History.csv").exists())
            self.assertTrue((week_two_input_dir / "Listings-Snapshot-History.csv").exists())
            self.assertFalse((week_one_input_dir / "latest_state.json").exists())
            self.assertTrue(preserved_input.exists())
            self.assertTrue(legacy_input.exists())
            self.assertTrue(partial_input.exists())

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

            weekly_root = monitoring_root / "Weekly" / "Dummy Source"
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
                / "Week 2 - 2026-01-04 (Sun)"
                / "input"
                / "Manual Source"
                / "manual.csv"
            )
            self.assertTrue(canonical_input.exists())
            self.assertTrue(partial_input.exists())

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


if __name__ == "__main__":
    unittest.main()
