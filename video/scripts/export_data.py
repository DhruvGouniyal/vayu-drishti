"""Export the small slices of real project data that the video needs into public/data/*.json.

Reads (relative to the repo root):
  data/static/districts_pb_hr.geojson     district boundaries (simplified here)
  data/processed/fires_history.parquet    NASA FIRMS VIIRS fire detections
  src/vayu/config.py                      Chandigarh centre and the three CPCC stations

Writes:
  public/data/districts.json   simplified district outlines + centroids
  public/data/fires.json       one season of fire points, by day (for the map animations)
  public/data/stats.json       detections per season, top districts, Chandigarh + stations

    python scripts/export_data.py              # from the video/ folder
    python scripts/export_data.py --season 2023
"""

from __future__ import annotations

import argparse
import ast
import json
from datetime import date
from pathlib import Path

import pandas as pd
from shapely.geometry import mapping, shape

VIDEO_DIR = Path(__file__).resolve().parents[1]
REPO = VIDEO_DIR.parent
OUT = VIDEO_DIR / "public" / "data"

DISTRICTS = REPO / "data" / "static" / "districts_pb_hr.geojson"
FIRES = REPO / "data" / "processed" / "fires_history.parquet"
CONFIG = REPO / "src" / "vayu" / "config.py"


def read_config() -> dict:
    """Pull CHANDIGARH and STATIONS out of config.py without importing it (no dotenv needed)."""
    tree = ast.parse(CONFIG.read_text(encoding="utf-8"))
    chandigarh, stations = None, []
    for node in ast.walk(tree):
        if isinstance(node, (ast.Assign, ast.AnnAssign)):
            target = node.targets[0] if isinstance(node, ast.Assign) else node.target
            if isinstance(target, ast.Name) and target.id == "CHANDIGARH":
                chandigarh = ast.literal_eval(node.value)
        if isinstance(node, ast.Call) and getattr(node.func, "id", None) == "Station":
            key, name, lat, lon = (ast.literal_eval(a) for a in node.args[:4])
            stations.append({"key": key, "name": name, "lat": lat, "lon": lon})
    if chandigarh is None or not stations:
        raise SystemExit(f"Couldn't find CHANDIGARH / STATIONS in {CONFIG}")
    return {"chandigarh": {"lat": chandigarh[0], "lon": chandigarh[1]}, "stations": stations}


def rounded(coords, nd=3):
    if isinstance(coords[0], (int, float)):
        return [round(coords[0], nd), round(coords[1], nd)]
    return [rounded(c, nd) for c in coords]


def export_districts() -> list[dict]:
    gj = json.loads(DISTRICTS.read_text(encoding="utf-8"))
    out = []
    for f in gj["features"]:
        geom = shape(f["geometry"])
        simple = geom.simplify(0.008, preserve_topology=True)
        polys = [simple] if simple.geom_type == "Polygon" else list(simple.geoms)
        rings = [rounded(list(p.exterior.coords)) for p in polys if p.area > 0.0005 or len(polys) == 1]
        c = geom.representative_point()
        out.append(
            {
                "state": f["properties"]["state"],
                "district": f["properties"]["district"],
                "centroid": [round(c.x, 3), round(c.y, 3)],
                "rings": rings,
            }
        )
    (OUT / "districts.json").write_text(json.dumps({"districts": out}, separators=(",", ":")), encoding="utf-8")
    return out


def export_fires(season: int) -> pd.DataFrame:
    fires = pd.read_parquet(FIRES, columns=["time_utc", "lat", "lon", "frp", "state", "district"])
    start = pd.Timestamp(date(season, 10, 1), tz="UTC")
    end = pd.Timestamp(date(season, 12, 1), tz="UTC")
    s = fires[(fires.time_utc >= start) & (fires.time_utc < end) & fires.state.notna()].copy()
    s["day"] = ((s.time_utc - start).dt.days).astype(int)
    s = s.sort_values(["day", "time_utc"])
    flat: list[float] = []
    for d, lon, lat in zip(s.day, s.lon, s.lat):
        flat.extend([int(d), round(float(lon), 3), round(float(lat), 3)])
    daily = s.groupby("day").size().reindex(range(61), fill_value=0).tolist()
    (OUT / "fires.json").write_text(
        json.dumps({"season": season, "start": f"{season}-10-01", "days": 61, "daily": daily, "points": flat},
                   separators=(",", ":")),
        encoding="utf-8",
    )
    print(f"  fires.json: {len(s):,} detections inside Punjab/Haryana/Chandigarh, {season} season")
    return fires


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--season", type=int, default=2024, help="season animated on the maps")
    args = parser.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)

    districts = export_districts()
    print(f"  districts.json: {len(districts)} districts")
    fires = export_fires(args.season)

    in_season = fires[fires.time_utc.dt.month.isin([10, 11])]
    per_season = in_season.groupby(in_season.time_utc.dt.year).size()
    season_fires = in_season[(in_season.time_utc.dt.year == args.season) & in_season.district.notna()]
    top = season_fires.groupby("district").size().sort_values(ascending=False).head(8)
    cent = {d["district"]: d["centroid"] for d in districts}
    stats = {
        **read_config(),
        "season": args.season,
        # All FIRMS VIIRS detections in the study box (config.BBOX), 1 Oct - 30 Nov.
        "detectionsPerSeason": [{"year": int(y), "count": int(n)} for y, n in per_season.items()],
        "topDistricts": [{"district": d, "count": int(n), "centroid": cent.get(d)} for d, n in top.items()],
    }
    (OUT / "stats.json").write_text(json.dumps(stats, indent=1), encoding="utf-8")
    print("  stats.json: " + ", ".join(f"{s['year']}: {s['count']:,}" for s in stats["detectionsPerSeason"]))


if __name__ == "__main__":
    main()
