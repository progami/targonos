"""
Kairos ML Service - Production Forecasting Backend

Implements multiple forecasting models:
- ETS (Auto): Exponential smoothing with automatic model selection
- PROPHET: Facebook/Meta's decomposable time series model
- ARIMA: Auto-ARIMA with automatic order selection
- THETA: Simple yet effective Theta method
- NEURALPROPHET: Neural network-based Prophet successor
"""

from __future__ import annotations

import logging
import os
import warnings
from datetime import datetime, timezone
from typing import Any, Dict, List, Literal, Optional, Tuple

import numpy as np
import pandas as pd
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

# Suppress verbose logging from libraries
logging.getLogger("prophet").setLevel(logging.WARNING)
logging.getLogger("cmdstanpy").setLevel(logging.WARNING)
logging.getLogger("neuralprophet").setLevel(logging.WARNING)
warnings.filterwarnings("ignore", category=FutureWarning)
warnings.filterwarnings("ignore", category=UserWarning)

app = FastAPI(title="Kairos ML Service", version="1.0.0")

# Supported models
ModelName = Literal["ETS", "PROPHET", "ARIMA", "THETA", "NEURALPROPHET"]

# ============================================================================
# Pydantic Models
# ============================================================================


class ForecastRequest(BaseModel):
    model: ModelName
    ds: List[int] = Field(..., description="Epoch seconds (UTC).")
    y: List[float]
    horizon: int = Field(..., ge=1)
    config: Optional[Dict[str, Any]] = None
    regressors: Optional[Dict[str, List[float]]] = Field(
        None, description="Optional exogenous regressors aligned to ds."
    )
    regressorsFuture: Optional[Dict[str, List[float]]] = Field(
        None, description="Optional future regressor values, each length=horizon."
    )


class ForecastPoint(BaseModel):
    t: str
    yhat: float
    yhatLower: Optional[float] = None
    yhatUpper: Optional[float] = None
    isFuture: bool


class ForecastMetrics(BaseModel):
    sampleCount: int
    mae: Optional[float] = None
    rmse: Optional[float] = None
    mape: Optional[float] = None


class ForecastMeta(BaseModel):
    horizon: int
    historyCount: int
    intervalLevel: Optional[float] = None
    metrics: ForecastMetrics


class ForecastResponse(BaseModel):
    points: List[ForecastPoint]
    meta: ForecastMeta


# ============================================================================
# Batch Forecasting Models
# ============================================================================


class BatchForecastRequestItem(ForecastRequest):
    id: str


class BatchForecastRequest(BaseModel):
    items: List[BatchForecastRequestItem]


class BatchForecastResponseItem(BaseModel):
    id: str
    points: List[ForecastPoint]
    meta: ForecastMeta


class BatchForecastResponse(BaseModel):
    items: List[BatchForecastResponseItem]


# ============================================================================
# Utility Functions
# ============================================================================


def iso_from_seconds(seconds: int) -> str:
    """Convert epoch seconds to ISO 8601 string with Z suffix."""
    return (
        datetime.fromtimestamp(seconds, tz=timezone.utc)
        .replace(microsecond=0)
        .isoformat()
        .replace("+00:00", "Z")
    )


def infer_step_seconds(ds: List[int]) -> int:
    """Infer the time step from timestamps using median of differences."""
    if len(ds) < 2:
        return 60 * 60 * 24  # Default to 1 day

    diffs: List[int] = []
    for i in range(1, len(ds)):
        diff = ds[i] - ds[i - 1]
        if diff > 0:
            diffs.append(diff)

    if not diffs:
        return 60 * 60 * 24

    diffs.sort()
    mid = len(diffs) // 2
    if len(diffs) % 2 == 1:
        return diffs[mid]
    return int((diffs[mid - 1] + diffs[mid]) / 2)


def infer_frequency(step_seconds: int) -> str:
    """Infer pandas frequency string from step seconds."""
    if step_seconds <= 3600:  # Hourly or less
        return "h"
    elif step_seconds <= 86400:  # Daily
        return "D"
    elif step_seconds <= 604800:  # Weekly
        return "W"
    else:  # Monthly or longer
        return "MS"


