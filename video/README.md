# Vayu Drishti explainer video

A 2-minute, 1920×1080, 30 fps explainer built with [Remotion](https://www.remotion.dev) (React → MP4).
Narration is generated with `edge-tts` (voice `en-IN-PrabhatNeural`), subtitles are burned in, and every
visual is drawn in code from the project's own data. No stock footage, logos or music.

Output: `out/vayu_drishti.mp4`

## Rebuild everything

Needs Node.js 18+ and the repo's Python environment (`.venv` is picked up automatically).

```
cd video
npm install            # first time only
python scripts/build.py
```

On Windows you can double-click `build.bat` instead. The build:

1. exports the data the video needs into `public/data/` (`scripts/export_data.py`)
2. regenerates the narration MP3s that changed (`scripts/voiceover.py`, needs internet)
3. renders `out/vayu_drishti.mp4`
4. prints each scene's length against the planned script and flags any scene whose audio runs long

Useful flags: `--skip-voice` (reuse the MP3s, works offline), `--skip-data`, `--force-voice`,
`--report` (timing table only). `npm run studio` opens the Remotion editor so you can scrub through
scenes live.

## Change the narration

All voiceover text lives in `narration.json`, one entry per clip:

- Edit a clip's `text`, then rebuild. Only changed clips are re-recorded.
- Scene lengths follow the audio: each clip gets its spoken length plus `padding_seconds` (0.5 s).
  The visual cues inside a scene are tied to specific spoken words (see `cue(...)` calls in the scene
  files), so they move with the voice. If you remove a word a cue points at, that cue falls back to a
  fixed point in the clip; search the scene file for the word to re-point it.
- `voice` can be `en-IN-PrabhatNeural` or `en-IN-NeerjaNeural`; `rate` is the speaking speed
  (currently `+10%` to land near 2:00). Changing either re-records every clip.
- `planned_seconds` is only used for the timing report.

## Swap in real Phase 2 results

Everything that is not real data yet sits in **`src/results.ts`**, marked `PLACEHOLDER`:

| Constant | Used in | What to put there |
|---|---|---|
| `FORECAST_CHART` | Scene 4.4 line chart | a real 6-day hindcast: measured AQI and the forecast issued 48 h earlier, every 3 h |
| `ATTRIBUTION` | Scene 4.4 donut | estimated source shares (must sum to 100) and the top fire districts |
| `SOURCE_DISTRICTS` | Scene 5 officer card | top source districts and their estimated shares |
| `ALERT` | Scene 5 phone | alert text in English, Hindi and Punjabi |
| `TEAM_NAME` | Scene 7 | your team name |

While `SHOW_PLACEHOLDER_BADGE = true`, the charts that use these numbers carry a small
"Illustrative data" tag. Set it to `false` once the numbers are real, then re-render
(`python scripts/build.py --skip-voice --skip-data`).

## What is real and what is drawn

Real, from this repo:
- District outlines: `data/static/districts_pb_hr.geojson` (simplified)
- Fire points: `data/processed/fires_history.parquet`, the 2024 season inside Punjab/Haryana/Chandigarh,
  animated day by day in scene 2. Scene 4.1 shows the busiest single day (18 Nov 2024).
  Change the season with `python scripts/export_data.py --season 2023`.
- Detections per season in scene 3 (78,788 / 53,220 / 32,095: all VIIRS points in the study box, 1 Oct–30 Nov)
- Fire clusters in scene 4.3 (the season's top districts by detections)
- Chandigarh's location and the three CPCC stations: `src/vayu/config.py`

Stylised: the Chandigarh street grid (scene 1), the smoke wisps, the satellite pass, the farmland tile and
burn-scar mask (4.2), the trajectory curves (4.3), and the Indo-Gangetic plain city dots (scene 6).

## Layout

```
narration.json            voiceover text, voice, timing settings
scripts/                  export_data.py · voiceover.py · build.py
public/audio/             generated MP3s + word timings (timings.json)
public/data/              exported JSON (districts, fires, stats)
public/fonts/             Inter + Noto Sans Devanagari/Gurmukhi (SIL OFL)
src/timeline.ts           scene/clip timing built from the audio, plus cue() helpers
src/results.ts            PLACEHOLDER numbers + team name
src/theme.ts              colours, AQI bands
src/scenes/               one file per scene; scene 4's steps are in src/scenes/scene4/
src/components/           backdrop, headline, maps, subtitles, logo
```
