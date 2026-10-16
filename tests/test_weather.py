import json

import pandas as pd

from vayu import config, storage
from vayu.ingest import weather


def _payload(n_points: int, hours: int = 3, blh: float | None = 500.0) -> str:
    def one() -> dict:
        hourly = {"time": [f"2025-10-01T{h:02d}:00" for h in range(hours)]}
        hourly.update({v: [1.0] * hours for v in config.WEATHER_VARS})
        hourly["boundary_layer_height"] = [blh] * hours
        return {"latitude": 30.7, "longitude": 76.8, "hourly": hourly}

    items = [one() for _ in range(n_points)]
    return json.dumps(items if n_points > 1 else items[0])


def _by_point_count(params: dict, **kwargs) -> str:
    return _payload(len(params["latitude"].split(",")), **kwargs)


def test_grid_covers_bbox_with_chandigarh_first():
    points = weather.grid_points()
    west, south, east, north = config.BBOX
    assert points.iloc[0]["point_id"] == "chandigarh"
    assert len(points) == 81
    grid = points.iloc[1:]
    assert grid["lat"].between(south, north).all() and grid["lon"].between(west, east).all()
    assert points["point_id"].is_unique


def test_parse_multi_location():
    batch = weather.grid_points().iloc[:2]
    df = weather.parse_openmeteo(_payload(2), batch, "open-meteo:forecast")
    assert len(df) == 6
    assert df["time_utc"].dt.tz is not None
    assert set(df["point_id"]) == set(batch["point_id"])


def test_fill_blh_from_era5():
    batch = weather.grid_points().iloc[:1]
    main = weather.parse_openmeteo(_payload(1, blh=None), batch, "a")
    era5 = weather.parse_openmeteo(_payload(1, blh=320.0), batch, "era5")
    assert weather.fill_blh(main, era5)["boundary_layer_height"].eq(320.0).all()


def test_live_forecast_end_to_end(fake_http):
    fake_http.routes["api.open-meteo.com"] = _by_point_count
    df = storage.conform(weather.live("refresh"), "weather")
    assert len(df) == 81 * 3
    assert list(df.columns) == list(storage.SCHEMAS["weather"])
    assert (df["source"] == "open-meteo:forecast").all()


def test_history_fills_missing_blh_with_era5(fake_http):
    fake_http.routes["historical-forecast-api"] = lambda p: _by_point_count(p, blh=None)
    fake_http.routes["archive-api"] = lambda p: _by_point_count(p, blh=250.0)
    df = weather.backfill([2025], "prefer_cache")
    assert pd.to_numeric(df["boundary_layer_height"]).eq(250.0).all()


def test_one_failed_batch_keeps_the_rest(fake_http):
    def flaky(params: dict) -> str:
        if params["latitude"].startswith("30.7333"):  # the batch holding Chandigarh
            raise ValueError("boom")
        return _by_point_count(params)

    fake_http.routes["api.open-meteo.com"] = flaky
    df = weather.live("refresh")
    assert 0 < df["point_id"].nunique() < 81
