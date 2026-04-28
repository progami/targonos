import csv
import os
import sys
import tempfile
import unittest
from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path


SCRIPT_DIR = Path(__file__).resolve().parent
SCRIPT_PATH = SCRIPT_DIR / "validate_sources.py"


def load_module(data_dir: Path, market: str):
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
    spec = spec_from_file_location(f"validate_sources_{id(data_dir)}_{market}", SCRIPT_PATH)
    module = module_from_spec(spec)
    assert spec.loader is not None
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def write_csv(path: Path, headers: list[str], rows: list[dict[str, str]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=headers)
        writer.writeheader()
        writer.writerows(rows)


class ValidateSourcesTest(unittest.TestCase):
    def test_uk_validation_rejects_us_duplicate_critical_file(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            root = Path(tmp_dir)
            us_sales_root = root / "Dust Sheets - US" / "Sales"
            uk_sales_root = root / "Dust Sheets - UK" / "Sales"
            os.environ["ARGUS_SALES_ROOT_US"] = str(us_sales_root)
            os.environ["ARGUS_SALES_ROOT_UK"] = str(uk_sales_root)

            rel = Path("Monitoring/Weekly/Ad Console/SP - Sponsored Products (API)/SP - Search Term Report (API)/W17_2026-04-25_SP-SearchTerm.csv")
            for sales_root in (us_sales_root, uk_sales_root):
                write_csv(
                    sales_root / rel,
                    ["date", "searchTerm", "clicks"],
                    [{"date": "2026-04-20", "searchTerm": "plastic drop cloth", "clicks": "4"}],
                )

            data_dir = uk_sales_root / "WPR" / "wpr-workspace" / "output"
            data_dir.mkdir(parents=True, exist_ok=True)
            module = load_module(data_dir, "uk")

            with self.assertRaisesRegex(ValueError, "duplicates US file"):
                module.validate_market_sources()

    def test_duplicate_check_uses_latest_source_file(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            root = Path(tmp_dir)
            us_sales_root = root / "Dust Sheets - US" / "Sales"
            uk_sales_root = root / "Dust Sheets - UK" / "Sales"
            os.environ["ARGUS_SALES_ROOT_US"] = str(us_sales_root)
            os.environ["ARGUS_SALES_ROOT_UK"] = str(uk_sales_root)

            relative_dir = Path("Ad Console/SP - Sponsored Products (API)/SP - Search Term Report (API)")
            rule = None

            old_rel = Path("Monitoring/Weekly") / relative_dir / "W16_2026-04-18_SP-SearchTerm.csv"
            latest_rel = Path("Monitoring/Weekly") / relative_dir / "W17_2026-04-25_SP-SearchTerm.csv"
            for sales_root in (us_sales_root, uk_sales_root):
                write_csv(
                    sales_root / old_rel,
                    ["date", "searchTerm", "clicks"],
                    [{"date": "2026-04-13", "searchTerm": "plastic drop cloth", "clicks": "4"}],
                )
            write_csv(
                us_sales_root / latest_rel,
                ["date", "searchTerm", "clicks"],
                [{"date": "2026-04-20", "searchTerm": "plastic drop cloth", "clicks": "4"}],
            )
            write_csv(
                uk_sales_root / latest_rel,
                ["date", "searchTerm", "clicks"],
                [{"date": "2026-04-20", "searchTerm": "dust sheet", "clicks": "4"}],
            )

            data_dir = uk_sales_root / "WPR" / "wpr-workspace" / "output"
            data_dir.mkdir(parents=True, exist_ok=True)
            module = load_module(data_dir, "uk")
            rule = module.SourceRule("SP Search Term", relative_dir)

            self.assertEqual(module.validate_duplicate_market_files("uk", [rule]), [])

    def test_uk_validation_rejects_wrong_datadive_niche(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            uk_sales_root = Path(tmp_dir) / "Dust Sheets - UK" / "Sales"
            os.environ["ARGUS_SALES_ROOT_UK"] = str(uk_sales_root)

            manifest = uk_sales_root / "Monitoring/Weekly/Datadive (API)/W17_2026-04-25_DD-Manifest.json"
            manifest.parent.mkdir(parents=True, exist_ok=True)
            manifest.write_text('{"nicheId":"79IvywKLfF","heroAsin":"B09HXC3NL8"}', encoding="utf-8")

            data_dir = uk_sales_root / "WPR" / "wpr-workspace" / "output"
            data_dir.mkdir(parents=True, exist_ok=True)
            module = load_module(data_dir, "uk")

            with self.assertRaisesRegex(ValueError, "DATADIVE_NICHE_ID_UK"):
                module.validate_datadive_manifest()


if __name__ == "__main__":
    unittest.main()
