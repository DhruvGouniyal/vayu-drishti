"""Real-time CPCB station data from data.gov.in, used in live mode when OpenAQ lags.

The feed is a snapshot: one 24 h average (CPCB's AQI-bulletin convention) per station
and pollutant, updated hourly, with no history. Every snapshot is appended to
data/raw/datagov/snapshots.parquet, so repeated live runs build up a series.
"""

from __future__ import annotations

import json
import logging
import re

import pandas as pd

from vayu import config
from vayu.http import CacheMode, FetchError, fetch_cached

log = logging.getLogger(__name__)

RESOURCE_URL = "https://api.data.gov.in/resource/3b01bcb8-0b14-4abf-b6f2-c1bfd384ba69"
POLLUTANTS = {"PM2.5": "pm25_24h", "PM10": "pm10_24h"}
SOURCE = "datagov:cpcb-realtime"


def fetch_recent(mode: CacheMode, since: pd.Timestamp) -> pd.DataFrame:
    """Fetch the current snapshot, add it to the archive, and return archived rows since `since`."""
    archive_path = config.raw_dir("datagov") / "snapshots.parquet"
    archive = pd.read_parquet(archive_path) if archive_path.exists() else pd.DataFrame()
    try:
        snapshot = fetch_snapshot(mode)
    except FetchError as exc:
        if archive.empty:
            raise
        log.warning("data.gov.in fetch failed (%s); using archived snapshots only", exc)
        snapshot = pd.DataFrame()

    frames = [f for f in (archive, snapshot) if not f.empty]
    if not frames:
        raise FetchError("data.gov.in returned no PM records for Chandigarh")
    combined = pd.concat(frames, ignore_index=True).drop_duplicates(["station_id", "time_utc"], keep="last")
    if not snapshot.empty:
        combined.sort_values(["station_id", "time_utc"]).to_parquet(archive_path, index=False)
    latest = combined["time_utc"].max()
    log.info("data.gov.in: latest hour %s, %d archived snapshot rows", f"{latest:%Y-%m-%d %H:%M} UTC", len(combined))
    return combined[combined["time_utc"] >= since].reset_index(drop=True)


def fetch_snapshot(mode: CacheMode) -> pd.DataFrame:
    """Current PM2.5 / PM10 24 h averages for the Chandigarh stations."""
    key = config.get_key("DATA_GOV_IN_API_KEY")
    if not key and mode != "offline":
        raise FetchError("DATA_GOV_IN_API_KEY not set in .env (free key: https://www.data.gov.in/ -> sign in -> My Account)")
    records = []
    # One request per pollutant keeps each response at 3 records, under any key's page cap.
    for pollutant in POLLUTANTS:
        params = {
            "api-key": key or "",
            "format": "json",
            "limit": 50,
            "filters[city]": "Chandigarh",
            "filters[pollutant_id]": pollutant,
        }
        slug = re.sub(r"[^a-z0-9]", "", pollutant.lower())
        text = fetch_cached(
            RESOURCE_URL,
            config.raw_dir("datagov") / f"latest_{slug}.json",
            mode="offline" if mode == "offline" else "refresh",
            params=params,
            validate=_validate,
            throttle_key="datagov",
            min_interval=1.0,
        )
        records += json.loads(text)["records"]
    return parse_records(records)


def parse_records(records: list[dict]) -> pd.DataFrame:
    """One row per station and hour with pm25_24h / pm10_24h, labelled like OpenAQ hours.

    `last_update` (IST) marks the end of the latest averaging hour, so the hour starts one
    hour earlier; e.g. 00:00 IST = 18:30 UTC -> hour 17:30-18:30 UTC -> labelled 17:00 UTC.
    """
    rows = []
    for record in records:
        column = POLLUTANTS.get(record.get("pollutant_id", ""))
        station = next((s for s in config.STATIONS if re.search(s.pattern, record.get("station", ""), re.I)), None)
        if column is None or station is None:
            continue
        updated = pd.to_datetime(record["last_update"], format="%d-%m-%Y %H:%M:%S").tz_localize("Asia/Kolkata")
        rows.append(
            {
                "time_utc": (updated.tz_convert("UTC") - pd.Timedelta(hours=1)).floor("h"),
                "station_id": station.key,
                column: pd.to_numeric(record.get("avg_value"), errors="coerce"),
            }
        )
    if not rows:
        return pd.DataFrame()
    frame = pd.DataFrame(rows).groupby(["station_id", "time_utc"], as_index=False).first()
    return frame.assign(source=SOURCE)


def _validate(text: str) -> None:
    payload = json.loads(text)
    if not isinstance(payload.get("records"), list):
        raise ValueError(f"unexpected data.gov.in response: {text[:160]!r}")
