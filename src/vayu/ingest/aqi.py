"""Hourly PM2.5 / PM10 / AQI for Chandigarh's CPCB stations (Sector 22, 25, 53).

Sources, highest priority first (lower ones only fill gaps):
  1. OpenAQ v3 hourly data. OpenAQ holds no CPCB data between Nov 2022 and Feb 2025,
     so for the 2023 and 2024 seasons it returns nothing.
  2. Manually downloaded CPCB files in data/manual/cpcb/ (see data/README.md).
  3. data.gov.in real-time feed (live mode only, when OpenAQ lags by more than STALE_AFTER).
AQI is computed here (Indian NAQI) from trailing 24 h PM averages.

Time convention: CPCB averages over IST clock hours, i.e. hh:30 to hh:30 UTC. Every source
labels an hour with the UTC hour its start falls in (23:30Z-00:30Z -> 23:00Z), so the
same CPCB hour gets the same `time_utc` whichever source it came from.
"""

from __future__ import annotations

import csv
import json
import logging
import os
import re
from functools import reduce
from pathlib import Path

import numpy as np
import pandas as pd

from vayu import config
from vayu.http import CacheMode, FetchError, fetch_cached
from vayu.ingest import datagov

log = logging.getLogger(__name__)

OPENAQ_URL = "https://api.openaq.org/v3"
PAGE_LIMIT = 1000
LIVE_HOURS = 72  # 24 h warm-up for the AQI average + 48 h of context
STALE_AFTER = pd.Timedelta(hours=3)  # live OpenAQ older than this triggers the data.gov.in fallback
VALID_PM = (0.0, 1500.0)  # µg/m³; values outside are sensor faults
PARAMETERS = ("pm25", "pm10")
VALUE_COLUMNS = ("pm25", "pm10", "pm25_24h", "pm10_24h")

# Indian NAQI breakpoints (concentration -> index), linear in between, capped at 500.
PM25_BREAKS = ([0, 30, 60, 90, 120, 250, 380], [0, 50, 100, 200, 300, 400, 500])
PM10_BREAKS = ([0, 50, 100, 250, 350, 430, 510], [0, 50, 100, 200, 300, 400, 500])
CATEGORIES = (
    (50, "Good"),
    (100, "Satisfactory"),
    (200, "Moderate"),
    (300, "Poor"),
    (400, "Very Poor"),
    (500, "Severe"),
)

# {"location_id", "name", "lat", "lon", "sensors": {"pm25": [{"id", "first", "last"}, ...], ...}}
StationInfo = dict


def backfill(seasons: list[int], mode: CacheMode) -> pd.DataFrame:
    """OpenAQ hourly data for each season, gaps filled from manual CPCB files."""
    stations = _discover_or_empty(mode)
    frames = []
    for year in seasons:
        start, end = config.season_dates(year)
        # One day of warm-up so the 24 h AQI average is defined from 1 Oct.
        t0 = pd.Timestamp(start.isoformat(), tz="UTC") - pd.Timedelta(days=1)
        t1 = pd.Timestamp(end.isoformat(), tz="UTC") + pd.Timedelta(days=1)
        frames.append(fetch_openaq(stations, t0, t1, mode, tag=str(year)))
    return assemble([pd.concat(frames, ignore_index=True), load_cpcb()], stations)


def live(mode: CacheMode) -> pd.DataFrame:
    """Last LIVE_HOURS hours from OpenAQ, topped up from data.gov.in when OpenAQ is stale."""
    now = pd.Timestamp.now(tz="UTC").floor("h")
    since = now - pd.Timedelta(hours=LIVE_HOURS)
    stations: dict[str, StationInfo] = {}
    recent = pd.DataFrame()
    try:
        stations = discover_stations(mode)
        recent = fetch_openaq(stations, since, now + pd.Timedelta(hours=1), mode, tag="live")
    except FetchError as exc:
        log.warning("OpenAQ live unavailable: %s", exc)

    realtime = pd.DataFrame()
    lag = now - recent["time_utc"].max() if not recent.empty else None
    if lag is None or lag > STALE_AFTER:
        behind = "has no data" if lag is None else f"is {lag.total_seconds() / 3600:.0f} h behind"
        log.warning("OpenAQ live %s; adding the data.gov.in real-time feed", behind)
        try:
            realtime = datagov.fetch_recent(mode, since)
        except FetchError as exc:
            log.warning("data.gov.in fallback unavailable: %s", exc)
    return assemble([recent, realtime], stations)


