"""District boundaries for Punjab, Haryana and Chandigarh, and point-in-district lookup."""

from __future__ import annotations

import io
import json
import logging
import re
import zipfile
from functools import lru_cache
from pathlib import Path

import numpy as np
import pandas as pd
import shapely
from shapely.geometry import shape

from vayu import config
from vayu.http import get_session

log = logging.getLogger(__name__)

GADM_URL = "https://geodata.ucdavis.edu/gadm/gadm4.1/json/gadm41_IND_2.json.zip"
STATES = ("Punjab", "Haryana", "Chandigarh")


def districts_path() -> Path:
    return config.static_dir() / "districts_pb_hr.geojson"


def _pretty(name: str) -> str:
    """GADM squashes names ("FatehgarhSahib"); put the spaces back."""
    return re.sub(r"(?<=[a-z])(?=[A-Z])", " ", name)


def download_districts(force: bool = False) -> Path:
    """Download GADM 4.1 India level-2 boundaries once and keep only our three states."""
    path = districts_path()
    if path.exists() and not force:
        return path
    log.info("Downloading district boundaries from GADM (~1.5 MB)...")
    resp = get_session().get(GADM_URL, timeout=180)
    resp.raise_for_status()
    with zipfile.ZipFile(io.BytesIO(resp.content)) as zf:
        gadm = json.loads(zf.read(zf.namelist()[0]))
    features = [
        {
            "type": "Feature",
            "properties": {"state": f["properties"]["NAME_1"], "district": _pretty(f["properties"]["NAME_2"])},
            "geometry": f["geometry"],
        }
        for f in gadm["features"]
        if f["properties"]["NAME_1"] in STATES
    ]
    path.write_text(json.dumps({"type": "FeatureCollection", "features": features}), encoding="utf-8")
    log.info("Saved %d districts to %s", len(features), path)
    return path


@lru_cache(maxsize=4)
def _load(path: str) -> tuple[shapely.STRtree, np.ndarray, np.ndarray]:
    features = json.loads(Path(path).read_text(encoding="utf-8"))["features"]
    polygons = [shape(f["geometry"]) for f in features]
    states = np.array([f["properties"]["state"] for f in features], dtype=object)
    districts = np.array([f["properties"]["district"] for f in features], dtype=object)
    return shapely.STRtree(polygons), states, districts


def assign_districts(df: pd.DataFrame, path: Path | None = None) -> pd.DataFrame:
    """Add `state` and `district` columns; points outside PB/HR/CH (or no boundary file) get NA."""
    path = path or districts_path()
    state = np.full(len(df), None, dtype=object)
    district = np.full(len(df), None, dtype=object)
    if not path.exists():
        log.warning("No district file at %s; run `vayu districts`. Leaving district empty.", path)
    elif len(df):
        tree, states, districts = _load(str(path))
        points = shapely.points(df["lon"].to_numpy(), df["lat"].to_numpy())
        point_idx, poly_idx = tree.query(points, predicate="within")
        state[point_idx] = states[poly_idx]
        district[point_idx] = districts[poly_idx]
    return df.assign(state=state, district=district)
