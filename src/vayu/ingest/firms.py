"""NASA FIRMS VIIRS active-fire detections over Punjab + Haryana."""

from __future__ import annotations

import io
import logging
from datetime import date, timedelta
from pathlib import Path

import pandas as pd

from vayu import config, geo
from vayu.http import CacheMode, FetchError, fetch_cached
from vayu.ingest.common import combine_partial

log = logging.getLogger(__name__)

BASE_URL = "https://firms.modaps.eosdis.nasa.gov/api"
MAX_DAY_RANGE = 5  # FIRMS area API limit per request
LIVE_DAY_RANGE = 3
# satellite -> (near-real-time source, standard/archive source). NOAA-21 has no SP archive yet.
SOURCES: dict[str, tuple[str, str | None]] = {
    "SNPP": ("VIIRS_SNPP_NRT", "VIIRS_SNPP_SP"),
    "NOAA20": ("VIIRS_NOAA20_NRT", "VIIRS_NOAA20_SP"),
    "NOAA21": ("VIIRS_NOAA21_NRT", None),
}
CONFIDENCE = {"l": "low", "n": "nominal", "h": "high"}

Availability = dict[str, tuple[date, date]]
Job = tuple[str, str, str, Path]  # satellite, source, url, cache path


def backfill(seasons: list[int], mode: CacheMode) -> pd.DataFrame:
    """All VIIRS detections for the given stubble seasons (SP where archived, else NRT)."""
    key = _map_key(mode)
    availability = _availability(key, mode)
    jobs: list[Job] = []
    for year in seasons:
        start, end = config.season_dates(year)
        for satellite, source, first, days in plan_requests(start, end, availability):
            url = f"{_area_url(key, source, days)}/{first.isoformat()}"
            cache = config.raw_dir("firms") / f"{source}_{first:%Y%m%d}_{days}d.csv"
            jobs.append((satellite, source, url, cache))
    return _collect(jobs, mode)


def live(mode: CacheMode) -> pd.DataFrame:
    """NRT detections from the last LIVE_DAY_RANGE days, all three satellites."""
    key = _map_key(mode)
    jobs = [
        (satellite, nrt, _area_url(key, nrt, LIVE_DAY_RANGE), config.raw_dir("firms") / f"live_{nrt}.csv")
        for satellite, (nrt, _) in SOURCES.items()
    ]
    return _collect(jobs, mode)


def plan_requests(start: date, end: date, availability: Availability) -> list[tuple[str, str, date, int]]:
    """Split [start, end] into <=5-day requests per satellite, preferring SP over NRT per day."""
    plan = []
    for satellite, (nrt, sp) in SOURCES.items():
        skipped = 0
        day = start
        while day <= end:
            source = _pick_source(day, nrt, sp, availability)
            if source is None:
                skipped += 1
                day += timedelta(days=1)
                continue
            first, days = day, 0
            while day <= end and days < MAX_DAY_RANGE and _pick_source(day, nrt, sp, availability) == source:
                day += timedelta(days=1)
                days += 1
            plan.append((satellite, source, first, days))
        if skipped:
            log.info("FIRMS %s: no data available for %d day(s) between %s and %s", satellite, skipped, start, end)
    return plan


def parse_firms_csv(text: str, satellite: str, source: str) -> pd.DataFrame:
    """Turn a FIRMS area CSV into our fire schema (without districts)."""
    raw = pd.read_csv(io.StringIO(text), dtype={"acq_date": str, "acq_time": str, "confidence": str})
    hhmm = raw["acq_time"].str.zfill(4)
    confidence = raw["confidence"].str.lower()
    return pd.DataFrame(
        {
            "time_utc": pd.to_datetime(raw["acq_date"] + " " + hhmm, format="%Y-%m-%d %H%M", utc=True),
            "lat": raw["latitude"],
            "lon": raw["longitude"],
            "frp": raw["frp"],
            "confidence": confidence.map(CONFIDENCE).fillna(confidence),
            "satellite": satellite,
            "product": "SP" if source.endswith("_SP") else "NRT",
            "daynight": raw.get("daynight"),
            "fire_type": raw["type"] if "type" in raw else pd.NA,
            "source": f"firms:{source}",
        }
    )