# --- OpenAQ ---------------------------------------------------------------------------


def discover_stations(mode: CacheMode) -> dict[str, StationInfo]:
    """Find OpenAQ locations and all their PM sensors for our stations, by name near Chandigarh."""
    headers = _headers(mode)
    lookup_mode: CacheMode = "offline" if mode == "offline" else "prefer_cache"
    lat, lon = config.CHANDIGARH
    nearby = _get_json(
        "/locations",
        {"coordinates": f"{lat:.4f},{lon:.4f}", "radius": 25000, "limit": 100},
        "locations_chandigarh.json",
        lookup_mode,
        headers,
    )["results"]
    overrides = _parse_overrides(os.getenv("OPENAQ_LOCATION_IDS", ""))

    found: dict[str, StationInfo] = {}
    for station in config.STATIONS:
        if station.key in overrides:
            loc_id = overrides[station.key]
            candidates = _get_json(f"/locations/{loc_id}", {}, f"location_{loc_id}.json", lookup_mode, headers)["results"]
        else:
            candidates = [loc for loc in nearby if re.search(station.pattern, loc.get("name") or "", re.I)]
        candidates = [c for c in candidates if _has_pm(c)]
        if not candidates:
            log.warning("OpenAQ: no location with PM sensors matched %s", station.name)
            continue
        # Duplicate listings exist for some CPCB stations; take the most recently active one.
        loc = max(candidates, key=lambda c: ((c.get("datetimeLast") or {}).get("utc") or ""))
        sensors = _location_sensors(loc["id"], mode, headers)
        found[station.key] = {
            "location_id": loc["id"],
            "name": station.name,
            "lat": loc["coordinates"]["latitude"],
            "lon": loc["coordinates"]["longitude"],
            "sensors": sensors,
        }
        ranges = "; ".join(f"{p}: {_ranges(s)}" for p, s in sensors.items())
        log.info("OpenAQ: %s -> location %s (%s) [%s]", station.key, loc["id"], loc.get("name"), ranges)
    if not found:
        raise FetchError("OpenAQ: none of the Chandigarh stations were found; set OPENAQ_LOCATION_IDS in .env")
    return found


def fetch_openaq(
    stations: dict[str, StationInfo], t0: pd.Timestamp, t1: pd.Timestamp, mode: CacheMode, tag: str
) -> pd.DataFrame:
    """Wide hourly table (time_utc, station_id, pm25, pm10) for [t0, t1).

    A location can have several sensors per pollutant (CPCB re-registrations); every sensor
    whose active period overlaps the window is fetched, and the newest wins on overlap.
    """
    headers = _headers(mode) if stations else {}
    window = f"{t0:%Y-%m-%d}..{t1:%Y-%m-%d}"
    frames = []
    for key, info in stations.items():
        series = {}
        for param, sensors in info["sensors"].items():
            active = [s for s in sensors if _overlaps(s, t0, t1)]
            if not active:
                log.warning("OpenAQ has no %s data for %s in %s (its sensors cover %s)", param, key, window, _ranges(sensors))
                continue
            parts = []
            for sensor in active:
                try:
                    parts.append(_sensor_hours(sensor["id"], t0, t1, mode, headers, tag))
                except FetchError as exc:
                    log.warning("OpenAQ %s %s sensor %s failed: %s", key, param, sensor["id"], exc)
            values = reduce(lambda newer, older: newer.combine_first(older), parts) if parts else pd.Series(dtype=float)
            if values.dropna().empty:
                log.warning("OpenAQ returned no %s hours for %s in %s", param, key, window)
                continue
            series[param] = values
        if series:
            wide = pd.concat(series, axis=1).rename_axis("time_utc").reset_index()
            frames.append(wide.assign(station_id=key, source="openaq"))
    return pd.concat(frames, ignore_index=True) if frames else pd.DataFrame()


