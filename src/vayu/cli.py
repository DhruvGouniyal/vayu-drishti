"""Command-line entry point: `vayu backfill | live | districts | status | coverage`."""

from __future__ import annotations

import argparse
import logging
import sys
from collections.abc import Callable

import pandas as pd

from vayu import config, coverage, geo, storage
from vayu.http import CacheMode
from vayu.ingest import aqi, firms, weather

log = logging.getLogger("vayu")

SOURCES = ("firms", "weather", "aqi")
# source -> (output parquet name, schema kind) per command
OUTPUTS = {
    "backfill": {"firms": ("fires_history", "fires"), "weather": ("weather_history", "weather"), "aqi": ("aqi_history", "aqi")},
    "live": {"firms": ("fires_live", "fires"), "weather": ("weather_forecast", "weather"), "aqi": ("aqi_live", "aqi")},
}


def main(argv: list[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s %(levelname)-7s %(name)s: %(message)s",
        datefmt="%H:%M:%S",
    )
    if args.command == "districts":
        print(f"District boundaries: {geo.download_districts(force=args.force)}")
        return 0
    if args.command == "status":
        return status()
    if args.command == "coverage":
        return print_coverage(args.seasons)

    if args.command == "backfill":
        mode: CacheMode = "offline" if args.offline else "prefer_cache"
        fetchers = {
            "firms": lambda: firms.backfill(args.seasons, mode),
            "weather": lambda: weather.backfill(args.seasons, mode),
            "aqi": lambda: aqi.backfill(args.seasons, mode),
        }
        checks = {
            "firms": lambda df: coverage.check_fires(df, args.seasons),
            "weather": lambda df: coverage.check_weather(df, args.seasons),
            "aqi": lambda df: coverage.check_aqi(df, args.seasons),
        }
    else:
        mode = "offline" if args.offline else "refresh"
        fetchers = {"firms": lambda: firms.live(mode), "weather": lambda: weather.live(mode), "aqi": lambda: aqi.live(mode)}
        checks = {"aqi": coverage.check_live_aqi}

    if "firms" in args.sources and not args.offline:
        _ensure_districts()
    jobs = {name: fetchers[name] for name in args.sources}
    return run(jobs, OUTPUTS[args.command], checks, verbose=args.verbose)


def run(
    jobs: dict[str, Callable[[], pd.DataFrame]],
    outputs: dict[str, tuple[str, str]],
    checks: dict[str, Callable[[pd.DataFrame], list[str]]] | None = None,
    verbose: bool = False,
) -> int:
    """Run each fetcher in isolation, write its Parquet and run its coverage check.

    Status per source: OK, WARN (saved, but coverage gaps) or FAILED. Returns 0 if any saved.
    """
    checks = checks or {}
    summary: dict[str, str] = {}
    for name, job in jobs.items():
        log.info("==== %s ====", name)
        out_name, kind = outputs[name]
        try:
            df = job()
            path = storage.write(df, out_name, kind)
            warnings = checks[name](storage.read(out_name)) if name in checks else []
            for warning in warnings:
                log.warning("%s: %s", name, warning)
            status_word = "WARN" if warnings else "OK"
            summary[name] = f"{status_word:<7} {len(df):>9,} rows -> {path}"
            summary[name] += "".join(f"\n{'':11}! {w}" for w in warnings)
        except Exception as exc:  # one failing source must never take down the whole run
            log.error("%s failed: %s", name, exc, exc_info=verbose)
            summary[name] = f"FAILED  {exc}"

    print("\nSummary")
    for name, line in summary.items():
        print(f"  {name:<8} {line}")
    return 0 if any(not line.startswith("FAILED") for line in summary.values()) else 1


def status() -> int:
    """Print row counts, time span and sources of each processed dataset."""
    files = sorted(config.processed_dir().glob("*.parquet"))
    if not files:
        print("No processed data yet. Run `vayu backfill` or `vayu live`.")
        return 1
    for path in files:
        df = pd.read_parquet(path)
        span = f"{df['time_utc'].min():%Y-%m-%d %H:%M} -> {df['time_utc'].max():%Y-%m-%d %H:%M} UTC" if len(df) else "empty"
        sources = ", ".join(f"{s}={n:,}" for s, n in df["source"].value_counts().items())
        print(f"{path.stem:<18} {len(df):>9,} rows  {span}  [{sources}]")
    return 0


def print_coverage(seasons: list[int]) -> int:
    """AQI coverage % per station and season, and FIRMS detections per season and satellite."""
    processed = config.processed_dir()
    found = False
    if (processed / "aqi_history.parquet").exists():
        found = True
        aqi_df = storage.read("aqi_history")
        for col, label in (("aqi", "AQI"), ("pm25", "PM2.5"), ("pm10", "PM10")):
            print(f"\n{label} coverage, % of season hours (1 Oct - 30 Nov):")
            print(coverage.aqi_coverage(aqi_df, seasons, col).to_string())
        sources = aqi_df.groupby([aqi_df["time_utc"].dt.year.rename("season"), "source"]).size().unstack(fill_value=0)
        print("\nAQI rows by source:")
        print(sources.to_string())
    if (processed / "fires_history.parquet").exists():
        found = True
        print("\nFIRMS detections per season and satellite:")
        print(coverage.fires_by_satellite(storage.read("fires_history")).to_string())
    if not found:
        print("No history yet. Run `vayu backfill` first.")
    return 0 if found else 1


def _ensure_districts() -> None:
    try:
        geo.download_districts()
    except Exception as exc:  # districts are nice-to-have; fires still get saved without them
        log.warning("Could not download district boundaries (%s); fires will have no district", exc)


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="vayu", description="Vayu Drishti data ingestion")
    parser.add_argument("-v", "--verbose", action="store_true", help="debug logging and full tracebacks")
    sub = parser.add_subparsers(dest="command", required=True)

    backfill = sub.add_parser("backfill", help="download history for past stubble seasons (Oct-Nov)")
    backfill.add_argument("--seasons", type=int, nargs="+", default=list(config.DEFAULT_SEASONS))
    live = sub.add_parser("live", help="fetch latest fires, 3-day weather forecast and recent AQI")
    for p in (backfill, live):
        p.add_argument("--sources", nargs="+", choices=SOURCES, default=list(SOURCES))
        p.add_argument("--offline", action="store_true", help="use only cached raw responses (no network)")

    districts = sub.add_parser("districts", help="download Punjab/Haryana district boundaries")
    districts.add_argument("--force", action="store_true", help="re-download even if present")
    sub.add_parser("status", help="summarise what is in data/processed/")
    cov = sub.add_parser("coverage", help="AQI coverage per station/season and FIRMS counts per satellite")
    cov.add_argument("--seasons", type=int, nargs="+", default=list(config.DEFAULT_SEASONS))
    return parser


if __name__ == "__main__":
    sys.exit(main())
