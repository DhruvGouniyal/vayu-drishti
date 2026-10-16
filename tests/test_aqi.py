import json
import logging

import numpy as np
import pandas as pd
import pytest

from vayu import config, storage
from vayu.http import FetchError
from vayu.ingest import aqi, datagov

CURRENT = {"datetimeFirst": {"utc": "2025-02-18T20:15:00Z"}, "datetimeLast": {"utc": "2026-10-13T18:00:00Z"}}
LEGACY = {"datetimeFirst": {"utc": "2022-01-31T07:30:00Z"}, "datetimeLast": {"utc": "2022-10-31T01:45:00Z"}}


def _sensor(sensor_id: int, param: str, period: dict) -> dict:
    return {"id": sensor_id, "parameter": {"name": param}, **period}


LOCATIONS = {
    "results": [
        {
            "id": 101,
            "name": "Sector-25, Chandigarh - CPCC",
            "coordinates": {"latitude": 30.7515, "longitude": 76.7629},
            "datetimeLast": {"utc": "2026-10-13T18:00:00Z"},
            "sensors": [{"id": 1001, "parameter": {"name": "pm25"}}, {"id": 1002, "parameter": {"name": "pm10"}}],
        },
        {
            # Mirrors the real Sector-53 listing: legacy PM10 sensor listed after the current one.
            "id": 103,
            "name": "Sector-53, Chandigarh - CPCC",
            "coordinates": {"latitude": 30.7199, "longitude": 76.7386},
            "datetimeLast": {"utc": "2026-10-13T18:00:00Z"},
            "sensors": [{"id": 3007, "parameter": {"name": "pm10"}}, {"id": 9284, "parameter": {"name": "pm10"}}],
        },
        {"id": 999, "name": "Sector 225 Somewhere", "coordinates": {"latitude": 0, "longitude": 0}, "sensors": []},
    ]
}
SENSORS = {
    101: [_sensor(1001, "pm25", CURRENT), _sensor(1002, "pm10", CURRENT), _sensor(1003, "no2", CURRENT)],
    103: [_sensor(3007, "pm10", CURRENT), _sensor(9284, "pm10", LEGACY), _sensor(3008, "pm25", CURRENT)],
}


def _route_openaq(fake_http) -> None:
    for loc_id, sensors in SENSORS.items():  # specific routes first: "/locations" matches these too
        fake_http.routes[f"/locations/{loc_id}/sensors"] = json.dumps({"results": sensors})
    fake_http.routes["/locations"] = json.dumps(LOCATIONS)


def _hours(start: str, n: int, value: float) -> str:
    """OpenAQ-style hours for CPCB: periods run hh:30 -> hh:30 UTC (IST clock hours)."""
    times = pd.date_range(pd.Timestamp(start).floor("h") + pd.Timedelta(minutes=30), periods=n, freq="h")
    results = [
        {"value": value, "period": {"datetimeFrom": {"utc": t.isoformat()}, "datetimeTo": {"utc": (t + pd.Timedelta(hours=1)).isoformat()}}}
        for t in times
    ]
    return json.dumps({"meta": {}, "results": results})


def _window(year: int) -> tuple[pd.Timestamp, pd.Timestamp]:
    return pd.Timestamp(f"{year}-09-30", tz="UTC"), pd.Timestamp(f"{year}-12-01", tz="UTC")


# --- AQI maths ----------------------------------------------------------------------------


def test_sub_index_breakpoints():
    s25 = aqi.sub_index(pd.Series([0, 30, 45, 100, 250, 1000, np.nan]), aqi.PM25_BREAKS)
    assert s25.round(1).tolist()[:6] == [0, 50, 75, 233.3, 400, 500]
    assert np.isnan(s25.iloc[6])
    assert aqi.sub_index(pd.Series([300.0]), aqi.PM10_BREAKS).iloc[0] == 250


