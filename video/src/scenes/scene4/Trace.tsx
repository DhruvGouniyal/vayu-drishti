// Scene 4.3 — Trace the smoke: trajectories curl from real fire clusters toward Chandigarh, with an hour counter.
// The fire clusters are the season's top districts (real FIRMS counts); the paths are illustrative.
import React, { useMemo } from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import { Kicker, progress } from '../../components/common';
import { CityMarker, DistrictMap } from '../../components/map';
import { CHANDIGARH, fitProjection, STATS } from '../../data';
import { COLORS } from '../../theme';
import { clipCue } from '../../timeline';

const BOUNDS = { west: 73.85, east: 77.6, south: 29.3, north: 32.55 };
// Which clusters' smoke reaches Chandigarh in this illustration.
const REACHES = new Set(['Patiala', 'Sangrur', 'Moga', 'Bathinda', 'Mansa']);

const pointOnCubic = (p: number[][], t: number): [number, number] => {
  const u = 1 - t;
  const x = u * u * u * p[0][0] + 3 * u * u * t * p[1][0] + 3 * u * t * t * p[2][0] + t * t * t * p[3][0];
  const y = u * u * u * p[0][1] + 3 * u * u * t * p[1][1] + 3 * u * t * t * p[2][1] + t * t * t * p[3][1];
  return [x, y];
};

export const Trace: React.FC = () => {
  const frame = useCurrentFrame();
  const proj = useMemo(() => fitProjection(BOUNDS, { x: 80, y: 130, w: 1140, h: 790 }), []);
  const [cx, cy] = proj(CHANDIGARH[0], CHANDIGARH[1]);
  const startAt = clipCue('s4_3_trace', 'follows', { fallback: 0.3 });
  const endAt = clipCue('s4_3_trace', 'when.', { edge: 'end', fallback: 0.95 });
  const whichAt = clipCue('s4_3_trace', 'which', { fallback: 0.7 });
  const t = progress(frame, startAt - 20, endAt - 6, (x) => x);
  const hours = Math.round(interpolate(t, [0, 1], [0, 24]));
  const shownHours = hours >= 24 ? 24 : hours >= 12 ? 12 : hours >= 6 ? 6 : 0;

  const tracks = useMemo(
    () =>
      STATS.topDistricts.map((d, i) => {
        const [sx, sy] = proj(d.centroid[0], d.centroid[1]);
        const reach = REACHES.has(d.district);
        const end: [number, number] = reach
          ? [cx, cy]
          : [sx + 240 + (i % 3) * 70, sy + 230 + (i % 2) * 70]; // carried south-east, away from the city
        const bend = (i % 2 ? 1 : -1) * (80 + (i % 3) * 40);
        const pts = [
          [sx, sy],
          [sx + (end[0] - sx) * 0.3, sy + bend + 60],
          [sx + (end[0] - sx) * 0.75, end[1] + bend * 0.6],
          end,
        ];
        return { ...d, sx, sy, reach, pts, count: d.count };
      }),
    [proj, cx, cy],
  );
  const maxCount = Math.max(...tracks.map((d) => d.count));
  const arrived = t > 0.97;

  return (
    <AbsoluteFill>
      <DistrictMap proj={proj} opacity={progress(frame, 0, 14) * 0.9} />
      <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0 }}>
        <defs>
          <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="10" />
          </filter>
        </defs>
        {/* fire clusters (real top districts, sized by detections) */}
        {tracks.map((d, i) => {
          const r = 14 + 26 * Math.sqrt(d.count / maxCount);
          const p = progress(frame, 4 + i * 3, 20 + i * 3);
          return (
            <g key={d.district} opacity={p}>
              <circle cx={d.sx} cy={d.sy} r={r * 1.8} fill={COLORS.orange} opacity={0.35} filter="url(#glow)" />
              <circle cx={d.sx} cy={d.sy} r={r * 0.6} fill={COLORS.amber} />
            </g>
          );
        })}
        {/* trajectories */}
        {tracks.map((d, i) => {
          const n = 60;
          const local = Math.min(1, Math.max(0, t * 1.15 - (i % 4) * 0.04));
          const pts = Array.from({ length: n }, (_, k) => pointOnCubic(d.pts, (k / (n - 1)) * local));
          const path = pts.map((p, k) => `${k ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join('');
          const head = pointOnCubic(d.pts, local);
          const fade = !d.reach ? 1 - 0.6 * progress(frame, whichAt, whichAt + 20) : 1;
          const color = d.reach ? COLORS.smoke : '#6B7587';
          return (
            <g key={`t-${d.district}`} opacity={local > 0 ? fade : 0}>
              <path d={path} fill="none" stroke={color} strokeWidth={d.reach ? 5 : 3.5} strokeLinecap="round" strokeDasharray={d.reach ? undefined : '10 10'} opacity={0.9} />
              {local < 1 && <circle cx={head[0]} cy={head[1]} r={9} fill={COLORS.text} />}
            </g>
          );
        })}
      </svg>
      <CityMarker x={cx} y={cy} label="Chandigarh" color={COLORS.teal} size={arrived ? 1.25 : 1} />

      {/* hour counter */}
      <div style={{ position: 'absolute', left: 1300, top: 250, width: 560 }}>
        <Kicker style={{ color: COLORS.teal, opacity: progress(frame, 0, 14) }}>Step 3 · Trace the smoke</Kicker>
        <div style={{ fontSize: 66, fontWeight: 800, marginTop: 14, letterSpacing: '-0.02em', lineHeight: 1.1, opacity: progress(frame, 0, 14) }}>
          Follow the air,
          <br />
          hour by hour
        </div>
        <div style={{ marginTop: 40, display: 'flex', gap: 16, opacity: progress(frame, startAt - 20, startAt - 6) }}>
          {[6, 12, 24].map((h) => (
            <div
              key={h}
              style={{
                fontSize: 40,
                fontWeight: 800,
                padding: '10px 22px',
                borderRadius: 14,
                fontVariantNumeric: 'tabular-nums',
                background: shownHours >= h ? COLORS.teal : 'transparent',
                color: shownHours >= h ? COLORS.bg : COLORS.dim,
                border: `3px solid ${shownHours >= h ? COLORS.teal : COLORS.dim}`,
              }}
            >
              +{h}h
            </div>
          ))}
        </div>
        <div style={{ marginTop: 38, opacity: progress(frame, whichAt, whichAt + 16) }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 30, fontWeight: 600 }}>
            <span style={{ width: 44, height: 5, background: COLORS.smoke, borderRadius: 3 }} /> Reaches Chandigarh
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 30, fontWeight: 600, color: COLORS.muted, marginTop: 12 }}>
            <span style={{ width: 44, height: 0, borderTop: '4px dashed #6B7587' }} /> Passes by
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