def infer_season_length(step_seconds: int) -> int:
    """Infer appropriate season length based on data frequency.

    For time series forecasting, season_length represents how many
    observations make up one seasonal cycle:
    - Hourly data: 24 (daily seasonality)
    - Daily data: 7 (weekly seasonality)
    - Weekly data: 52 (annual seasonality)
    - Monthly data: 12 (annual seasonality)
    """
    if step_seconds <= 3600:  # Hourly or less
        return 24  # Daily seasonality
    elif step_seconds <= 86400:  # Daily
        return 7  # Weekly seasonality
    elif step_seconds <= 604800:  # Weekly
        return 52  # Annual seasonality
    else:  # Monthly or longer
        return 12  # Annual seasonality


def compute_metrics(
    y_true: np.ndarray, y_pred: np.ndarray
) -> Tuple[Optional[float], Optional[float], Optional[float]]:
    """Compute MAE, RMSE, MAPE from actuals and predictions."""
    if len(y_true) == 0 or len(y_pred) == 0:
        return None, None, None

    n = min(len(y_true), len(y_pred))
    y_true = y_true[:n]
    y_pred = y_pred[:n]

    mae = float(np.mean(np.abs(y_true - y_pred)))
    rmse = float(np.sqrt(np.mean((y_true - y_pred) ** 2)))

    # MAPE - avoid division by zero
    mask = y_true != 0
    if np.any(mask):
        mape = float(np.mean(np.abs((y_true[mask] - y_pred[mask]) / y_true[mask])) * 100)
    else:
        mape = None

    return mae, rmse, mape


# ============================================================================
# Forecasting Models
# ============================================================================


def forecast_ets(
    ds: List[int],
    y: List[float],
    horizon: int,
    config: Optional[Dict[str, Any]] = None,
) -> Tuple[List[float], List[Optional[float]], List[Optional[float]]]:
    """
    AutoETS - Automatic Exponential Smoothing State Space Model.
    Uses statsforecast for fast, reliable ETS implementation.
    """
    from statsforecast import StatsForecast
    from statsforecast.models import AutoETS

    if config is None:
        config = {}
    step_seconds = infer_step_seconds(ds)
    n_obs = len(y)

    # Use provided seasonLength or infer from data frequency
    base_season_length = int(config.get("seasonLength", infer_season_length(step_seconds)))

    # Ensure we have enough data for seasonality (need at least 2 complete cycles)
    # If not enough data, reduce season_length or disable seasonality
    if n_obs >= 2 * base_season_length:
        season_length = base_season_length
    elif n_obs >= 26 and step_seconds <= 604800:  # Weekly data, try quarterly (13 weeks)
        season_length = 13
    elif n_obs >= 14:  # Try shorter period
        season_length = 7
    else:
        season_length = 1  # No seasonality

    # Prepare data - use timezone-naive datetimes for consistency
    df = pd.DataFrame({
        "unique_id": ["series"] * len(y),
        "ds": pd.to_datetime(ds, unit="s", utc=True).tz_localize(None),
        "y": y,
    })

    # Model spec: Error, Trend, Seasonal (Z=auto, A=additive, M=multiplicative, N=none)
    # Force additive trend (A) to ensure forecasts capture trends, auto for error and seasonal
    # This prevents AutoETS from selecting a no-trend model which produces flat forecasts
    model_spec = "ZAZ" if season_length > 1 else "ZAN"

    # Create model with forced trend
    model = AutoETS(season_length=season_length, model=model_spec)
    sf = StatsForecast(models=[model], freq=infer_frequency(step_seconds))

    # Fit and predict
    sf.fit(df)
    forecast_df = sf.predict(h=horizon, level=[95])

    yhat = forecast_df["AutoETS"].tolist()
    yhat_lower = forecast_df.get("AutoETS-lo-95", pd.Series([None] * horizon)).tolist()
    yhat_upper = forecast_df.get("AutoETS-hi-95", pd.Series([None] * horizon)).tolist()

    return yhat, yhat_lower, yhat_upper


