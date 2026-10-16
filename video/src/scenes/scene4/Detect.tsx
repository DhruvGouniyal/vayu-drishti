// Scene 4.1 — Detect: real FIRMS points from the season's busiest days pulse on the map.
import React, { useMemo } from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { formatInt, Kicker, progress } from '../../components/common';
import { CityMarker, DistrictMap, FireLayer, StateLabels } from '../../components/map';
import { CHANDIGARH, dayLabel, FIRE_DAILY, fitProjection, PB_HR_BOUNDS } from '../../data';
import { COLORS } from '../../theme';
import { clipCue } from '../../timeline';

// The single busiest day of the exported season (real data).
const PEAK_DAY = FIRE_DAILY.indexOf(Math.max(...FIRE_DAILY));

export const Detect: React.FC = () => {
  const frame = useCurrentFrame();
  const proj = useMemo(() => fitProjection(PB_HR_BOUNDS, { x: 140, y: 130, w: 760, h: 780 }), []);
  const [cx, cy] = proj(CHANDIGARH[0], CHANDIGARH[1]);
  const textAt = clipCue('s4_1_detect', 'detects', { fallback: 0.1 });
  const satAt = clipCue('s4_1_detect', 'NASA', { fallback: 0.5 });
  const timesAt = clipCue('s4_1_detect', 'several', { fallback: 0.75 });

  // A scan line sweeps the map, revealing the detections.
  const sweep = progress(frame, 6, 60);
  const top = proj(0, PB_HR_BOUNDS.north)[1];
  const bottom = proj(0, PB_HR_BOUNDS.south)[1];
  const scanY = top + (bottom - top) * sweep;

  return (
    <AbsoluteFill>
      <DistrictMap proj={proj} opacity={progress(frame, 0, 14)} />
      <StateLabels proj={proj} opacity={0.7} />
      <AbsoluteFill style={{ clipPath: `inset(0 0 ${1080 - scanY}px 0)` }}>
        <FireLayer proj={proj} mode="pulse" days={[PEAK_DAY]} />
      </AbsoluteFill>
      <div
        style={{
          position: 'absolute',
          left: 100,
          width: 840,
          top: scanY - 2,
          height: 4,
          background: COLORS.teal,
          boxShadow: `0 0 30px ${COLORS.teal}`,
          opacity: sweep > 0 && sweep < 1 ? 0.9 : 0,
        }}
      />
      <CityMarker x={cx} y={cy} label="Chandigarh" color={COLORS.teal} />

      <div style={{ position: 'absolute', left: 1040, top: 270, width: 780 }}>
        <div style={{ opacity: progress(frame, textAt - 4, textAt + 12) }}>
          <Kicker style={{ color: COLORS.teal }}>Step 1 · Detect</Kicker>
          <div style={{ fontSize: 74, fontWeight: 800, marginTop: 14, letterSpacing: '-0.02em', lineHeight: 1.1 }}>
            Every fire,
            <br />
            from space
          </div>
        </div>
        <div style={{ marginTop: 44, opacity: progress(frame, satAt, satAt + 14) }}>
          <div style={{ fontSize: 64, fontWeight: 800, color: COLORS.amber, fontVariantNumeric: 'tabular-nums' }}>
            {formatInt(FIRE_DAILY[PEAK_DAY])}
          </div>
          <div style={{ fontSize: 30, color: COLORS.muted, marginTop: 4 }}>fires detected on {dayLabel(PEAK_DAY)}</div>
        </div>
        <div style={{ marginTop: 36, fontSize: 30, fontWeight: 600, color: COLORS.text, opacity: progress(frame, timesAt, timesAt + 14) }}>
          NASA FIRMS · several passes a day
        </div>
      </div>
    </AbsoluteFill>
  );
};
