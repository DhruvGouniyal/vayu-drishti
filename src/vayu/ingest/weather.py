"""Hourly weather from Open-Meteo for Chandigarh and a grid over Punjab + Haryana.

History comes from the historical-forecast API (archived model runs), so training
inputs look like the live forecasts the model will see at inference time. Where that
archive lacks boundary layer height (2023), the gap is filled from ERA5 reanalysis.
"""

from __future__ import annotations

import hashlib
import json
import logging
from collections.abc import Iterator

import numpy as np
import pandas as pd

from vayu import config
from vayu.http import CacheMode, FetchError, fetch_cached
from vayu.ingest.common import combine_partial

log = logging.getLogger(__name__)

FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
HISTORICAL_FORECAST_URL = "https://historical-forecast-api.open-meteo.com/v1/forecast"
ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive"

GRID_STEP = 0.5  # degrees -> 80 grid points + Chandigarh
BATCH_SIZE = 10  # locations per request; keeps each call well under Open-Meteo's per-minute weight
HISTORY_INTERVAL = 6.0  # seconds between history calls (free tier: 600 weighted calls/min)
FORECAST_DAYS = 3
PAST_DAYS = 2  # recent observed context for live features


def grid_points(step: float = GRID_STEP) -> pd.DataFrame:
    """Chandigarh plus a regular lat/lon grid covering the study bbox."""
    west, south, east, north = config.BBOX
    lats = np.arange(np.ceil(south / step) * step, north + 1e-9, step)
    lons = np.arange(np.ceil(west / step) * step, east + 1e-9, step)
    rows = [("chandigarh", *config.CHANDIGARH)]
    rows += [(f"g{lat:.2f}_{lon:.2f}", round(lat, 4), round(lon, 4)) for lat in lats for lon in lons]
    return pd.DataFrame(rows, columns=["point_id", "lat", "lon"])


def backfill(seasons: list[int], mode: CacheMode) -> pd.DataFrame:
    """Hourly weather for every grid point over each stubble season."""
    frames, errors, total = [], [], 0
    for year in seasons:
        start, end = config.season_dates(year)
        for batch in _batches(grid_points()):
            total += 1
            try:
                frames.append(_history_batch(batch, start.isoformat(), end.isoformat(), mode))
            except FetchError as exc:
                errors.append(str(exc))
                log.warning("Open-Meteo history %s batch failed: %s", year, exc)
    return combine_partial(frames, errors, total, "Open-Meteo history")


def live(mode: CacheMode) -> pd.DataFrame:
    """Forecast for the next FORECAST_DAYS days (plus PAST_DAYS of recent hours)."""
    frames, errors = [], []
    batches = list(_batches(grid_points()))
    for batch in batches:
        params = _params(batch, forecast_days=FORECAST_DAYS, past_days=PAST_DAYS, hourly=",".join(config.WEATHER_VARS))
        try:
            text = _fetch(FORECAST_URL, "forecast", params, mode, min_interval=1.0)
            frames.append(parse_openmeteo(text, batch, "open-meteo:forecast"))
        except FetchError as exc:
            errors.append(str(exc))
            log.warning("Open-Meteo forecast batch failed: %s", exc)
    return combine_partial(frames, errors, len(batches), "Open-Meteo forecast")


def parse_openmeteo(text: str, batch: pd.DataFrame, source: str) -> pd.DataFrame:
    """Flatten a (multi-location) Open-Meteo response into one row per point and hour."""
    payload = json.loads(text)
    items = payload if isinstance(payload, list) else [payload]
    if len(items) != len(batch):
        raise FetchError(f"Open-Meteo returned {len(items)} locations, expected {len(batch)}")
    frames = []
    for item, point in zip(items, batch.itertuples(index=False)):
        hourly = pd.DataFrame(item["hourly"])
        hourly["time_utc"] = pd.to_datetime(hourly.pop("time"), utc=True)
        # Keep the requested coordinates (not Open-Meteo's snapped cell) so keys stay stable.
        frames.append(hourly.assign(point_id=point.point_id, lat=point.lat, lon=point.lon))
    return pd.concat(frames, ignore_index=True).assign(source=source)


def fill_blh(main: pd.DataFrame, era5: pd.DataFrame) -> pd.DataFrame:
    """Fill missing boundary_layer_height in `main` from the ERA5 frame."""
    blh = era5[["time_utc", "point_id", "boundary_layer_height"]].rename(columns={"boundary_layer_height": "_era5"})
    merged = main.merge(blh, on=["time_utc", "point_id"], how="left")
    merged["boundary_layer_height"] = pd.to_numeric(merged["boundary_layer_height"]).fillna(merged.pop("_era5"))
    return merged


def _history_batch(batch: pd.DataFrame, start: str, end: str, mode: CacheMode) -> pd.DataFrame:
    params = _params(batch, start_date=start, end_date=end)
    text = _fetch(HISTORICAL_FORECAST_URL, f"histfc_{start}", {**params, "hourly": ",".join(config.WEATHER_VARS)}, mode)
    df = parse_openmeteo(text, batch, "open-meteo:historical-forecast")
    if pd.to_numeric(df["boundary_layer_height"]).isna().any():
        try:
            era5_params = {**params, "hourly": "boundary_layer_height", "models": "era5"}
            era5 = parse_openmeteo(_fetch(ARCHIVE_URL, f"era5_{start}", era5_params, mode), batch, "era5")
            df = fill_blh(df, era5)
        except FetchError as exc:
            log.warning("ERA5 boundary-layer fill failed, leaving gaps: %s", exc)
    return df


def _params(batch: pd.DataFrame, **extra: object) -> dict:
    return {
        "latitude": ",".join(f"{v:.4f}" for v in batch["lat"]),
        "longitude": ",".join(f"{v:.4f}" for v in batch["lon"]),
        "timezone": "GMT",
        "wind_speed_unit": "ms",
        **extra,
    }


def _fetch(url: str, prefix: str, params: dict, mode: CacheMode, min_interval: float = HISTORY_INTERVAL) -> str:
    digest = hashlib.sha1(json.dumps(params, sort_keys=True).encode()).hexdigest()[:10]
    cache = config.raw_dir("open_meteo") / f"{prefix}_{digest}.json"
    return fetch_cached(
        url, cache, mode=mode, params=params, validate=_validate, throttle_key="open-meteo", min_interval=min_interval
    )


def _validate(text: str) -> None:
    payload = json.loads(text)
    if isinstance(payload, dict) and payload.get("error"):
        raise ValueError(f"Open-Meteo error: {payload.get('reason')}")


def _batches(points: pd.DataFrame) -> Iterator[pd.DataFrame]:
    for i in range(0, len(points), BATCH_SIZE):
        yield points.iloc[i : i + BATCH_SIZE]
