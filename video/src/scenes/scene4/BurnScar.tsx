// Scene 4.2 — Catch the hidden fires: before/after slider over stylised farmland, then a segmentation mask.
import React, { useMemo } from 'react';
import { AbsoluteFill, random, useCurrentFrame } from 'remotion';
import { Kicker, progress } from '../../components/common';
import { COLORS } from '../../theme';
import { clipCue } from '../../timeline';

const IMG = { x: 110, y: 170, w: 1060, h: 680 };
const COLS = 7;
const ROWS = 5;

type Field = { pts: [number, number][]; color: string; burnt: boolean; angle: number };

/** A patchwork of fields with slightly jittered corners, so it reads like a satellite tile. */
const makeFields = (): Field[] => {
  const cw = IMG.w / COLS;
  const ch = IMG.h / ROWS;
  const corner = (c: number, r: number): [number, number] => {
    const edge = c === 0 || r === 0 || c === COLS || r === ROWS;
    const jx = edge ? 0 : (random(`cx${c}-${r}`) - 0.5) * cw * 0.35;
    const jy = edge ? 0 : (random(`cy${c}-${r}`) - 0.5) * ch * 0.35;
    return [IMG.x + c * cw + jx, IMG.y + r * ch + jy];
  };
  const palette = ['#7C9A3C', '#A99A45', '#C2A64C', '#8FA548', '#B89B3E', '#6E8E37'];
  // Burnt plots: a loose cluster, like a few farms burning the same afternoon.
  const burnt = new Set(['2-1', '3-1', '3-2', '4-2', '2-3', '5-3', '4-3', '1-2', '5-1']);
  const fields: Field[] = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      fields.push({
        pts: [corner(c, r), corner(c + 1, r), corner(c + 1, r + 1), corner(c, r + 1)],
        color: palette[Math.floor(random(`p${c}-${r}`) * palette.length)],
        burnt: burnt.has(`${c}-${r}`),
        angle: random(`a${c}-${r}`) > 0.5 ? 0 : 90,
      });
    }
  }
  return fields;
};

const inset = (pts: [number, number][], k: number): [number, number][] => {
  const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length;
  const cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  return pts.map(([x, y]) => [cx + (x - cx) * k, cy + (y - cy) * k]);
};
const toPoints = (pts: [number, number][]) => pts.map((p) => p.join(',')).join(' ');

const Tile: React.FC<{ fields: Field[]; after: boolean }> = ({ fields, after }) => (
  <g>
    <rect x={IMG.x} y={IMG.y} width={IMG.w} height={IMG.h} fill="#5A6B2E" />
    {fields.map((f, i) => {
      const scar = after && f.burnt;
      return (
        <g key={i}>
          <polygon points={toPoints(f.pts)} fill={scar ? COLORS.scar : f.color} stroke="#3F4A22" strokeWidth={3} />
          <polygon points={toPoints(f.pts)} fill={scar ? 'url(#ash)' : f.angle ? 'url(#rowsV)' : 'url(#rowsH)'} />
        </g>
      );
    })}
  </g>
);

