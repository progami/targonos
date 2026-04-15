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


def load_module(data_dir: Path):
    os.environ["WPR_DATA_DIR"] = str(data_dir)
    if str(SCRIPT_DIR) not in sys.path:
        sys.path.insert(0, str(SCRIPT_DIR))
    spec = spec_from_file_location(f"rebuild_wpr_{id(data_dir)}", SCRIPT_PATH)
    module = module_from_spec(spec)
    assert spec.loader is not None
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


class RebuildWprTest(unittest.TestCase):
    def test_only_copies_listing_changes_into_week_inputs(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            sales_root = Path(tmp_dir) / "Sales"
            monitoring_root = sales_root / "Monitoring"
            wpr_data_dir = sales_root / "WPR" / "wpr-workspace" / "output"
            wpr_data_dir.mkdir(parents=True, exist_ok=True)

            weekly_root = monitoring_root / "Weekly" / "Dummy Source"
            weekly_root.mkdir(parents=True, exist_ok=True)
            (weekly_root / "report_W01_2026-01-03.csv").write_text("header\nvalue\n", encoding="utf-8")

            account_health_root = monitoring_root / "Daily" / "Account Health Dashboard (API)"
            account_health_root.mkdir(parents=True, exist_ok=True)
            with (account_health_root / "account-health.csv").open("w", newline="", encoding="utf-8") as handle:
                writer = csv.DictWriter(handle, fieldnames=["date"])
                writer.writeheader()

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

            module = load_module(wpr_data_dir)
            module.main()

            week_one_input_dir = sales_root / "WPR" / "Week 1 - 2025-12-28 (Sun)" / "input" / "Listing Attributes (API)"
            self.assertTrue((week_one_input_dir / "Listings-Changes-History.csv").exists())
            self.assertFalse((week_one_input_dir / "Listings-Snapshot-History.csv").exists())
            self.assertFalse((week_one_input_dir / "latest_state.json").exists())
            self.assertFalse((sales_root / "WPR" / "Week 2 - 2026-01-04 (Sun) (Partial)").exists())


if __name__ == "__main__":
    unittest.main()
