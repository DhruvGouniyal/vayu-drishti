# data/

Everything here except this file is gitignored.

```
raw/<source>/      cached API responses (lets the pipeline run offline)
raw/datagov/       data.gov.in live snapshots; snapshots.parquet accumulates across live runs
processed/         Parquet outputs
manual/cpcb/       CPCB exports you download by hand (see below)
static/            districts_pb_hr.geojson (created by `vayu districts`)
```

## Manual CPCB download (required for 2023 and 2024)

OpenAQ has **no CPCB data from 31 Oct 2022 to 18 Feb 2025** for any Chandigarh station. Each station's old sensors stop at the start of that window and the new ones start at the end. So the 2023 and 2024 seasons must come from CPCB. `vayu backfill` reports them as `NO DATA` until you add these files.

### Files to download (6 required, 1 recommended)

| Save as (in `data/manual/cpcb/`) | Station (exact CPCB name) | From (IST) | To (IST) |
|---|---|---|---|
| `sector22_2023.xlsx` | Sector 22, Chandigarh - CPCC | 30-09-2023 00:00 | 01-12-2023 23:59 |
| `sector25_2023.xlsx` | Sector-25, Chandigarh - CPCC | 30-09-2023 00:00 | 01-12-2023 23:59 |
| `sector53_2023.xlsx` | Sector-53, Chandigarh - CPCC | 30-09-2023 00:00 | 01-12-2023 23:59 |
| `sector22_2024.xlsx` | Sector 22, Chandigarh - CPCC | 30-09-2024 00:00 | 01-12-2024 23:59 |
| `sector25_2024.xlsx` | Sector-25, Chandigarh - CPCC | 30-09-2024 00:00 | 01-12-2024 23:59 |
| `sector53_2024.xlsx` | Sector-53, Chandigarh - CPCC | 30-09-2024 00:00 | 01-12-2024 23:59 |
| `sector53_2025.xlsx` *(recommended)* | Sector-53, Chandigarh - CPCC | 30-09-2025 00:00 | 01-12-2025 23:59 |

The last file fills Sector 53's 2025 gaps: OpenAQ only covers about 62% of that season's hours. CPCB values only fill hours OpenAQ is missing, so downloading it never overwrites anything.

For every file use the same settings:
- **Parameters:** PM2.5 and PM10 (you can add others; they're ignored)
- **Averaging period:** 1 Hour. 15-minute data also works, because the loader averages it to hourly.
- **Report format:** Tabular, downloaded as Excel (.xlsx). CSV also works.

The window starts one day early so the 24 h AQI average is defined from 1 Oct.

### Steps

1. Go to https://airquality.cpcb.gov.in/ccr/ and open **Advanced Search** (CAAQM data). The portal's labels shift a little between versions.
2. Select State **Chandigarh**, City **Chandigarh**, and the station from the table above.
3. Set the parameters, the 1-hour averaging period and the date range, then submit.
4. Download as Excel and save it under the file name from the table. Any name containing `sector22` / `sector-25` / `sector 53` etc. works, but the names above keep it tidy.
5. Run `vayu backfill --sources aqi`, then `vayu coverage`. The 2023 and 2024 columns should now be close to 100%.

### How the files are merged

- Timestamps are read as IST and converted to UTC.
- `None`/`NA` and readings of 0 or below, or above 1500 µg/m³, become missing.
- 15-minute data is averaged to hourly.
- Rows are keyed on (station, hour), so overlapping or re-downloaded files never create duplicates.
- **Priority:** OpenAQ wins wherever it has a value, and CPCB fills the rest, column by column. An hour can take PM2.5 from OpenAQ and PM10 from CPCB.
- **Hour labels:** CPCB hours run hh:30 to hh:30 UTC (IST clock hours). Both sources label each hour by the UTC hour its start falls in, so the same CPCB hour lines up exactly. For example, 05:00–06:00 IST becomes 23:00 UTC.
