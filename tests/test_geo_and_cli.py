import json

import numpy as np
import pandas as pd

from vayu import cli, coverage, geo, storage
from vayu.ingest import aqi, firms, weather


def _square(x0: float, y0: float, size: float = 1.0) -> dict:
    ring = [[x0, y0], [x0 + size, y0], [x0 + size, y0 + size], [x0, y0 + size], [x0, y0]]
    return {"type": "Polygon", "coordinates": [ring]}


def test_assign_districts(tmp_path):
    path = tmp_path / "d.geojson"
    features = [
        {"type": "Feature", "properties": {"state": "Punjab", "district": "Sangrur"}, "geometry": _square(75, 30)},
        {"type": "Feature", "properties": {"state": "Haryana", "district": "Karnal"}, "geometry": _square(76.5, 29.5)},
    ]
    path.write_text(json.dumps({"type": "FeatureCollection", "features": features}), encoding="utf-8")
    pts = pd.DataFrame({"lat": [30.5, 29.9, 32.0], "lon": [75.5, 77.0, 74.0]})
    out = geo.assign_districts(pts, path)
    assert out["district"].iloc[:2].tolist() == ["Sangrur", "Karnal"]
    assert out["state"].iloc[:2].tolist() == ["Punjab", "Haryana"]
    assert out.iloc[2][["state", "district"]].isna().all()


def test_pretty_names():
    assert geo._pretty("FatehgarhSahib") == "Fatehgarh Sahib"
    assert geo._pretty("Ludhiana") == "Ludhiana"


def test_one_failing_source_does_not_stop_the_run(monkeypatch, capsys):
    def boom(mode):
        raise RuntimeError("FIRMS is down")

    good = pd.DataFrame(
        {"time_utc": pd.to_datetime(["2025-10-01"], utc=True), "point_id": ["chandigarh"], "lat": [30.7], "lon": [76.8], "source": ["test"]}
    )
    monkeypatch.setattr(firms, "live", boom)
    monkeypatch.setattr(weather, "live", lambda mode: good)
    monkeypatch.setattr(aqi, "live", boom)

    assert cli.main(["live", "--offline"]) == 0
    printed = capsys.readouterr().out
    assert "firms    FAILED" in printed and "weather  OK" in printed
    assert len(storage.read("weather_forecast")) == 1


def test_offline_with_empty_cache_fails_gracefully(monkeypatch):
    monkeypatch.delenv("FIRMS_MAP_KEY")
    monkeypatch.delenv("OPENAQ_API_KEY")
    assert cli.main(["live", "--offline"]) == 1  # nothing cached, but no crash


def test_offline_backfill_replays_cache(fake_http, monkeypatch):
    monkeypatch.setattr(geo, "download_districts", lambda force=False: None)
    header = "latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_ti5,frp,daynight\n"
    fake_http.routes["data_availability"] = "data_id,min_date,max_date\nVIIRS_SNPP_SP,2012-01-20,2026-06-30\n"
    fake_http.routes["/area/"] = header + "30.2,75.1,330,0.4,0.4,2024-10-20,812,N,VIIRS,n,2,290,5.0,D\n"
    assert cli.main(["backfill", "--seasons", "2024", "--sources", "firms"]) == 0
    online = storage.read("fires_history")

    fake_http.routes.clear()  # network gone
    assert cli.main(["backfill", "--seasons", "2024", "--sources", "firms", "--offline"]) == 0
    pd.testing.assert_frame_equal(storage.read("fires_history"), online)


def _aqi_rows(year: int, station: str, hours: int) -> pd.DataFrame:
    times = pd.date_range(f"{year}-10-01", periods=hours, freq="h", tz="UTC")
    return pd.DataFrame({"time_utc": times, "station_id": station, "pm25": 80.0, "pm10": 150.0, "aqi": 160.0})


def test_check_aqi_flags_missing_and_thin_seasons():
    df = pd.concat([_aqi_rows(2025, "sector22", 1464), _aqi_rows(2025, "sector25", 300)], ignore_index=True)
    df.loc[df["station_id"] == "sector22", "pm10"] = np.nan
    warnings = coverage.check_aqi(df, [2024, 2025])
    assert "sector22 2024: NO DATA (season missing; see data/README.md for CPCB download)" in warnings
    assert "sector22 2025: low coverage (PM10 0%)" in warnings
    assert any(w.startswith("sector25 2025: low coverage (AQI 20%") for w in warnings)
    assert not any(w.startswith("sector53 2025: low") for w in warnings)  # sector53 2025 is NO DATA instead
    assert coverage.aqi_coverage(df, [2025]).loc["sector22", 2025] == 100.0


def test_summary_reports_warn_for_missing_season(capsys):
    df = _aqi_rows(2025, "sector25", 1464).assign(station_name="x", lat=30.7, lon=76.7, source="openaq")
    code = cli.run(
        {"aqi": lambda: df},
        {"aqi": ("aqi_history", "aqi")},
        {"aqi": lambda d: coverage.check_aqi(d, [2023, 2025])},
    )
    out = capsys.readouterr().out
    assert code == 0
    assert "aqi      WARN" in out and "! sector25 2023: NO DATA" in out and "! sector22 2025: NO DATA" in out


def test_fires_by_satellite_and_check():
    times = pd.to_datetime(["2023-10-10", "2023-10-11", "2024-10-10"], utc=True)
    df = pd.DataFrame({"time_utc": times, "satellite": ["SNPP", "NOAA20", "SNPP"]})
    table = coverage.fires_by_satellite(df)
    assert table.loc[2023, "total"] == 2
    assert coverage.check_fires(df, [2023, 2024, 2025]) == ["2024: no detections from NOAA20", "2025: NO fire detections"]