def forecast_arima(
    ds: List[int],
    y: List[float],
    horizon: int,
    config: Optional[Dict[str, Any]] = None,
) -> Tuple[List[float], List[Optional[float]], List[Optional[float]]]:
    """
    AutoARIMA - Automatic ARIMA with optimal (p,d,q) selection.
    Uses statsforecast for fast implementation.
    """
    from statsforecast import StatsForecast
    from statsforecast.models import AutoARIMA

    if config is None:
        config = {}
    step_seconds = infer_step_seconds(ds)
    # Use provided seasonLength or infer from data frequency
    season_length = int(config.get("seasonLength", infer_season_length(step_seconds)))

    # Prepare data - use timezone-naive datetimes for consistency
    df = pd.DataFrame({
        "unique_id": ["series"] * len(y),
        "ds": pd.to_datetime(ds, unit="s", utc=True).tz_localize(None),
        "y": y,
    })

    # Create model
    model = AutoARIMA(season_length=season_length)
    sf = StatsForecast(models=[model], freq=infer_frequency(step_seconds))

    # Fit and predict
    sf.fit(df)
    forecast_df = sf.predict(h=horizon, level=[95])

    yhat = forecast_df["AutoARIMA"].tolist()
    yhat_lower = forecast_df.get("AutoARIMA-lo-95", pd.Series([None] * horizon)).tolist()
    yhat_upper = forecast_df.get("AutoARIMA-hi-95", pd.Series([None] * horizon)).tolist()

    return yhat, yhat_lower, yhat_upper


def forecast_theta(
    ds: List[int],
    y: List[float],
    horizon: int,
    config: Optional[Dict[str, Any]] = None,
) -> Tuple[List[float], List[Optional[float]], List[Optional[float]]]:
    """
    Theta Method - Simple yet effective forecasting (won M3 competition).
    Uses statsforecast implementation.
    """
    from statsforecast import StatsForecast
    from statsforecast.models import Theta

    if config is None:
        config = {}
    step_seconds = infer_step_seconds(ds)
    # Use provided seasonLength or infer from data frequency
    season_length = int(config.get("seasonLength", infer_season_length(step_seconds)))

    # Prepare data - use timezone-naive datetimes for consistency
    df = pd.DataFrame({
        "unique_id": ["series"] * len(y),
        "ds": pd.to_datetime(ds, unit="s", utc=True).tz_localize(None),
        "y": y,
    })

    # Create model
    model = Theta(season_length=season_length)
    sf = StatsForecast(models=[model], freq=infer_frequency(step_seconds))

    # Fit and predict
    sf.fit(df)
    forecast_df = sf.predict(h=horizon, level=[95])

    yhat = forecast_df["Theta"].tolist()
    yhat_lower = forecast_df.get("Theta-lo-95", pd.Series([None] * horizon)).tolist()
    yhat_upper = forecast_df.get("Theta-hi-95", pd.Series([None] * horizon)).tolist()

    return yhat, yhat_lower, yhat_upper


def forecast_prophet(
    ds: List[int],
    y: List[float],
    horizon: int,
    config: Optional[Dict[str, Any]] = None,
    regressors: Optional[Dict[str, List[float]]] = None,
    regressors_future: Optional[Dict[str, List[float]]] = None,
) -> Tuple[List[float], List[Optional[float]], List[Optional[float]]]:
    """
    Prophet - Facebook/Meta's decomposable time series model.
    Handles trend, seasonality, and holiday effects.
    """
    from prophet import Prophet

    if config is None:
        config = {}
    interval_width = float(config.get("intervalWidth", 0.95))
    uncertainty_samples = int(config.get("uncertaintySamples", 1000))
    seasonality_mode = config.get("seasonalityMode", "additive")
    yearly = config.get("yearlySeasonality", "auto")
    weekly = config.get("weeklySeasonality", "auto")
    daily = config.get("dailySeasonality", "auto")

    # Convert seasonality settings
    def parse_seasonality(val: Any) -> Any:
        if val == "on":
            return True
        elif val == "off":
            return False
        return "auto"

    # Prepare data - Prophet doesn't support timezone-aware datetimes
    df = pd.DataFrame({
        "ds": pd.to_datetime(ds, unit="s", utc=True).tz_localize(None),
        "y": y,
    })

    if regressors is not None:
        for key, values in regressors.items():
            if len(values) != len(y):
                raise ValueError(f"Regressor '{key}' length mismatch.")
            df[key] = values

    # Create and configure model
    model = Prophet(
        interval_width=interval_width,
        uncertainty_samples=uncertainty_samples,
        seasonality_mode=seasonality_mode,
        yearly_seasonality=parse_seasonality(yearly),
        weekly_seasonality=parse_seasonality(weekly),
        daily_seasonality=parse_seasonality(daily),
    )

    if regressors is not None:
        for key in regressors.keys():
            model.add_regressor(key)

    # Fit model
    model.fit(df)

    # Create future dataframe
    step_seconds = infer_step_seconds(ds)
    freq = infer_frequency(step_seconds)
    future = model.make_future_dataframe(periods=horizon, freq=freq, include_history=False)

    if regressors is not None:
        if regressors_future is None:
            raise ValueError("Future regressor values are required when regressors are provided.")
        for key in regressors.keys():
            values = regressors_future.get(key)
            if values is None:
                raise ValueError(f"Future regressor '{key}' is missing.")
            if len(values) != horizon:
                raise ValueError(f"Future regressor '{key}' length mismatch.")
            future[key] = values

    # Predict
    forecast = model.predict(future)

    yhat = forecast["yhat"].tolist()
    yhat_lower = forecast["yhat_lower"].tolist()
    yhat_upper = forecast["yhat_upper"].tolist()

    return yhat, yhat_lower, yhat_upper