def test_add_naqi_needs_16_hours():
    times = pd.date_range("2025-11-01", periods=24, freq="h", tz="UTC")
    df = pd.DataFrame({"time_utc": times, "station_id": "sector25", "pm25": 100.0, "pm10": 150.0})
    out = aqi.add_naqi(df)
    assert out["aqi"].iloc[:15].isna().all()
    last = out.iloc[-1]
    assert last["aqi"] == 233 and last["aqi_category"] == "Poor" and last["prominent_pollutant"] == "PM2.5"


def test_add_naqi_keeps_provided_24h_means():
    df = pd.DataFrame(
        {"time_utc": [pd.Timestamp("2026-10-15 17:00", tz="UTC")], "station_id": ["sector25"],
         "pm25": [np.nan], "pm10": [np.nan], "pm25_24h": [45.0], "pm10_24h": [np.nan]}
    )
    assert aqi.add_naqi(df)["aqi"].iloc[0] == 75


# --- OpenAQ -------------------------------------------------------------------------------


def test_parse_openaq_hours():
    df = aqi.parse_openaq_hours(json.loads(_hours("2025-11-01T00:00:00Z", 3, 88.0)))
    assert len(df) == 3 and df["value"].eq(88.0).all()
    assert df["time_utc"].iloc[0] == pd.Timestamp("2025-11-01 00:30", tz="UTC")


def test_discover_keeps_every_pm_sensor_newest_first(fake_http):
    _route_openaq(fake_http)
    found = aqi.discover_stations("prefer_cache")
    assert set(found) == {"sector25", "sector53"}
    assert [s["id"] for s in found["sector53"]["sensors"]["pm10"]] == [3007, 9284]
    assert "no2" not in found["sector25"]["sensors"]


def test_regression_legacy_sensor_does_not_hide_current_pm10(fake_http):
    """Sector 53 PM10 came back empty for 2025 because the dead 2022 sensor was the one queried."""
    _route_openaq(fake_http)
    fake_http.routes["/sensors/3007/"] = _hours("2025-10-01", 48, 180.0)
    fake_http.routes["/sensors/3008/"] = _hours("2025-10-01", 48, 90.0)
    fake_http.routes["/sensors/9284/"] = FetchError("legacy sensor must not be queried for 2025")
    stations = aqi.discover_stations("prefer_cache")
    df = aqi.fetch_openaq({"sector53": stations["sector53"]}, *_window(2025), "prefer_cache", tag="2025")
    assert df["pm10"].notna().sum() == 48 and df["pm25"].notna().sum() == 48
    assert not any("/sensors/9284/" in url for url, _ in fake_http.calls)


def test_window_without_any_sensor_warns_instead_of_silently_returning_nothing(fake_http, caplog):
    _route_openaq(fake_http)
    stations = aqi.discover_stations("prefer_cache")
    with caplog.at_level(logging.WARNING):
        df = aqi.fetch_openaq(stations, *_window(2023), "prefer_cache", tag="2023")
    assert df.empty
    assert "OpenAQ has no pm10 data for sector53 in 2023-09-30..2023-12-01" in caplog.text
    assert not any("/hours" in url for url, _ in fake_http.calls)  # nothing to ask for


def test_empty_response_for_active_sensor_is_logged(fake_http, caplog):
    _route_openaq(fake_http)
    fake_http.routes["/sensors/"] = json.dumps({"meta": {"found": 0}, "results": []})
    stations = aqi.discover_stations("prefer_cache")
    with caplog.at_level(logging.WARNING):
        aqi.fetch_openaq({"sector25": stations["sector25"]}, *_window(2025), "prefer_cache", tag="2025")
    assert "OpenAQ returned no pm25 hours for sector25" in caplog.text


def test_overlapping_sensors_newest_wins_older_fills():
    newer = pd.Series([1.0, np.nan], index=pd.to_datetime(["2025-10-01 00:00", "2025-10-01 01:00"], utc=True))
    older = pd.Series([9.0, 2.0], index=newer.index)
    assert newer.combine_first(older).tolist() == [1.0, 2.0]


