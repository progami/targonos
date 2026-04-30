from __future__ import annotations

import os
from dataclasses import dataclass


@dataclass(frozen=True)
class WprMarketConfig:
    market: str
    hero_asin: str
    competitor_asin: str
    competitor_brand: str
    datadive_niche_id: str


def resolve_argus_market() -> str:
    raw = os.environ.get("ARGUS_MARKET")
    if raw is None:
        return "us"
    value = raw.strip().lower()
    if value == "":
        return "us"
    if value in {"us", "uk"}:
        return value
    raise RuntimeError(f"Unsupported Argus market: {raw}")


def required_env(name: str) -> str:
    value = os.environ.get(name)
    if value is None or value.strip() == "":
        raise RuntimeError(f"{name} is required for WPR market config.")
    return value.strip()


def wpr_market_config(market: str | None = None) -> WprMarketConfig:
    selected_market = market or resolve_argus_market()
    suffix = selected_market.upper()
    return WprMarketConfig(
        market=selected_market,
        hero_asin=required_env(f"WPR_HERO_ASIN_{suffix}").upper(),
        competitor_asin=required_env(f"WPR_COMPETITOR_ASIN_{suffix}").upper(),
        competitor_brand=required_env(f"WPR_COMPETITOR_BRAND_{suffix}"),
        datadive_niche_id=required_env(f"DATADIVE_NICHE_ID_{suffix}"),
    )
