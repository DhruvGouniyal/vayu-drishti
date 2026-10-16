"""Coverage reports and checks that turn silent gaps into explicit warnings."""

from __future__ import annotations

import pandas as pd

from vayu import config
from vayu.ingest import weather

MIN_COVERAGE = 50.0  # % of season hours below which a station-season is flagged
MIN_WEATHER_COVERAGE = 95.0
LIVE_AQI_MAX_AGE = pd.Timedelta(hours=3)
CORE_SATELLITES = ("SNPP", "NOAA20")  # always expected; NOAA-21 only has data from 2024


def _season_window(year: int) -> tuple[pd.Timestamp, pd.Timestamp]:
    start, end = config.season_dates(year)
    return pd.Timestamp(start.isoformat(), tz="UTC"), pd.Timestamp(end.isoformat(), tz="UTC") + pd.Timedelta(days=1)


def aqi_coverage(df: pd.DataFrame, seasons: list[int], column: str = "aqi") -> pd.DataFrame:
    """% of season hours (1 Oct - 30 Nov) with a non-null `column`, station x season."""
    stations = [s.key for s in config.STATIONS]
    table = {}
    for year in seasons:
        t0, t1 = _season_window(year)
        expected = (t1 - t0) / pd.Timedelta(hours=1)
        window = df[(df["time_utc"] >= t0) & (df["time_utc"] < t1) & df[column].notna()]
        hours = window.groupby("station_id")["time_utc"].nunique().reindex(stations, fill_value=0)
        table[year] = (hours / expected * 100).round(1)
    return pd.DataFrame(table, index=pd.Index(stations, name="station"))


def fires_by_satellite(df: pd.DataFrame) -> pd.DataFrame:
    """Fire detections per season (year) and satellite, with a total column."""
    counts = pd.crosstab(df["time_utc"].dt.year.rename("season"), df["satellite"].astype(str))
    return counts.assign(total=counts.sum(axis=1))


def check_aqi(df: pd.DataFrame, seasons: list[int]) -> list[str]:
    """One warning per station-season whose AQI, PM2.5 or PM10 coverage is below MIN_COVERAGE."""
    tables = {label: aqi_coverage(df, seasons, col) for col, label in (("aqi", "AQI"), ("pm25", "PM2.5"), ("pm10", "PM10"))}
    warnings = []
    for station in tables["AQI"].index:
        for year in seasons:
            pcts = {label: table.loc[station, year] for label, table in tables.items()}
            if all(p == 0 for p in pcts.values()):
                warnings.append(f"{station} {year}: NO DATA (season missing; see data/README.md for CPCB download)")
            elif low := [f"{label} {p:.0f}%" for label, p in pcts.items() if p < MIN_COVERAGE]:
                warnings.append(f"{station} {year}: low coverage ({', '.join(low)})")
    return warnings


def check_fires(df: pd.DataFrame, seasons: list[int]) -> list[str]:
    counts = fires_by_satellite(df) if len(df) else pd.DataFrame()
    warnings = []
    for year in seasons:
        if year not in counts.index:
            warnings.append(f"{year}: NO fire detections")
            continue
        missing = [sat for sat in CORE_SATELLITES if counts.loc[year].get(sat, 0) == 0]
        if missing:
            warnings.append(f"{year}: no detections from {', '.join(missing)}")
    return warnings


def check_weather(df: pd.DataFrame, seasons: list[int]) -> list[str]:
    points = len(weather.grid_points())
    warnings = []
    for year in seasons:
        t0, t1 = _season_window(year)
        expected = points * (t1 - t0) / pd.Timedelta(hours=1)
        got = ((df["time_utc"] >= t0) & (df["time_utc"] < t1)).sum()
        if got / expected * 100 < MIN_WEATHER_COVERAGE:
            warnings.append(f"{year}: only {got / expected:.0%} of expected point-hours")
    return warnings


def check_live_aqi(df: pd.DataFrame) -> list[str]:
    latest = df.loc[df["aqi"].notna(), "time_utc"].max() if len(df) else None
    if latest is None or pd.isna(latest):
        return ["no hour with a computable AQI"]
    age = pd.Timestamp.now(tz="UTC").floor("h") - latest
    if age > LIVE_AQI_MAX_AGE:
        return [f"latest AQI is {age.total_seconds() / 3600:.0f} h old ({latest:%Y-%m-%d %H:%M} UTC)"]
    return []
