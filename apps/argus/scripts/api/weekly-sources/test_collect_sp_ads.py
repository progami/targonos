import sys
import tempfile
import unittest
from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path


SCRIPT_PATH = Path(__file__).resolve().parent / "collect-sp-ads.py"


def load_module():
    spec = spec_from_file_location("collect_sp_ads_test_module", SCRIPT_PATH)
    module = module_from_spec(spec)
    assert spec.loader is not None
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


class CollectSpAdsTest(unittest.TestCase):
    def test_ads_env_for_market_requires_suffixed_values(self) -> None:
        module = load_module()
        with self.assertRaisesRegex(RuntimeError, "AMAZON_ADS_PROFILE_ID_UK"):
            module.ads_env_for_market(
                {
                    "AMAZON_ADS_API_BASE_URL_UK": "https://advertising-api-eu.amazon.com",
                    "AMAZON_ADS_CLIENT_ID_UK": "client",
                    "AMAZON_ADS_CLIENT_SECRET_UK": "secret",
                    "AMAZON_ADS_REFRESH_TOKEN_UK": "refresh",
                    "AMAZON_ADS_PROFILE_ID": "us-profile",
                    "AMAZON_LWA_TOKEN_URL_UK": "https://api.amazon.com/auth/o2/token",
                },
                "uk",
            )

    def test_ads_env_for_market_resolves_uk_profile(self) -> None:
        module = load_module()
        env = {
            "AMAZON_ADS_API_BASE_URL_UK": "https://advertising-api-eu.amazon.com",
            "AMAZON_ADS_CLIENT_ID_UK": "client",
            "AMAZON_ADS_CLIENT_SECRET_UK": "secret",
            "AMAZON_ADS_REFRESH_TOKEN_UK": "refresh",
            "AMAZON_ADS_PROFILE_ID_UK": "2113486122478986",
            "AMAZON_LWA_TOKEN_URL_UK": "https://api.amazon.com/auth/o2/token",
        }
        ads_env = module.ads_env_for_market(env, "uk")
        self.assertEqual(ads_env["AMAZON_ADS_API_BASE_URL"], "https://advertising-api-eu.amazon.com")
        self.assertEqual(ads_env["AMAZON_ADS_PROFILE_ID"], "2113486122478986")

    def test_reuse_requires_matching_market_and_profile(self) -> None:
        module = load_module()
        with tempfile.TemporaryDirectory() as tmp_dir:
            module.DEST_ROOT = Path(tmp_dir)
            week = {"code": "W17", "endDate": "2026-04-25"}
            output = module.output_path_for_week(week, "search_term")
            output.parent.mkdir(parents=True, exist_ok=True)
            output.write_text("date,searchTerm\n2026-04-20,dust sheets\n", encoding="utf-8")
            manifest = {
                "reports": {"search_term": [{"suffix": "main", "status": "COMPLETED"}]},
                "outputs": {"search_term": {"file": str(output)}},
            }
            entries = [("main", {}, [], [])]

            self.assertFalse(
                module.can_reuse_key_output(
                    manifest,
                    week,
                    "search_term",
                    entries,
                    {"market": "uk", "profileId": "2113486122478986"},
                )
            )

    def test_report_status_retries_transient_url_errors(self) -> None:
        module = load_module()
        calls = []

        def flaky_http_json(url, method="GET", headers=None, payload=None, timeout=90):
            calls.append((url, method, headers, payload, timeout))
            if len(calls) == 1:
                raise module.urllib.error.URLError("ssl eof")
            return 200, {"status": "PENDING"}

        module.http_json = flaky_http_json
        module.time.sleep = lambda _seconds: None

        self.assertEqual(module.get_report_status("https://ads.example", {}, "report-id"), {"status": "PENDING"})
        self.assertEqual(len(calls), 2)


if __name__ == "__main__":
    unittest.main()
