// Scene 3 — The hidden problem: falling satellite counts (real FIRMS totals), then a fire lit between passes.
import React from 'react';
import { AbsoluteFill, interpolate, random, useCurrentFrame } from 'remotion';
import { Backdrop, formatInt, Headline, Kicker, NotEqual, progress, SceneFade } from '../components/common';
import { STATS } from '../data';
import { COLORS } from '../theme';
import { cue, sceneTiming } from '../timeline';

const T = sceneTiming(3);
const CLIP = 's3_hidden';

const BarChart: React.FC<{ at: number; opacity: number }> = ({ at, opacity }) => {
  const frame = useCurrentFrame();
  const data = STATS.detectionsPerSeason;
  const max = Math.max(...data.map((d) => d.count));
  const H = 430;
  const barW = 210;
  const gap = 120;
  const total = data.length * barW + (data.length - 1) * gap;
  const x0 = 960 - total / 2;
  const base = 790;
  return (
    <AbsoluteFill style={{ opacity }}>
      <div style={{ position: 'absolute', top: 175, width: '100%', textAlign: 'center' }}>
        <Kicker>Satellite fire detections per season</Kicker>
      </div>
      {data.map((d, i) => {
        const p = progress(frame, at + i * 14, at + i * 14 + 26);
        const h = (d.count / max) * H * p;
        return (
          <div key={d.year}>
            <div
              style={{
                position: 'absolute',
                left: x0 + i * (barW + gap),
                top: base - h,
                width: barW,
                height: h,
                borderRadius: '14px 14px 4px 4px',
                background: `linear-gradient(180deg, ${COLORS.amber}, ${COLORS.orange})`,
                opacity: 1 - i * 0.18,
              }}
            />
            <div
              style={{
                position: 'absolute',
                left: x0 + i * (barW + gap) - 40,
                width: barW + 80,
                top: base - h - 66,
                textAlign: 'center',
                fontSize: 46,
                fontWeight: 800,
                fontVariantNumeric: 'tabular-nums',
                opacity: p,
              }}
            >
              {formatInt(d.count * p)}
            </div>
            <div
              style={{
                position: 'absolute',
                left: x0 + i * (barW + gap),
                width: barW,
                top: base + 16,
                textAlign: 'center',
                fontSize: 40,
                fontWeight: 600,
                color: COLORS.muted,
              }}
            >
              {d.year}
            </div>
          </div>
        );
      })}
      <div style={{ position: 'absolute', top: 878, width: '100%', textAlign: 'center', fontSize: 24, color: COLORS.dim }}>
        NASA FIRMS VIIRS, 1 Oct – 30 Nov, Punjab–Haryana study area
      </div>
    </AbsoluteFill>
  );
};

const Flame: React.FC<{ x: number; y: number; s: number; seed: number }> = ({ x, y, s, seed }) => {
  const frame = useCurrentFrame();
  const f = 1 + 0.12 * Math.sin(frame / 2.3 + seed) + 0.08 * Math.sin(frame / 1.3 + seed * 2);
  return (
    <g transform={`translate(${x} ${y}) scale(${s} ${s * f})`}>
      <path d="M0 0 C-26 -10 -30 -46 -6 -86 C-4 -60 14 -56 10 -32 C22 -44 24 -60 20 -72 C40 -46 34 -8 0 0Z" fill={COLORS.orange} />
      <path d="M0 0 C-14 -6 -16 -30 -2 -52 C0 -36 10 -34 8 -20 C16 -28 16 -36 14 -44 C24 -26 18 -4 0 0Z" fill={COLORS.yellow} />
    </g>
  );
};