# --- CPCB files + merging -----------------------------------------------------------------

CPCB_EXPORT = """Central Pollution Control Board
Station,"Sector-25, Chandigarh - CPCC"
,,
From Date,To Date,PM2.5 (ug/m3),PM10 (ug/m3)
01-10-2023 05:30,01-10-2023 06:30,45.5,90
01-10-2023 06:30,01-10-2023 07:30,None,110
01-10-2023 07:30,01-10-2023 08:30,-5,NA
"""


def test_load_cpcb_file_handles_headers_ist_and_junk(tmp_path):
    path = tmp_path / "sector25_2023.csv"
    path.write_text(CPCB_EXPORT, encoding="utf-8")
    df = aqi.load_cpcb_file(path)
    assert df["time_utc"].iloc[0] == pd.Timestamp("2023-10-01 00:00", tz="UTC")  # 05:30 IST
    assert df["pm25"].iloc[0] == 45.5 and np.isnan(df["pm25"].iloc[1])
    assert len(df) == 2  # the -5 / NA row is dropped as fully invalid


def test_cpcb_and_openaq_same_hour_merge_into_one_row(tmp_path):
    """A CPCB IST hour (05:00-06:00 IST) and OpenAQ's period for it (23:30Z) get one key."""
    path = tmp_path / "sector25_2025.csv"
    path.write_text(
        "From Date,To Date,PM2.5,PM10\n"
        "30-09-2025 05:00,30-09-2025 06:00,61,140\n"
        "30-Sep-2025 - 06:00,30-Sep-2025 - 07:00,70,150\n",
        encoding="utf-8",
    )
    cpcb = aqi.load_cpcb_file(path).assign(station_id="sector25", source="cpcb:manual")
    openaq_hours = aqi.parse_openaq_hours(json.loads(_hours("2025-09-29T23:00:00Z", 1, 60.0)))
    openaq = pd.DataFrame(
        {"time_utc": openaq_hours["time_utc"], "station_id": "sector25", "pm25": openaq_hours["value"], "source": "openaq"}
    )
    out = aqi.assemble([openaq, cpcb], {})
    assert out["time_utc"].tolist() == [pd.Timestamp("2025-09-29 23:00", tz="UTC"), pd.Timestamp("2025-09-30 00:00", tz="UTC")]
    first, second = out.iloc[0], out.iloc[1]
    assert (first["pm25"], first["pm10"], first["source"]) == (60.0, 140.0, "openaq")  # CPCB fills PM10
    assert (second["pm25"], second["source"]) == (70.0, "cpcb:manual")


def test_overlapping_cpcb_files_do_not_duplicate(monkeypatch):
    monkeypatch.delenv("OPENAQ_API_KEY")
    folder = config.manual_dir("cpcb")
    (folder / "sector25_2023.csv").write_text(CPCB_EXPORT, encoding="utf-8")
    (folder / "sector25_2023_redownload.csv").write_text(CPCB_EXPORT, encoding="utf-8")
    df = aqi.backfill([2023], "prefer_cache")
    assert not df.duplicated(["station_id", "time_utc"]).any() and len(df) == 2


def test_backfill_without_openaq_key_uses_cpcb(monkeypatch):
    monkeypatch.delenv("OPENAQ_API_KEY")
    (config.manual_dir("cpcb") / "Sector-25_Oct2023.csv").write_text(CPCB_EXPORT, encoding="utf-8")
    (config.manual_dir("cpcb") / "random_notes.csv").write_text("nothing", encoding="utf-8")
    df = aqi.backfill([2023], "prefer_cache")
    assert set(df["station_id"]) == {"sector25"} and set(df["source"]) == {"cpcb:manual"}


