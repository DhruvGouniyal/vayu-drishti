"""One command to rebuild the whole video:

    python scripts/build.py              # data export -> voiceover -> render -> timing report
    python scripts/build.py --skip-data  # keep the existing public/data/*.json
    python scripts/build.py --skip-voice # reuse the existing MP3s (no internet needed)
    python scripts/build.py --report     # only print the timing report

Run it from the video/ folder (or double-click build.bat on Windows).
Output: out/vayu_drishti.mp4
"""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
from pathlib import Path

VIDEO_DIR = Path(__file__).resolve().parents[1]
FPS = 30


def run(cmd: list[str]) -> None:
    print(f"\n> {' '.join(cmd)}", flush=True)
    subprocess.run(cmd, cwd=VIDEO_DIR, check=True)


def tool(name: str) -> str:
    path = shutil.which(name)
    if not path:
        sys.exit(f"'{name}' was not found on PATH. Install Node.js 18+ from https://nodejs.org and try again.")
    return path


def timing_report() -> None:
    """Scene lengths as the video will use them (same rules as src/timeline.ts) vs the planned script."""
    cfg = json.loads((VIDEO_DIR / "narration.json").read_text(encoding="utf-8"))
    timings_file = VIDEO_DIR / "public" / "audio" / "timings.json"
    timings = json.loads(timings_file.read_text(encoding="utf-8")) if timings_file.exists() else {}
    pad = cfg.get("padding_seconds", 0.5)
    holds = cfg.get("scene_hold_seconds", {})
    planned = cfg.get("planned_seconds", {})
    scenes = sorted({c["scene"] for c in cfg["clips"]})

    total_frames = 0
    print("\nScene   actual   planned   diff")
    for s in scenes:
        frames = round(cfg.get("lead_in_seconds", 0.4) * FPS) if s == scenes[0] else 0
        for c in (c for c in cfg["clips"] if c["scene"] == s):
            t = timings.get(c["id"])
            speech = (t.get("speech_end") or t["duration"]) if t else len(c["text"].split()) / 2.6
            frames += round((speech + pad) * FPS)
        frames += round(holds.get(str(s), 0) * FPS)
        total_frames += frames
        actual = frames / FPS
        plan = planned.get(str(s))
        diff = actual - plan if plan is not None else 0
        flag = "  <-- audio runs long" if plan is not None and diff > 0.25 else ""
        print(f"  {s}    {actual:6.1f}s   {plan if plan is not None else '-':>5}s   {diff:+5.1f}s{flag}")
    print(f"Total: {total_frames / FPS:.1f}s ({int(total_frames / FPS // 60)}:{total_frames / FPS % 60:04.1f})")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--skip-data", action="store_true")
    parser.add_argument("--skip-voice", action="store_true")
    parser.add_argument("--force-voice", action="store_true", help="regenerate every narration clip")
    parser.add_argument("--report", action="store_true", help="only print the timing report")
    args = parser.parse_args()

    if args.report:
        timing_report()
        return

    py = sys.executable
    if not args.skip_data:
        if (VIDEO_DIR.parent / "data" / "processed" / "fires_history.parquet").exists():
            run([py, "scripts/export_data.py"])
        else:
            print("No data/processed/fires_history.parquet found; keeping the existing public/data/*.json")
    if not args.skip_voice:
        run([py, "scripts/voiceover.py"] + (["--force"] if args.force_voice else []))

    npm, npx = tool("npm"), tool("npx")
    if not (VIDEO_DIR / "node_modules" / "remotion").exists():
        run([npm, "install"])
    run([npx, "remotion", "render", "VayuDrishti", "out/vayu_drishti.mp4"])

    timing_report()
    print(f"\nDone: {VIDEO_DIR / 'out' / 'vayu_drishti.mp4'}")


if __name__ == "__main__":
    main()