def forecast_neuralprophet(
    ds: List[int],
    y: List[float],
    horizon: int,
    config: Optional[Dict[str, Any]] = None,
) -> Tuple[List[float], List[Optional[float]], List[Optional[float]]]:
    """
    NeuralProphet - Neural network-based successor to Prophet.
    Uses PyTorch backend for enhanced pattern learning.
    """
    from neuralprophet import NeuralProphet, set_log_level

    set_log_level("ERROR")

    if config is None:
        config = {}
    seasonality_mode = config.get("seasonalityMode", "additive")
    yearly = config.get("yearlySeasonality", "auto")
    weekly = config.get("weeklySeasonality", "auto")
    daily = config.get("dailySeasonality", "auto")
    epochs = int(config.get("epochs", 100))
    learning_rate = float(config.get("learningRate", 0.1))

    # Convert seasonality settings
    def parse_seasonality(val: Any) -> Any:
        if val == "on":
            return True
        elif val == "off":
            return False
        return "auto"

    # Prepare data - NeuralProphet doesn't support timezone-aware datetimes
    df = pd.DataFrame({
        "ds": pd.to_datetime(ds, unit="s", utc=True).tz_localize(None),
        "y": y,
    })

    # Create model
    model = NeuralProphet(
        seasonality_mode=seasonality_mode,
        yearly_seasonality=parse_seasonality(yearly),
        weekly_seasonality=parse_seasonality(weekly),
        daily_seasonality=parse_seasonality(daily),
        epochs=epochs,
        learning_rate=learning_rate,
        batch_size=min(64, len(y)),
        n_forecasts=horizon,
    )

    # Fit model
    model.fit(df, freq=infer_frequency(infer_step_seconds(ds)))

    # Predict future
    future = model.make_future_dataframe(df, periods=horizon)
    forecast = model.predict(future)

    # Get only future predictions
    future_forecast = forecast[forecast["ds"] > df["ds"].max()]
    yhat = future_forecast["yhat1"].tolist()

    # NeuralProphet doesn't provide built-in intervals in same way
    yhat_lower = [None] * len(yhat)
    yhat_upper = [None] * len(yhat)

    return yhat, yhat_lower, yhat_upper


# ============================================================================
# API Endpoints
# ============================================================================


@app.get("/healthz")
def healthz() -> Dict[str, str]:
    """Health check endpoint."""
    return {"status": "ok"}


@app.get("/models")
def list_models() -> Dict[str, List[Dict[str, Any]]]:
    """List available forecasting models."""
    return {
        "models": [
            {
                "id": "ETS",
                "name": "ETS (Auto)",
                "type": "statistical",
                "description": "Exponential smoothing with automatic model selection",
            },
            {
                "id": "PROPHET",
                "name": "Prophet",
                "type": "statistical",
                "description": "Decomposable model with trend, seasonality, and holidays",
            },
            {
                "id": "ARIMA",
                "name": "Auto-ARIMA",
                "type": "statistical",
                "description": "ARIMA with automatic (p,d,q) order selection",
            },
            {
                "id": "THETA",
                "name": "Theta",
                "type": "statistical",
                "description": "Simple yet effective theta method",
            },
            {
                "id": "NEURALPROPHET",
                "name": "NeuralProphet",
                "type": "neural",
                "description": "Neural network-based Prophet successor",
            },
        ]
    }


