// Scene 6 — Public infrastructure: open data → Vayu Drishti → open API → cities across the Indo-Gangetic plain.
import React, { useMemo } from 'react';
import { useCurrentFrame } from 'remotion';
import { Backdrop, Headline, progress, SceneFade } from '../components/common';
import { LogoMark } from '../components/Logo';
import { DISTRICTS, fitProjection, ringsToPath } from '../data';
import { COLORS } from '../theme';
import { cue, sceneTiming } from '../timeline';

const T = sceneTiming(6);
const CLIP = 's6_dpi';

// Approximate city centres along the Indo-Gangetic plain (lon, lat).
const CITIES: Array<[string, number, number]> = [
  ['Chandigarh', 76.78, 30.73],
  ['Amritsar', 74.87, 31.63],
  ['Ludhiana', 75.85, 30.9],
  ['Delhi', 77.21, 28.61],
  ['Agra', 78.01, 27.18],
  ['Lucknow', 80.95, 26.85],
  ['Kanpur', 80.33, 26.45],
  ['Prayagraj', 81.85, 25.44],
  ['Varanasi', 82.97, 25.32],
  ['Patna', 85.14, 25.59],
  ['Kolkata', 88.36, 22.57],
];
const LABELLED = new Set(['Chandigarh', 'Delhi', 'Lucknow', 'Patna', 'Kolkata']);

const Node: React.FC<{ x: number; y: number; w: number; label: string; sub?: string; color?: string; p: number; icon?: React.ReactNode }> = ({
  x,
  y,
  w,
  label,
  sub,
  color = COLORS.text,
  p,
  icon,
}) => (
  <div
    style={{
      position: 'absolute',
      left: x,
      top: y,
      width: w,
      padding: '18px 22px',
      borderRadius: 20,
      border: `2.5px solid ${color}`,
      background: '#0F182A',
      opacity: p,
      transform: `scale(${0.9 + 0.1 * p})`,
      display: 'flex',
      alignItems: 'center',
      gap: 16,
    }}
  >
    {icon}
    <div>
      <div style={{ fontSize: 32, fontWeight: 700, color }}>{label}</div>
      {sub && <div style={{ fontSize: 22, color: COLORS.muted, marginTop: 2 }}>{sub}</div>}
    </div>
  </div>
);

const Flow: React.FC<{ x1: number; y1: number; x2: number; y2: number; p: number; frame: number; color?: string }> = ({ x1, y1, x2, y2, p, frame, color = COLORS.dim }) => {
  const dots = [0, 0.33, 0.66].map((o) => ((frame / 40 + o) % 1) * p);
  return (
    <g>
      <line x1={x1} y1={y1} x2={x1 + (x2 - x1) * p} y2={y1 + (y2 - y1) * p} stroke={color} strokeWidth={3} strokeDasharray="8 8" />
      {p > 0.98 &&
        dots.map((t, i) => <circle key={i} cx={x1 + (x2 - x1) * t} cy={y1 + (y2 - y1) * t} r={6} fill={COLORS.teal} opacity={Math.sin(t * Math.PI)} />)}
    </g>
  );
};

