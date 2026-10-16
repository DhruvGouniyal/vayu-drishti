"""Project-wide settings: paths, study area, stations, seasons and API keys."""

from __future__ import annotations

import os
from dataclasses import dataclass
from datetime import date
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[2]
load_dotenv(ROOT / ".env")

# Punjab + Haryana with a small margin: west, south, east, north (degrees).
BBOX: tuple[float, float, float, float] = (73.8, 27.6, 77.6, 32.6)
CHANDIGARH: tuple[float, float] = (30.7333, 76.7794)  # lat, lon of the city centre

DEFAULT_SEASONS: tuple[int, ...] = (2023, 2024, 2025)


def season_dates(year: int) -> tuple[date, date]:
    """Stubble-burning season window (1 Oct - 30 Nov) for a given year."""
    return date(year, 10, 1), date(year, 11, 30)


@dataclass(frozen=True)
class Station:
    key: str
    name: str
    lat: float  # CPCB coordinates (from the data.gov.in feed); OpenAQ's are used when discovered
    lon: float
    pattern: str  # regex matched against OpenAQ location names and CPCB file names


STATIONS: tuple[Station, ...] = (
    Station("sector22", "Sector 22, Chandigarh - CPCC", 30.735567, 76.775714, r"sector[\s_-]*22(?!\d)"),
    Station("sector25", "Sector 25, Chandigarh - CPCC", 30.751462, 76.762879, r"sector[\s_-]*25(?!\d)"),
    Station("sector53", "Sector 53, Chandigarh - CPCC", 30.719859, 76.738637, r"sector[\s_-]*53(?!\d)"),
)

# Open-Meteo hourly variables. 80/120 m and 925/850 hPa (~0.8/1.5 km) winds drive smoke transport.
WEATHER_VARS: tuple[str, ...] = (
    "wind_speed_10m",
    "wind_direction_10m",
    "wind_speed_80m",
    "wind_direction_80m",
    "wind_speed_120m",
    "wind_direction_120m",
    "wind_speed_925hPa",
    "wind_direction_925hPa",
    "wind_speed_850hPa",
    "wind_direction_850hPa",
    "temperature_2m",
    "relative_humidity_2m",
    "precipitation",
    "boundary_layer_height",
)

_PLACEHOLDERS = {"", "your_key_here", "changeme"}


def get_key(name: str) -> str | None:
    """Return an API key from the environment / .env, or None if unset or a placeholder."""
    value = os.getenv(name, "").strip()
    return None if value.lower() in _PLACEHOLDERS else value


def data_dir() -> Path:
    """Root data folder; override with VAYU_DATA_DIR (tests use this)."""
    return Path(os.getenv("VAYU_DATA_DIR") or ROOT / "data")


def _subdir(*parts: str) -> Path:
    path = data_dir().joinpath(*parts)
    path.mkdir(parents=True, exist_ok=True)
    return path


def raw_dir(source: str) -> Path:
    return _subdir("raw", source)


def processed_dir() -> Path:
    return _subdir("processed")


def manual_dir(source: str) -> Path:
    return _subdir("manual", source)


def static_dir() -> Path:
    return _subdir("static")