def test_no_data_anywhere_raises(monkeypatch):
    monkeypatch.delenv("OPENAQ_API_KEY")
    with pytest.raises(FetchError, match="no AQI data"):
        aqi.backfill([2023], "prefer_cache")


# --- Live + data.gov.in fallback ------------------------------------------------------------


def _datagov_records(last_update_ist: pd.Timestamp, pm25: float, pm10: float) -> dict:
    stamp = last_update_ist.strftime("%d-%m-%Y %H:%M:%S")
    base = {"country": "India", "state": "Chandigarh", "city": "Chandigarh", "station": "Sector-25, Chandigarh - CPCC", "last_update": stamp}
    return {
        "status": "ok",
        "records": [
            {**base, "pollutant_id": "PM2.5", "avg_value": str(pm25)},
            {**base, "pollutant_id": "PM10", "avg_value": str(pm10)},
            {**base, "pollutant_id": "NO2", "avg_value": "31"},
        ],
    }


def test_parse_datagov_records():
    records = _datagov_records(pd.Timestamp("2026-10-16 00:00"), 38, 43)["records"]
    df = datagov.parse_records(records)
    assert len(df) == 1
    row = df.iloc[0]
    # 00:00 IST = 18:30 UTC is the end of the hour 17:30-18:30 UTC -> labelled 17:00 UTC
    assert row["time_utc"] == pd.Timestamp("2026-10-15 17:00", tz="UTC")
    assert (row["pm25_24h"], row["pm10_24h"], row["source"]) == (38, 43, datagov.SOURCE)


def test_live_falls_back_to_datagov_when_openaq_is_stale(fake_http):
    _route_openaq(fake_http)
    now = pd.Timestamp.now(tz="UTC").floor("h")
    stale_start = (now - pd.Timedelta(hours=70)).isoformat()
    for sensor in (1001, 1002, 3007, 3008):
        fake_http.routes[f"/sensors/{sensor}/"] = _hours(stale_start, 20, 80.0)  # ends ~50 h ago
    ist_now = now.tz_convert("Asia/Kolkata").tz_localize(None)
    fake_http.routes["api.data.gov.in"] = json.dumps(_datagov_records(ist_now, 45, 60))

    df = storage.conform(aqi.live("refresh"), "aqi")
    fresh = df[df["source"] == datagov.SOURCE]
    assert len(fresh) == 1 and fresh["aqi"].iloc[0] == 75
    assert now - df.loc[df["aqi"].notna(), "time_utc"].max() <= pd.Timedelta(hours=2)
    assert not df.duplicated(["station_id", "time_utc"]).any()


def test_live_skips_datagov_when_openaq_is_fresh(fake_http):
    _route_openaq(fake_http)
    now = pd.Timestamp.now(tz="UTC").floor("h")
    for sensor in (1001, 1002, 3007, 3008):
        fake_http.routes[f"/sensors/{sensor}/"] = _hours((now - pd.Timedelta(hours=30)).isoformat(), 30, 80.0)
    aqi.live("refresh")
    assert not any("data.gov.in" in url for url, _ in fake_http.calls)


def test_datagov_snapshots_accumulate(fake_http):
    since = pd.Timestamp("2026-10-14", tz="UTC")
    fake_http.routes["api.data.gov.in"] = json.dumps(_datagov_records(pd.Timestamp("2026-10-16 00:00"), 38, 43))
    datagov.fetch_recent("refresh", since)
    fake_http.routes["api.data.gov.in"] = json.dumps(_datagov_records(pd.Timestamp("2026-10-16 01:00"), 40, 47))
    df = datagov.fetch_recent("refresh", since)
    assert df["time_utc"].dt.hour.tolist() == [17, 18]


def test_datagov_needs_key(monkeypatch):
    monkeypatch.delenv("DATA_GOV_IN_API_KEY")
    with pytest.raises(FetchError, match="DATA_GOV_IN_API_KEY"):
        datagov.fetch_snapshot("refresh")
