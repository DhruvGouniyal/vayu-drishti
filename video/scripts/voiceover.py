"""Generate one narration MP3 per clip with edge-tts, plus word timings for subtitles.

Reads ../narration.json and writes:
  public/audio/<clip id>.mp3
  public/audio/timings.json   {clip id: {"duration": seconds, "words": [[text, start, end], ...]}}

Clips whose text and voice haven't changed are skipped, so re-running is fast.
Use --force to regenerate everything (e.g. after changing the voice or rate).

    python scripts/voiceover.py            # from the video/ folder
    python scripts/voiceover.py --force
"""

from __future__ import annotations

import argparse
import asyncio
import hashlib
import json
import sys
from pathlib import Path

try:
    import edge_tts
except ImportError:
    sys.exit("edge-tts is missing. Install it with:  pip install edge-tts")

VIDEO_DIR = Path(__file__).resolve().parents[1]
NARRATION = VIDEO_DIR / "narration.json"
AUDIO_DIR = VIDEO_DIR / "public" / "audio"
TIMINGS = AUDIO_DIR / "timings.json"

# edge-tts always returns 24 kHz, 48 kbit/s constant-bitrate mono MP3,
# so the duration follows exactly from the file size.
MP3_BYTES_PER_SECOND = 48_000 / 8
TICKS_PER_SECOND = 10_000_000  # edge-tts offsets are in 100 ns units


def clip_hash(text: str, voice: str, rate: str) -> str:
    return hashlib.sha1(f"{voice}|{rate}|{text}".encode()).hexdigest()[:12]


async def synthesize(text: str, voice: str, rate: str, out: Path) -> list[list]:
    communicate = edge_tts.Communicate(text, voice, rate=rate, boundary="WordBoundary")
    words: list[list] = []
    with out.open("wb") as f:
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                f.write(chunk["data"])
            elif chunk["type"] == "WordBoundary":
                start = chunk["offset"] / TICKS_PER_SECOND
                end = (chunk["offset"] + chunk["duration"]) / TICKS_PER_SECOND
                words.append([chunk["text"], round(start, 3), round(end, 3)])
    return words


async def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--force", action="store_true", help="regenerate every clip")
    args = parser.parse_args()

    cfg = json.loads(NARRATION.read_text(encoding="utf-8"))
    voice, rate = cfg["voice"], cfg.get("rate", "+0%")
    AUDIO_DIR.mkdir(parents=True, exist_ok=True)
    old = json.loads(TIMINGS.read_text(encoding="utf-8")) if TIMINGS.exists() else {}
    timings = {}

    for clip in cfg["clips"]:
        cid, text = clip["id"], clip["text"]
        out = AUDIO_DIR / f"{cid}.mp3"
        h = clip_hash(text, voice, rate)
        if not args.force and out.exists() and old.get(cid, {}).get("hash") == h:
            timings[cid] = old[cid]
            print(f"  {cid:<16} unchanged ({old[cid]['duration']:.2f}s)")
            continue
        for attempt in range(3):
            try:
                words = await synthesize(text, voice, rate, out)
                break
            except Exception as exc:  # network hiccups are common; retry a couple of times
                if attempt == 2:
                    raise
                print(f"  {cid}: {exc!r}, retrying...")
                await asyncio.sleep(2)
        duration = out.stat().st_size / MP3_BYTES_PER_SECOND
        # edge-tts leaves ~0.8 s of silence at the end of every clip; the video times
        # each scene from where speech actually stops (plus padding_seconds) instead.
        speech_end = min(duration, words[-1][2] + 0.15) if words else duration
        timings[cid] = {"hash": h, "duration": round(duration, 3), "speech_end": round(speech_end, 3), "words": words}
        print(f"  {cid:<16} {duration:5.2f}s  {len(words)} words")

    TIMINGS.write_text(json.dumps(timings, indent=1), encoding="utf-8")
    total = sum(t.get("speech_end", t["duration"]) for t in timings.values())
    pad = cfg.get("padding_seconds", 0.5) * len(timings)
    print(f"Voice: {voice} ({rate}). Narration {total:.1f}s + padding {pad:.1f}s = {total + pad:.1f}s")


if __name__ == "__main__":
    asyncio.run(main())
