"""Parquet schemas and I/O so every dataset follows the same conventions.

Conventions: `time_utc` is tz-aware UTC, coordinates are `lat`/`lon` (WGS84),
and every row carries a `source` string saying where it came from.
"""

from __future__ import annotations

from pathlib import Path

import pandas as pd

from vayu import config

UTC_TIME = "datetime64[ns, UTC]"

SCHEMAS: dict[str, dict[str, str]] = {
    "fires": {
        "time_utc": UTC_TIME,
        "lat": "float64",
        "lon": "float64",
        "frp": "float64",  # fire radiative power, MW
        "confidence": "string",  # low / nominal / high
        "satellite": "string",  # SNPP / NOAA20 / NOAA21
        "product": "string",  # NRT or SP (standard/archive)
        "daynight": "string",
        "fire_type": "Int8",  # SP only: 0 vegetation, 2 static land source (e.g. refinery flare)
        "state": "string",
        "district": "string",
        "source": "string",
    },
    "weather": {
        "time_utc": UTC_TIME,
        "point_id": "string",
        "lat": "float64",
        "lon": "float64",
        **{var: "float64" for var in config.WEATHER_VARS},
        "source": "string",
    },
    "aqi": {
        "time_utc": UTC_TIME,  # start of the averaging hour
        "station_id": "string",
        "station_name": "string",
        "lat": "float64",
        "lon": "float64",
        "pm25": "float64",  # µg/m³, hourly mean
        "pm10": "float64",
        "pm25_24h": "float64",  # trailing 24 h mean used for AQI
        "pm10_24h": "float64",
        "aqi": "float64",  # Indian NAQI from PM only
        "aqi_category": "string",
        "prominent_pollutant": "string",
        "source": "string",
    },
}

SORT_KEYS = {"fires": ["time_utc"], "weather": ["point_id", "time_utc"], "aqi": ["station_id", "time_utc"]}


def conform(df: pd.DataFrame, kind: str) -> pd.DataFrame:
    """Return `df` with exactly the schema's columns, order and dtypes."""
    schema = SCHEMAS[kind]
    out = df.reindex(columns=list(schema))
    for col, dtype in schema.items():
        if dtype == UTC_TIME:
            out[col] = pd.to_datetime(out[col], utc=True)
        else:
            out[col] = out[col].astype(dtype)
    return out.sort_values(SORT_KEYS[kind]).reset_index(drop=True)


def empty(kind: str) -> pd.DataFrame:
    return conform(pd.DataFrame(), kind)


def write(df: pd.DataFrame, name: str, kind: str) -> Path:
    """Conform and write `df` to data/processed/<name>.parquet."""
    path = config.processed_dir() / f"{name}.parquet"
    conform(df, kind).to_parquet(path, index=False)
    return path


def read(name: str) -> pd.DataFrame:
    return pd.read_parquet(config.processed_dir() / f"{name}.parquet")