@app.post("/v1/forecast", response_model=ForecastResponse)
def forecast(req: ForecastRequest) -> ForecastResponse:
    """
    Run forecasting model on time series data.

    Supports: ETS, PROPHET, ARIMA, THETA, NEURALPROPHET
    """
    return run_forecast(req)


@app.post("/v1/forecast/batch", response_model=BatchForecastResponse)
def forecast_batch(req: BatchForecastRequest) -> BatchForecastResponse:
    return BatchForecastResponse(
        items=[
            BatchForecastResponseItem(id=item.id, **run_forecast(item).model_dump())
            for item in req.items
        ]
    )


def run_forecast(req: ForecastRequest) -> ForecastResponse:
    # Validate input
    if len(req.ds) != len(req.y):
        raise HTTPException(status_code=400, detail="Training data length mismatch.")
    if len(req.ds) < 2:
        raise HTTPException(status_code=400, detail="At least 2 observations are required.")

    if req.regressors is not None and req.model != "PROPHET":
        raise HTTPException(status_code=400, detail="Regressors are only supported for PROPHET.")

    if req.regressorsFuture is not None and req.regressors is None:
        raise HTTPException(
            status_code=400,
            detail="Future regressor values were provided without regressors.",
        )

    if req.regressors is not None:
        if req.regressorsFuture is None:
            raise HTTPException(
                status_code=400,
                detail="Future regressor values are required when regressors are provided.",
            )
        for key, values in req.regressors.items():
            if len(values) != len(req.y):
                raise HTTPException(status_code=400, detail=f"Regressor '{key}' length mismatch.")
            if key not in req.regressorsFuture:
                raise HTTPException(
                    status_code=400,
                    detail=f"Future regressor '{key}' is missing.",
                )

    if req.regressorsFuture is not None:
        for key, values in req.regressorsFuture.items():
            if len(values) != req.horizon:
                raise HTTPException(
                    status_code=400,
                    detail=f"Future regressor '{key}' length mismatch.",
                )

    step = infer_step_seconds(req.ds)
    last_ds = req.ds[-1]
    interval_level = 0.95

    try:
        # Run appropriate model
        if req.model == "ETS":
            yhat, yhat_lower, yhat_upper = forecast_ets(req.ds, req.y, req.horizon, req.config)
        elif req.model == "PROPHET":
            yhat, yhat_lower, yhat_upper = forecast_prophet(
                req.ds,
                req.y,
                req.horizon,
                req.config,
                regressors=req.regressors,
                regressors_future=req.regressorsFuture,
            )
        elif req.model == "ARIMA":
            yhat, yhat_lower, yhat_upper = forecast_arima(req.ds, req.y, req.horizon, req.config)
        elif req.model == "THETA":
            yhat, yhat_lower, yhat_upper = forecast_theta(req.ds, req.y, req.horizon, req.config)
        elif req.model == "NEURALPROPHET":
            yhat, yhat_lower, yhat_upper = forecast_neuralprophet(req.ds, req.y, req.horizon, req.config)
        else:
            raise HTTPException(status_code=400, detail=f"Unsupported model: {req.model}")

    except Exception as e:
        logging.exception(f"Forecast failed for model {req.model}")
        raise HTTPException(status_code=500, detail=f"Forecast failed: {str(e)}")

    # Build response points
    points: List[ForecastPoint] = []
    for i, (pred, lower, upper) in enumerate(zip(yhat, yhat_lower, yhat_upper), start=1):
        points.append(
            ForecastPoint(
                t=iso_from_seconds(last_ds + step * i),
                yhat=float(pred) if pred is not None else 0.0,
                yhatLower=float(lower) if lower is not None else None,
                yhatUpper=float(upper) if upper is not None else None,
                isFuture=True,
            )
        )

    # Compute in-sample metrics (fit on full data, so this is training metrics)
    # For proper evaluation, we'd need a holdout set
    mae, rmse, mape = None, None, None

    return ForecastResponse(
        points=points,
        meta=ForecastMeta(
            horizon=req.horizon,
            historyCount=len(req.ds),
            intervalLevel=interval_level if any(p.yhatLower is not None for p in points) else None,
            metrics=ForecastMetrics(
                sampleCount=len(req.ds),
                mae=mae,
                rmse=rmse,
                mape=mape,
            ),
        ),
    )