def dedupe(df: pd.DataFrame) -> pd.DataFrame:
    """Drop repeated detections (same satellite, pixel and time), keeping SP over NRT."""
    keyed = df.assign(
        _rank=df["product"].map({"SP": 0, "NRT": 1}),
        _lat=df["lat"].round(4),
        _lon=df["lon"].round(4),
    )
    keyed = keyed.sort_values("_rank", kind="stable").drop_duplicates(["satellite", "time_utc", "_lat", "_lon"])
    return keyed.drop(columns=["_rank", "_lat", "_lon"]).sort_values("time_utc").reset_index(drop=True)


def assumed_availability(today: date) -> Availability:
    """Rough fallback when the availability endpoint can't be reached: SP lags ~3 months."""
    cutoff = today - timedelta(days=90)
    return {
        "VIIRS_SNPP_SP": (date(2012, 1, 20), cutoff),
        "VIIRS_NOAA20_SP": (date(2018, 4, 1), cutoff),
        "VIIRS_SNPP_NRT": (cutoff + timedelta(days=1), today),
        "VIIRS_NOAA20_NRT": (cutoff + timedelta(days=1), today),
        "VIIRS_NOAA21_NRT": (date(2024, 1, 17), today),
    }


def _collect(jobs: list[Job], mode: CacheMode) -> pd.DataFrame:
    frames, errors = [], []
    for satellite, source, url, cache in jobs:
        try:
            text = fetch_cached(url, cache, mode=mode, validate=_validate_csv, throttle_key="firms", min_interval=1.0)
        except FetchError as exc:
            errors.append(f"{cache.name}: {exc}")
            log.warning("FIRMS %s failed: %s", cache.name, exc)
            continue
        frames.append(parse_firms_csv(text, satellite, source))
    fires = dedupe(combine_partial(frames, errors, len(jobs), "FIRMS"))
    log.info("FIRMS: %d detections after de-duplication", len(fires))
    return geo.assign_districts(fires)


def _pick_source(day: date, nrt: str, sp: str | None, availability: Availability) -> str | None:
    for source in (sp, nrt):
        if source and source in availability:
            first, last = availability[source]
            if first <= day <= last:
                return source
    return None


def _area_url(key: str, source: str, days: int) -> str:
    west, south, east, north = config.BBOX
    return f"{BASE_URL}/area/csv/{key}/{source}/{west},{south},{east},{north}/{days}"


def _map_key(mode: CacheMode) -> str:
    key = config.get_key("FIRMS_MAP_KEY")
    if key:
        return key
    if mode == "offline":
        return "OFFLINE"  # only cached files are read, so the key is never sent
    raise FetchError("FIRMS_MAP_KEY not set in .env (free key: https://firms.modaps.eosdis.nasa.gov/api/map_key/)")


def _availability(key: str, mode: CacheMode) -> Availability:
    try:
        text = fetch_cached(
            f"{BASE_URL}/data_availability/csv/{key}/ALL",
            config.raw_dir("firms") / "data_availability.csv",
            mode="offline" if mode == "offline" else "refresh",
            validate=_validate_availability,
        )
    except FetchError as exc:
        log.warning("FIRMS data availability unknown (%s); assuming defaults", exc)
        return assumed_availability(date.today())
    table = pd.read_csv(io.StringIO(text))
    return {
        row.data_id: (date.fromisoformat(str(row.min_date)), date.fromisoformat(str(row.max_date)))
        for row in table.itertuples()
    }


def _validate_csv(text: str) -> None:
    if not text.lstrip().lower().startswith("latitude"):
        raise ValueError(f"FIRMS did not return CSV: {text[:120].strip()!r}")


def _validate_availability(text: str) -> None:
    if not text.lstrip().lower().startswith("data_id"):
        raise ValueError(f"unexpected availability response: {text[:120].strip()!r}")