export const BurnScar: React.FC = () => {
  const frame = useCurrentFrame();
  const fields = useMemo(makeFields, []);
  const textAt = clipCue('s4_2_burnscar', 'deep-learning', { fallback: 0.1 });
  const scanAt = clipCue('s4_2_burnscar', 'scans', { fallback: 0.25 });
  const maskAt = clipCue('s4_2_burnscar', 'freshly', { fallback: 0.5 });
  const catchAt = clipCue('s4_2_burnscar', 'catching', { fallback: 0.7 });

  const slide = progress(frame, scanAt, maskAt + 6);
  const sliderX = IMG.x + IMG.w * slide;
  const mask = progress(frame, maskAt + 4, maskAt + 34);

  return (
    <AbsoluteFill>
      <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0, opacity: progress(frame, 0, 14) }}>
        <defs>
          <pattern id="rowsH" width="12" height="12" patternUnits="userSpaceOnUse">
            <line x1="0" y1="6" x2="12" y2="6" stroke="#000" strokeOpacity="0.14" strokeWidth="3" />
          </pattern>
          <pattern id="rowsV" width="12" height="12" patternUnits="userSpaceOnUse">
            <line x1="6" y1="0" x2="6" y2="12" stroke="#000" strokeOpacity="0.14" strokeWidth="3" />
          </pattern>
          <pattern id="ash" width="18" height="18" patternUnits="userSpaceOnUse">
            <circle cx="4" cy="5" r="2" fill="#3A302A" />
            <circle cx="13" cy="12" r="2.5" fill="#2A221E" />
          </pattern>
          <clipPath id="afterClip">
            <rect x={IMG.x} y={IMG.y} width={sliderX - IMG.x} height={IMG.h} />
          </clipPath>
          <clipPath id="imgClip">
            <rect x={IMG.x} y={IMG.y} width={IMG.w} height={IMG.h} rx={18} />
          </clipPath>
        </defs>
        <g clipPath="url(#imgClip)">
          <Tile fields={fields} after={false} />
          <g clipPath="url(#afterClip)">
            <Tile fields={fields} after />
          </g>
          {/* segmentation mask */}
          {fields
            .filter((f) => f.burnt)
            .map((f, i) => {
              const pts = inset(f.pts, 0.9);
              const per = 900;
              const p = progress(frame, maskAt + 4 + i * 3, maskAt + 30 + i * 3);
              return (
                <polygon
                  key={i}
                  points={toPoints(pts)}
                  fill={COLORS.teal}
                  fillOpacity={0.22 * p}
                  stroke={COLORS.teal}
                  strokeWidth={5}
                  strokeLinejoin="round"
                  strokeDasharray={per}
                  strokeDashoffset={per * (1 - p)}
                />
              );
            })}
        </g>
        <rect x={IMG.x} y={IMG.y} width={IMG.w} height={IMG.h} rx={18} fill="none" stroke={COLORS.panelEdge} strokeWidth={3} />
        {/* slider */}
        {slide > 0 && slide < 1 && (
          <g>
            <line x1={sliderX} y1={IMG.y - 10} x2={sliderX} y2={IMG.y + IMG.h + 10} stroke={COLORS.text} strokeWidth={5} />
            <circle cx={sliderX} cy={IMG.y + IMG.h / 2} r={24} fill={COLORS.text} />
            <path
              d={`M${sliderX - 9} ${IMG.y + IMG.h / 2 - 8} l-8 8 l8 8 M${sliderX + 9} ${IMG.y + IMG.h / 2 - 8} l8 8 l-8 8`}
              stroke={COLORS.bg}
              strokeWidth={4}
              fill="none"
            />
          </g>
        )}
      </svg>
      {/* before / after labels */}
      <div style={{ position: 'absolute', left: IMG.x + 20, top: IMG.y + 20, ...tag, opacity: slide > 0.02 ? 1 : 0 }}>After</div>
      <div style={{ position: 'absolute', left: IMG.x + IMG.w - 140, top: IMG.y + 20, ...tag, opacity: slide < 0.9 ? 1 : 0 }}>Before</div>
      <div
        style={{
          position: 'absolute',
          left: IMG.x,
          top: IMG.y + IMG.h + 18,
          fontSize: 26,
          color: COLORS.muted,
          opacity: progress(frame, 0, 14),
        }}
      >
        Stylised Sentinel-2 tile · 10 m pixels
      </div>

      <div style={{ position: 'absolute', left: 1260, top: 280, width: 580 }}>
        <div style={{ opacity: progress(frame, 0, 14) }}>
          <Kicker style={{ color: COLORS.teal }}>Step 2 · Hidden fires</Kicker>
          <div style={{ fontSize: 66, fontWeight: 800, marginTop: 14, letterSpacing: '-0.02em', lineHeight: 1.1 }}>
            Burnt fields
            <br />
            can't hide
          </div>
        </div>
        <div style={{ marginTop: 40, fontSize: 32, color: COLORS.text, opacity: progress(frame, textAt, textAt + 14) }}>
          Deep learning maps fresh burn scars
        </div>
        <div style={{ marginTop: 26, display: 'flex', alignItems: 'center', gap: 16, opacity: progress(frame, catchAt, catchAt + 14) }}>
          <div style={{ width: 34, height: 34, borderRadius: 8, background: `${COLORS.teal}40`, border: `4px solid ${COLORS.teal}` }} />
          <div style={{ fontSize: 32, fontWeight: 700, color: COLORS.teal }}>Fires the satellites missed</div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

const tag: React.CSSProperties = {
  fontSize: 24,
  fontWeight: 700,
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  color: COLORS.text,
  background: 'rgba(5,9,18,0.7)',
  padding: '6px 14px',
  borderRadius: 8,
};