const FieldScene: React.FC<{ from: number; opacity: number; smokeAt: number }> = ({ from, opacity, smokeAt }) => {
  const frame = useCurrentFrame();
  const f = frame - from;
  const passEnd = 78;
  const satP = interpolate(f, [0, passEnd], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const satX = -120 + satP * 2160;
  const satY = 300 - Math.sin(satP * Math.PI) * 60;
  const beam = f > 0 && f < passEnd ? 1 : 0;
  const igniteAt = passEnd + 14;
  const fireP = progress(f, igniteAt, igniteAt + 22);
  const fireX = 1180;
  const fireY = 760;
  const smoke = progress(f, igniteAt + 10, igniteAt + 60) * (0.7 + 0.3 * progress(frame, smokeAt, smokeAt + 30));

  // Perspective strips of farmland
  const strips = Array.from({ length: 9 }, (_, i) => i);
  return (
    <AbsoluteFill style={{ opacity }}>
      <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0 }}>
        <defs>
          <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#0B1220" />
            <stop offset="1" stopColor="#16223A" />
          </linearGradient>
          <filter id="plumeBlur" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="14" />
          </filter>
        </defs>
        <rect x={0} y={0} width={1920} height={600} fill="url(#sky)" />
        {/* fields */}
        {strips.map((i) => {
          const y1 = 600 + i * 34 + i * i * 2;
          const y2 = 600 + (i + 1) * 34 + (i + 1) * (i + 1) * 2;
          return (
            <polygon
              key={i}
              points={`0,${y1} 1920,${y1} 1920,${y2} 0,${y2}`}
              fill={i % 2 ? '#A88A3A' : '#8C7430'}
              opacity={0.55}
            />
          );
        })}
        {/* field boundaries (vanishing lines) */}
        {Array.from({ length: 11 }, (_, i) => (
          <line key={i} x1={960 + (i - 5) * 60} y1={600} x2={960 + (i - 5) * 420} y2={1080} stroke="#5E4E22" strokeWidth={2} opacity={0.6} />
        ))}
        {/* scan beam */}
        <polygon
          points={`${satX},${satY + 30} ${satX - 260},900 ${satX + 260},900`}
          fill={COLORS.text}
          opacity={0.07 * beam}
        />
        {/* satellite */}
        <g transform={`translate(${satX} ${satY})`} opacity={satP < 1 ? 1 : 0}>
          <rect x={-70} y={-12} width={50} height={24} fill="#3D6FA8" stroke="#8DB3E0" strokeWidth={2} />
          <rect x={20} y={-12} width={50} height={24} fill="#3D6FA8" stroke="#8DB3E0" strokeWidth={2} />
          <rect x={-18} y={-22} width={36} height={44} rx={6} fill="#D7DEE8" />
          <circle cx={0} cy={26} r={6} fill="#D7DEE8" />
        </g>
        {/* the fire lit after the pass */}
        <g opacity={fireP}>
          <ellipse cx={fireX} cy={fireY + 6} rx={150 * fireP} ry={22 * fireP} fill={COLORS.scar} opacity={0.9} />
          <circle cx={fireX} cy={fireY - 30} r={90} fill={COLORS.orange} opacity={0.18} filter="url(#plumeBlur)" />
          {[-60, -20, 25, 65].map((dx, i) => (
            <Flame key={i} x={fireX + dx} y={fireY + 4} s={(0.6 + random(`fl${i}`) * 0.5) * fireP} seed={i * 1.7} />
          ))}
        </g>
        {/* plume drifting right */}
        <g filter="url(#plumeBlur)" opacity={smoke}>
          {Array.from({ length: 12 }, (_, i) => {
            const t = ((f * 0.9 + i * 22) % 260) / 260;
            return (
              <circle
                key={i}
                cx={fireX + t * 520 + Math.sin(t * 6 + i) * 20}
                cy={fireY - 80 - t * 380}
                r={30 + t * 90}
                fill={COLORS.smoke}
                opacity={0.35 * (1 - t)}
              />
            );
          })}
        </g>
      </svg>
      {/* labels */}
      <div
        style={{
          position: 'absolute',
          left: 160,
          top: 400,
          fontSize: 32,
          fontWeight: 600,
          color: COLORS.text,
          opacity: progress(f, 8, 22) * (1 - progress(f, passEnd + 30, passEnd + 45)),
        }}
      >
        Satellite pass · 1:30 PM
        <div style={{ fontSize: 28, color: COLORS.green, marginTop: 6 }}>0 fires seen</div>
      </div>
      <div
        style={{
          position: 'absolute',
          left: fireX + 170,
          top: fireY - 140,
          fontSize: 34,
          fontWeight: 700,
          color: COLORS.amber,
          opacity: progress(f, igniteAt + 16, igniteAt + 30),
        }}
      >
        Lit at 4 PM
        <div style={{ fontSize: 30, color: COLORS.red, marginTop: 4 }}>Not counted</div>
      </div>
      <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0, opacity: progress(f, igniteAt + 16, igniteAt + 30) }}>
        <circle cx={fireX} cy={fireY - 30} r={150} fill="none" stroke={COLORS.red} strokeWidth={4} strokeDasharray="14 12" />
      </svg>
    </AbsoluteFill>
  );
};

export const Scene3Hidden: React.FC = () => {
  const frame = useCurrentFrame();
  const barsAt = cue(CLIP, 'Satellite', { fallback: 0.15 });
  const butAt = cue(CLIP, 'But', { fallback: 0.45 });
  const missAt = cue(CLIP, 'miss', { fallback: 0.7 });
  const smokeAt = cue(CLIP, 'smoke', { fallback: 0.85 });
  const chartOut = progress(frame, butAt - 6, butAt + 10);

  return (
    <SceneFade duration={T.frames}>
      <Backdrop />
      <BarChart at={barsAt} opacity={progress(frame, 0, 14) * (1 - chartOut)} />
      <FieldScene from={butAt} opacity={progress(frame, butAt - 4, butAt + 12)} smokeAt={smokeAt} />
      <Headline at={missAt} y={80} size={78}>
        Fewer fires counted <NotEqual /> <span style={{ color: COLORS.amber }}>fewer fires</span>
      </Headline>
    </SceneFade>
  );
};