def parse_openaq_hours(payload: dict) -> pd.DataFrame:
    """(time_utc, value) rows from a /sensors/{id}/hours response; time is the hour start."""
    rows = [
        (r["period"]["datetimeFrom"]["utc"], r.get("value"))
        for r in payload.get("results", [])
        if (r.get("period") or {}).get("datetimeFrom")
    ]
    df = pd.DataFrame(rows, columns=["time_utc", "value"])
    df["time_utc"] = pd.to_datetime(df["time_utc"], utc=True)
    df["value"] = pd.to_numeric(df["value"], errors="coerce")
    return df


def _sensor_hours(
    sensor_id: int, t0: pd.Timestamp, t1: pd.Timestamp, mode: CacheMode, headers: dict, tag: str
) -> pd.Series:
    frames = []
    for page in range(1, 50):
        params = {"datetime_from": _iso(t0), "datetime_to": _iso(t1), "limit": PAGE_LIMIT, "page": page}
        payload = _get_json(f"/sensors/{sensor_id}/hours", params, f"hours_{tag}_s{sensor_id}_p{page}.json", mode, headers)
        frames.append(parse_openaq_hours(payload))
        if len(payload.get("results", [])) < PAGE_LIMIT:
            break
    hours = pd.concat(frames, ignore_index=True).drop_duplicates("time_utc")
    hours["time_utc"] = hours["time_utc"].dt.floor("h")
    return clean_pm(hours.drop_duplicates("time_utc").set_index("time_utc")["value"])


def _location_sensors(loc_id: int, mode: CacheMode, headers: dict) -> dict[str, list[dict]]:
    """All PM sensors of a location with their active period, newest first."""
    sensor_mode: CacheMode = "offline" if mode == "offline" else "refresh"
    payload = _get_json(f"/locations/{loc_id}/sensors", {}, f"sensors_loc{loc_id}.json", sensor_mode, headers)
    sensors: dict[str, list[dict]] = {}
    for s in payload["results"]:
        param = (s.get("parameter") or {}).get("name")
        if param in PARAMETERS:
            first = (s.get("datetimeFirst") or {}).get("utc")
            last = (s.get("datetimeLast") or {}).get("utc")
            sensors.setdefault(param, []).append({"id": s["id"], "first": first, "last": last})
    for group in sensors.values():
        group.sort(key=lambda s: s["last"] or "", reverse=True)
    return sensors


def _overlaps(sensor: dict, t0: pd.Timestamp, t1: pd.Timestamp) -> bool:
    """True if the sensor's active period touches [t0, t1); unknown bounds count as open."""
    first = pd.Timestamp(sensor["first"]) if sensor.get("first") else None
    last = pd.Timestamp(sensor["last"]) if sensor.get("last") else None
    return (first is None or first < t1) and (last is None or last >= t0)


def _ranges(sensors: list[dict]) -> str:
    return ", ".join(f"{(s.get('first') or '?')[:10]}..{(s.get('last') or '?')[:10]}" for s in sensors) or "nothing"


def _get_json(path: str, params: dict, cache_name: str, mode: CacheMode, headers: dict) -> dict:
    text = fetch_cached(
        OPENAQ_URL + path,
        config.raw_dir("openaq") / cache_name,
        mode=mode,
        params=params,
        headers=headers,
        validate=_validate_openaq,
        throttle_key="openaq",
        min_interval=1.1,  # free tier: 60 requests/minute
    )
    return json.loads(text)


def _discover_or_empty(mode: CacheMode) -> dict[str, StationInfo]:
    if mode != "offline" and not config.get_key("OPENAQ_API_KEY"):
        log.warning("OPENAQ_API_KEY not set; using manual CPCB files only")
        return {}
    try:
        return discover_stations(mode)
    except FetchError as exc:
        log.warning("OpenAQ unavailable (%s); using manual CPCB files only", exc)
        return {}


def _headers(mode: CacheMode) -> dict:
    key = config.get_key("OPENAQ_API_KEY")
    if key:
        return {"X-API-Key": key}
    if mode == "offline":
        return {}
    raise FetchError("OPENAQ_API_KEY not set in .env (free key: https://explore.openaq.org/register)")