export const Scene6Dpi: React.FC = () => {
  const frame = useCurrentFrame();
  const sourcesAt = cue(CLIP, 'free,', { fallback: 0.1 });
  const apiAt = cue(CLIP, 'API.', { fallback: 0.4 });
  const citiesAt = cue(CLIP, 'ready', { fallback: 0.7 });
  const builtAt = cue(CLIP, 'Built', { fallback: 0.6 });

  const proj = useMemo(() => fitProjection({ west: 73.5, east: 89, south: 22, north: 32.6 }, { x: 1260, y: 250, w: 600, h: 620 }), []);
  const statePaths = useMemo(() => DISTRICTS.map((d) => ringsToPath(d.rings, proj)), [proj]);
  const band = CITIES.filter(([n]) => n !== 'Amritsar' && n !== 'Ludhiana')
    .map(([, lon, lat]) => proj(lon, lat))
    .sort((a, b) => a[0] - b[0]);
  const bandPath = band.map(([x, y], i) => `${i ? 'L' : 'M'}${x},${y}`).join('');

  const src = [
    { label: 'Satellites', sub: 'NASA FIRMS · Sentinel-2', y: 300 },
    { label: 'Weather', sub: 'Open-Meteo forecasts', y: 470 },
    { label: 'CPCB stations', sub: 'air-quality monitors', y: 640 },
  ];
  const srcP = (i: number) => progress(frame, sourcesAt + i * 6, sourcesAt + i * 6 + 14);
  const coreP = progress(frame, sourcesAt + 20, sourcesAt + 36);
  const apiP = progress(frame, apiAt - 10, apiAt + 6);

  return (
    <SceneFade duration={T.frames}>
      <Backdrop />
      <Headline at={2} y={70} size={72}>
        Open data. Open API. <span style={{ color: COLORS.teal }}>Any city.</span>
      </Headline>

      <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0 }}>
        {src.map((s, i) => (
          <Flow key={s.label} x1={430} y1={s.y + 44} x2={540} y2={514} p={progress(frame, sourcesAt + 16 + i * 4, sourcesAt + 34 + i * 4)} frame={frame} />
        ))}
        <Flow x1={870} y1={514} x2={930} y2={514} p={apiP} frame={frame} color={COLORS.teal} />
        <Flow x1={1180} y1={514} x2={1240} y2={514} p={progress(frame, citiesAt - 16, citiesAt)} frame={frame} color={COLORS.teal} />

        {/* Indo-Gangetic plain */}
        <g opacity={progress(frame, builtAt - 10, builtAt + 10)}>
          <path d={bandPath} fill="none" stroke="#1E3550" strokeWidth={56} strokeLinecap="round" strokeLinejoin="round" opacity={0.55} />
          {statePaths.map((d, i) => (
            <path key={i} d={d} fill="#15213A" stroke="#33466A" strokeWidth={0.8} />
          ))}
          <text x={proj(82.5, 23.3)[0]} y={proj(82.5, 23.3)[1]} textAnchor="middle" fontSize={22} fontWeight={700} letterSpacing="0.2em" fill="#4F6489">
            INDO-GANGETIC PLAIN
          </text>
        </g>
        {CITIES.map(([name, lon, lat], i) => {
          const [x, y] = proj(lon, lat);
          const first = name === 'Chandigarh';
          const p = first ? progress(frame, builtAt, builtAt + 10) : progress(frame, citiesAt + i * 4, citiesAt + i * 4 + 12);
          const c = first ? COLORS.teal : COLORS.yellow;
          return (
            <g key={name} opacity={p}>
              <circle cx={x} cy={y} r={22 * p} fill={c} opacity={0.25} />
              <circle cx={x} cy={y} r={8} fill={c} />
              {LABELLED.has(name) && (
                <text
                  x={x + (name === 'Kolkata' ? -16 : 16)}
                  y={y + (name === 'Chandigarh' ? -16 : 30)}
                  textAnchor={name === 'Kolkata' ? 'end' : 'start'}
                  fontSize={22}
                  fontWeight={700}
                  fill={c}
                  stroke={COLORS.bg}
                  strokeWidth={5}
                  paintOrder="stroke"
                >
                  {name}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {src.map((s, i) => (
        <Node key={s.label} x={90} y={s.y} w={340} label={s.label} sub={s.sub} p={srcP(i)} />
      ))}
      <Node x={540} y={460} w={330} label="Vayu Drishti" color={COLORS.teal} p={coreP} icon={<LogoMark size={46} />} />
      <Node x={930} y={460} w={250} label="Open API" sub="forecasts as JSON" color={COLORS.teal} p={apiP} />
    </SceneFade>
  );
};
