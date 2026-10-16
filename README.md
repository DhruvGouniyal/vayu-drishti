# Vayu Drishti: data ingestion (Phase 1)

Vayu Drishti forecasts Chandigarh air quality 48 h ahead and attributes smog to stubble fires in Punjab and Haryana. Phase 1 builds the data pipeline:

| Source | What | Output (data/processed/) |
|---|---|---|
| NASA FIRMS | VIIRS fire detections (SNPP, NOAA-20, NOAA-21) with district | `fires_history.parquet`, `fires_live.parquet` |
| Open-Meteo | Hourly wind (10 m, 80 m, 120 m, 925 hPa, 850 hPa), temp, RH, rain, boundary layer height for Chandigarh + a 0.5° grid (81 points) | `weather_history.parquet`, `weather_forecast.parquet` |
| OpenAQ v3 + CPCB files (+ data.gov.in for live) | Hourly PM2.5, PM10 and computed AQI for Sector 22, 25, 53 | `aqi_history.parquet`, `aqi_live.parquet` |

Every table has `time_utc` (tz-aware UTC), `lat`/`lon`, and a `source` column. The schemas are in [src/vayu/storage.py](src/vayu/storage.py).

## Setup

```powershell
python -m venv .venv
.venv\Scripts\activate            # macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
pip install -e .                  # registers the `vayu` command
copy .env.example .env            # then paste your two keys into .env
```

Keys (all free):
- **FIRMS_MAP_KEY**: https://firms.modaps.eosdis.nasa.gov/api/map_key/ (arrives by email instantly)
- **OPENAQ_API_KEY**: https://explore.openaq.org/register (API key is on your account page)
- **DATA_GOV_IN_API_KEY**: https://www.data.gov.in/ → sign up → My Account → generate key (live AQI fallback)

Open-Meteo needs no key.

## Commands

```powershell
vayu districts      # one-time: download Punjab/Haryana district boundaries (GADM 4.1, ~1.5 MB)
vayu backfill       # Oct–Nov of 2023, 2024, 2025 -> *_history.parquet
vayu live           # latest 3 days of fires, 3-day forecast, last 72 h AQI
vayu status         # rows, time span and sources per dataset
vayu coverage       # AQI coverage % per station/season, FIRMS detections per season/satellite
pytest              # tests (no network needed)
```

Useful flags: `--sources firms weather aqi` to run a subset, `--seasons 2024 2025`, `--offline`, `-v` for full tracebacks. `python -m vayu ...` works the same as `vayu ...`.

## Offline demo

Every raw API response is cached under `data/raw/<source>/`. Historical responses are reused on later runs. Live responses are overwritten on each successful run.

- `vayu backfill --offline` / `vayu live --offline` rebuild the Parquet files from the cache without using the network.
- If the network drops during a normal `vayu live`, each request falls back to its last cached copy automatically.

Before the demo, run `vayu backfill` and `vayu live` once on good Wi-Fi. Then copy the whole `data/` folder to the demo laptop.

## Failure behaviour

- Each source runs on its own. If one fails, it is marked `FAILED` in the summary and the others still save.
- After saving, each source runs a coverage check. Gaps show as `WARN` plus one `!` line per problem, so they never pass silently. Checks: AQI/PM coverage below 50% per station-season, a season with no fires (or none from SNPP/NOAA-20), weather below 95% of expected point-hours, and live AQI more than 3 h old.
- Within a source, each request is independent. If 2 of 104 FIRMS chunks fail, you get the other 102 and a warning.
- HTTP 429/5xx responses are retried 5 times with exponential backoff, honouring `Retry-After`. Requests are throttled to stay under the free-tier limits (OpenAQ 60/min, Open-Meteo 600 weighted calls/min).
- Error bodies returned with HTTP 200 (e.g. FIRMS `Invalid MAP_KEY.`) are detected and never cached.
- The exit code is 0 if at least one source was saved (OK or WARN), otherwise 1.

## Data notes

- **FIRMS:** at most 5 days per request, so the backfill makes ~104 small requests. For each day it uses SP (science-quality archive) if available, otherwise NRT, based on FIRMS' `data_availability` endpoint. NOAA-21 has no SP archive. Its 2023 data is missing because NRT only starts in 2024. Only exact repeats are removed (same satellite, pixel and time). Separate satellite passes over one fire stay as separate rows. `fire_type = 2` (SP only) marks static industrial sources such as refinery flares. Filter these out before attribution.
- **Districts:** GADM 4.1 has 22 Punjab and 21 Haryana districts. Malerkotla (2021) shows as Sangrur and Charkhi Dadri as Bhiwani. Fires in Pakistani Punjab and other neighbouring areas inside the bounding box are kept with an empty district, because their smoke matters too.
- **Weather history:** uses Open-Meteo's *historical forecast* archive, which holds archived model runs. Training inputs therefore look like the live forecasts the model will see. That archive lacks boundary layer height before 2024, so 2023 is filled from ERA5. Wind speed is in m/s and direction in degrees (meteorological convention: the direction the wind blows *from*).
- **OpenAQ gap:** OpenAQ has no CPCB data between 31 Oct 2022 and 18 Feb 2025, so the 2023 and 2024 seasons come from manual CPCB files ([data/README.md](data/README.md)). Some locations have a legacy and a current sensor per pollutant. Every sensor active in the requested window is queried, and the newest wins where they overlap.
- **Live AQI:** OpenAQ's CPCB feed can lag by two days or more. When OpenAQ's latest hour is more than 3 h old, live mode adds data.gov.in's real-time CPCB feed (resource `3b01bcb8-...`, usually 1–2 h behind). That feed gives one 24 h average per station and pollutant, with no history. Each snapshot is archived in `data/raw/datagov/snapshots.parquet`, so running `vayu live` regularly builds a series. Those rows have `pm25_24h`/`pm10_24h` and AQI but no hourly `pm25`/`pm10`.
- **AQI:** India's National AQI, computed from trailing 24 h PM2.5 and PM10 means (at least 16 valid hours). The official CPCB AQI also includes gases, but PM dominates in Chandigarh's post-monsoon season. `time_utc` is the start of the averaging hour. PM readings of 0 or below, or above 1500 µg/m³, are treated as sensor faults.

## Manual downloads

The 2023 and 2024 AQI seasons need 6 CPCB files (3 stations × 2 seasons), plus 1 recommended file for Sector 53 2025. The exact list and steps are in [data/README.md](data/README.md). Check the result with `vayu coverage`.

## Layout

```
src/vayu/
  config.py        bbox, stations, seasons, paths, keys
  http.py          retries, throttling, raw-response cache
  storage.py       Parquet schemas
  geo.py           district boundaries + point-in-polygon
  cli.py           `vayu` command
  coverage.py      coverage tables + checks behind WARN
  ingest/firms.py  ingest/weather.py  ingest/aqi.py  ingest/datagov.py
data/raw/          cached API responses (gitignored)
data/processed/    Parquet outputs (gitignored)
data/manual/cpcb/  CPCB files you download by hand
data/static/       district GeoJSON
notebooks/         exploration
tests/
```