def _has_pm(location: dict) -> bool:
    return any((s.get("parameter") or {}).get("name") in PARAMETERS for s in location.get("sensors", []))


def _parse_overrides(raw: str) -> dict[str, int]:
    """"sector22=123,sector25=456" -> {"sector22": 123, "sector25": 456}"""
    pairs = (item.split("=", 1) for item in raw.split(",") if "=" in item)
    return {k.strip().lower(): int(v) for k, v in pairs if v.strip().isdigit()}


def _validate_openaq(text: str) -> None:
    if "results" not in json.loads(text):
        raise ValueError(f"unexpected OpenAQ response: {text[:120]!r}")


def _iso(t: pd.Timestamp) -> str:
    return t.tz_convert("UTC").strftime("%Y-%m-%dT%H:%M:%SZ")


# --- Manual CPCB files ------------------------------------------------------------------

_TIME_HEADER = re.compile(r"^(from ?date|timestamp|date ?time|date|period from)$")


def load_cpcb(directory: Path | None = None) -> pd.DataFrame:
    """Load every CSV/XLSX in data/manual/cpcb/; the station comes from the file name."""
    directory = directory or config.manual_dir("cpcb")
    frames = []
    for path in sorted(directory.iterdir()):
        if path.suffix.lower() not in {".csv", ".xlsx", ".xls"}:
            continue
        station = next((s for s in config.STATIONS if re.search(s.pattern, path.stem, re.I)), None)
        if station is None:
            log.warning("Skipping %s: file name must contain sector22, sector25 or sector53", path.name)
            continue
        try:
            table = load_cpcb_file(path)
        except (ValueError, KeyError) as exc:
            log.warning("Skipping %s: %s", path.name, exc)
            continue
        frames.append(table.assign(station_id=station.key, source="cpcb:manual"))
        log.info("CPCB: %s -> %s, %d hours", path.name, station.key, len(table))
    if not frames:
        return pd.DataFrame()
    # Overlapping files (e.g. a re-download) must not create duplicate hours.
    return pd.concat(frames, ignore_index=True).drop_duplicates(["station_id", "time_utc"], keep="last")


def load_cpcb_file(path: Path) -> pd.DataFrame:
    """Parse one CPCB export (header rows tolerated; IST timestamps; 15-min or hourly)."""
    rows = _read_rows(path)
    header_idx = next((i for i, row in enumerate(rows) if any(_TIME_HEADER.match(_norm(c)) for c in row)), None)
    if header_idx is None:
        raise ValueError("no 'From Date' / 'Timestamp' header row found")
    header = [_norm(c) for c in rows[header_idx]]
    body = [(r + [""] * len(header))[: len(header)] for r in rows[header_idx + 1 :] if any(str(c).strip() for c in r)]
    table = pd.DataFrame(body, columns=header)

    time_col = next(c for c in header if _TIME_HEADER.match(c))
    pm25_col = _find_column(header, "pm25")
    pm10_col = _find_column(header, "pm10")
    if not (pm25_col or pm10_col):
        raise ValueError("no PM2.5 / PM10 column found")

    stamps = table[time_col].astype(str).str.replace(" - ", " ", regex=False).str.strip()
    local = pd.to_datetime(stamps, dayfirst=True, errors="coerce", format="mixed")
    out = pd.DataFrame(
        {
            "time_utc": local.dt.tz_localize("Asia/Kolkata").dt.tz_convert("UTC"),
            "pm25": _numeric(table, pm25_col),
            "pm10": _numeric(table, pm10_col),
        }
    ).dropna(subset=["time_utc"])
    hourly = out.set_index("time_utc").resample("h").mean()  # collapses 15-min data to hourly
    hourly = hourly.apply(clean_pm).dropna(how="all")
    return hourly.reset_index()


def _read_rows(path: Path) -> list[list[str]]:
    if path.suffix.lower() in {".xlsx", ".xls"}:
        return pd.read_excel(path, header=None, dtype=str).fillna("").values.tolist()
    with path.open(encoding="utf-8-sig", errors="replace", newline="") as f:
        return [row for row in csv.reader(f)]


