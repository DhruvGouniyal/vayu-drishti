from datetime import date

import pandas as pd
import pytest

from vayu import storage
from vayu.http import FetchError
from vayu.ingest import firms

HEADER = "latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_ti5,frp,daynight"
NRT_CSV = f"""{HEADER}
30.21,75.12,330.1,0.39,0.36,2023-10-15,812,N,VIIRS,n,2.0NRT,290.2,5.4,D
30.21,75.12,330.1,0.39,0.36,2023-10-15,812,N,VIIRS,n,2.0NRT,290.2,5.4,D
29.85,76.40,345.0,0.40,0.37,2023-10-15,2048,N,VIIRS,h,2.0NRT,285.0,12.1,N
"""
SP_CSV = f"""{HEADER},type
30.21,75.12,330.1,0.39,0.36,2023-10-15,812,N,VIIRS,n,2,290.2,5.6,D,0
"""


def test_parse_firms_csv():
    df = firms.parse_firms_csv(NRT_CSV, "SNPP", "VIIRS_SNPP_NRT")
    assert len(df) == 3
    assert df.loc[0, "time_utc"] == pd.Timestamp("2023-10-15 08:12", tz="UTC")
    assert df.loc[2, "time_utc"] == pd.Timestamp("2023-10-15 20:48", tz="UTC")
    assert df["confidence"].tolist() == ["nominal", "nominal", "high"]
    assert set(df["satellite"]) == {"SNPP"} and set(df["product"]) == {"NRT"}


def test_header_only_csv_gives_empty_frame():
    assert firms.parse_firms_csv(HEADER + "\n", "SNPP", "VIIRS_SNPP_NRT").empty


def test_dedupe_drops_repeats_and_prefers_sp():
    nrt = firms.parse_firms_csv(NRT_CSV, "SNPP", "VIIRS_SNPP_NRT")
    sp = firms.parse_firms_csv(SP_CSV, "SNPP", "VIIRS_SNPP_SP")
    out = firms.dedupe(pd.concat([nrt, sp], ignore_index=True))
    assert len(out) == 2
    morning = out[out["time_utc"].dt.hour == 8].iloc[0]
    assert morning["product"] == "SP" and morning["frp"] == 5.6


def test_plan_requests_chunks_and_picks_sp_before_nrt():
    availability = {
        "VIIRS_SNPP_SP": (date(2012, 1, 20), date(2025, 10, 20)),
        "VIIRS_SNPP_NRT": (date(2025, 10, 15), date(2026, 10, 15)),
        "VIIRS_NOAA21_NRT": (date(2024, 1, 17), date(2026, 10, 15)),
    }
    plan = firms.plan_requests(date(2025, 10, 18), date(2025, 10, 27), availability)
    snpp = [(src, d, n) for sat, src, d, n in plan if sat == "SNPP"]
    assert snpp == [
        ("VIIRS_SNPP_SP", date(2025, 10, 18), 3),
        ("VIIRS_SNPP_NRT", date(2025, 10, 21), 5),
        ("VIIRS_SNPP_NRT", date(2025, 10, 26), 2),
    ]
    assert not any(sat == "NOAA20" for sat, *_ in plan)  # no availability -> skipped
    assert all(n <= firms.MAX_DAY_RANGE for *_, n in plan)


def test_live_merges_satellites_and_conforms(fake_http):
    fake_http.routes["VIIRS_SNPP_NRT"] = NRT_CSV
    fake_http.routes["VIIRS_NOAA20_NRT"] = NRT_CSV.replace("2023-10-15,812", "2023-10-15,902")
    fake_http.routes["VIIRS_NOAA21_NRT"] = HEADER + "\n"
    df = storage.conform(firms.live("refresh"), "fires")
    assert len(df) == 4  # 2 unique per satellite; the repeated row in each file is dropped
    assert list(df.columns) == list(storage.SCHEMAS["fires"])
    assert df["district"].isna().all()  # no boundary file in the test data dir


def test_bad_key_fails_cleanly(fake_http):
    fake_http.routes["firms"] = "Invalid MAP_KEY."
    with pytest.raises(FetchError, match="all 3 requests failed"):
        firms.live("refresh")


def test_missing_key_message(monkeypatch):
    monkeypatch.delenv("FIRMS_MAP_KEY")
    with pytest.raises(FetchError, match="FIRMS_MAP_KEY"):
        firms.live("refresh")