def _norm(cell: object) -> str:
    """Lower-case header text without units in brackets: 'From Date (IST)' -> 'from date'."""
    text = re.sub(r"\(.*?\)|\[.*?\]", "", str(cell)).strip().lower()
    return re.sub(r"\s+", " ", text)


def _find_column(header: list[str], target: str) -> str | None:
    return next((c for c in header if re.sub(r"[^a-z0-9]", "", c).startswith(target)), None)


def _numeric(table: pd.DataFrame, col: str | None) -> pd.Series:
    if col is None:
        return pd.Series(np.nan, index=table.index)
    return pd.to_numeric(table[col], errors="coerce")


# --- Merge + AQI ------------------------------------------------------------------------


def assemble(sources: list[pd.DataFrame], stations: dict[str, StationInfo]) -> pd.DataFrame:
    """Merge sources (earlier entries win per value, later ones fill gaps), attach station metadata, add AQI.

    Rows are keyed on (station_id, time_utc), so the result never has duplicate hours.
    `source` names the highest-priority source that had a row for that hour.
    """
    ranked = [frame.assign(_rank=i) for i, frame in enumerate(sources) if not frame.empty]
    if not ranked:
        raise FetchError("no AQI data from any source (OpenAQ, CPCB files in data/manual/cpcb/, data.gov.in)")
    combined = pd.concat(ranked, ignore_index=True)
    for col in VALUE_COLUMNS:
        if col not in combined:
            combined[col] = np.nan
    combined["time_utc"] = combined["time_utc"].dt.floor("h")
    # groupby().first() takes the first non-null value per column, so lower sources fill holes.
    merged = (
        combined.sort_values("_rank", kind="stable")
        .groupby(["station_id", "time_utc"], as_index=False)[[*VALUE_COLUMNS, "source"]]
        .first()
    )

    meta = {s.key: {"station_name": s.name, "lat": s.lat, "lon": s.lon} for s in config.STATIONS}
    for key, info in stations.items():
        meta[key].update(lat=info["lat"], lon=info["lon"])
    for col in ("station_name", "lat", "lon"):
        merged[col] = merged["station_id"].map(lambda k, c=col: meta[k][c])
    return add_naqi(merged)


def clean_pm(values: pd.Series) -> pd.Series:
    """Blank out physically implausible readings (negative, zero, or > 1500 µg/m³)."""
    low, high = VALID_PM
    return values.where((values > low) & (values <= high))


def sub_index(conc: pd.Series, breaks: tuple[list[float], list[float]]) -> pd.Series:
    """Indian NAQI sub-index via linear interpolation between breakpoints."""
    values = np.interp(conc.to_numpy(dtype=float), *breaks)
    return pd.Series(np.where(conc.isna(), np.nan, values), index=conc.index)


def add_naqi(df: pd.DataFrame) -> pd.DataFrame:
    """Add trailing-24 h PM means (>= 16 valid hours), AQI, category and prominent pollutant.

    Rows that already carry a 24 h mean (data.gov.in) keep it instead of the rolling value.
    """
    parts = []
    for _, group in df.sort_values(["station_id", "time_utc"]).groupby("station_id", sort=False):
        rolled = group.set_index("time_utc")[["pm25", "pm10"]].rolling("24h", min_periods=16).mean()
        for col in PARAMETERS:
            given = group[f"{col}_24h"].to_numpy(dtype=float) if f"{col}_24h" in group else np.full(len(group), np.nan)
            group = group.assign(**{f"{col}_24h": np.where(np.isnan(given), rolled[col].to_numpy(), given)})
        parts.append(group)
    out = pd.concat(parts, ignore_index=True)

    s25 = sub_index(out["pm25_24h"], PM25_BREAKS)
    s10 = sub_index(out["pm10_24h"], PM10_BREAKS)
    out["aqi"] = pd.concat([s25, s10], axis=1).max(axis=1, skipna=True).round()
    out["prominent_pollutant"] = np.where(out["aqi"].isna(), None, np.where(s25.fillna(-1) >= s10.fillna(-1), "PM2.5", "PM10"))
    out["aqi_category"] = out["aqi"].map(_category)
    return out


def _category(aqi: float) -> str | None:
    if pd.isna(aqi):
        return None
    return next(label for limit, label in CATEGORIES if aqi <= limit)
