// Scene 1 — Hook: hazy Chandigarh, AQI counter climbs 100 → 427 and turns red.
import React from 'react';
import { AbsoluteFill, interpolate, random, useCurrentFrame } from 'remotion';
import { Backdrop, Headline, Kicker, progress, SceneFade } from '../components/common';
import { aqiCategory, aqiColor, COLORS } from '../theme';
import { cue, sceneTiming } from '../timeline';

const T = sceneTiming(1);
const CLIP = 's1_hook';

/** A stylised (not geographic) Chandigarh: a tilted grid of sectors, a lake and a green belt. */
const CityGrid: React.FC<{ reveal: number }> = ({ reveal }) => {
  const cols = 13;
  const rows = 9;
  const w = 170;
  const h = 210;
  const gap = 30;
  const ox = 960 - (cols * (w + gap)) / 2;
  const oy = 540 - (rows * (h + gap)) / 2;
  return (
    <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0 }}>
      <g transform="rotate(-38 960 540) scale(1.05)" opacity={reveal}>
        {Array.from({ length: rows * cols }, (_, i) => {
          const c = i % cols;
          const r = Math.floor(i / cols);
          const green = c === 8 && r > 1; // Leisure Valley-style green belt
          return (
            <rect
              key={i}
              x={ox + c * (w + gap)}
              y={oy + r * (h + gap)}
              width={w}
              height={h}
              rx={10}
              fill={green ? '#13301F' : '#111B2F'}
              stroke={green ? '#1F4D33' : '#1D2A44'}
              strokeWidth={2}
              opacity={0.5 + 0.5 * random(`b${i}`)}
            />
          );
        })}
        {/* lake */}
        <ellipse cx={ox + 11.6 * (w + gap)} cy={oy + 0.6 * (h + gap)} rx={170} ry={95} fill="#0F2A3A" stroke="#1B4560" strokeWidth={3} />
      </g>
    </svg>
  );
};

/** Drifting smog blobs plus a brown-grey wash; `amount` 0 → 1. */
export const Haze: React.FC<{ amount: number }> = ({ amount }) => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill>
      <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0 }}>
        <defs>
          <filter id="hazeBlur" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="70" />
          </filter>
        </defs>
        <g filter="url(#hazeBlur)">
          {Array.from({ length: 14 }, (_, i) => {
            const x = (random(`hx${i}`) * 2400 - 240 + frame * (0.6 + random(`hv${i}`) * 0.8)) % 2300 - 190;
            const y = random(`hy${i}`) * 1080;
            const r = 220 + random(`hr${i}`) * 260;
            return <circle key={i} cx={x} cy={y} r={r} fill="#8E8A80" opacity={0.34 * amount} />;
          })}
        </g>
      </svg>
      <AbsoluteFill style={{ background: `rgba(96, 88, 76, ${0.42 * amount})` }} />
    </AbsoluteFill>
  );
};

export const Scene1Hook: React.FC = () => {
  const frame = useCurrentFrame();
  const climbFrom = cue(CLIP, 'Chandigarh,', { fallback: 0.2 });
  const climbTo = cue(CLIP, '427,', { edge: 'end', fallback: 0.6 });
  const aqi = Math.round(interpolate(progress(frame, climbFrom, climbTo), [0, 1], [100, 427]));
  const color = aqiColor(aqi);
  const haze = progress(frame, 0, climbTo + 20) * 0.75 + progress(frame, climbTo, T.frames) * 0.25;
  const worse = cue(CLIP, 'worse');
  const pulse = frame > climbTo ? 1 + 0.03 * Math.sin((frame - climbTo) / 4) * Math.exp(-(frame - climbTo) / 40) : 1;

  return (
    <SceneFade duration={T.frames} fadeIn={8}>
      <Backdrop grid={false} />
      <CityGrid reveal={progress(frame, 0, 30)} />
      <Haze amount={haze} />
      <AbsoluteFill style={{ background: 'radial-gradient(ellipse at 50% 42%, rgba(11,18,32,0.25) 0%, rgba(11,18,32,0.82) 70%)' }} />

      {/* small caption */}
      <div style={{ position: 'absolute', top: 90, width: '100%', textAlign: 'center', opacity: progress(frame, 6, 24) }}>
        <Kicker style={{ fontSize: 32, color: COLORS.text, opacity: 0.85 }}>November 2024 · Chandigarh</Kicker>
      </div>

      {/* AQI counter */}
      <div
        style={{
          position: 'absolute',
          top: 180,
          width: '100%',
          textAlign: 'center',
          opacity: progress(frame, climbFrom - 15, climbFrom + 5),
          transform: `scale(${pulse})`,
        }}
      >
        <div style={{ fontSize: 56, fontWeight: 700, color: COLORS.muted, letterSpacing: '0.2em' }}>AQI</div>
        <div
          style={{
            fontSize: 300,
            fontWeight: 800,
            lineHeight: 1,
            color,
            fontVariantNumeric: 'tabular-nums',
            letterSpacing: '-0.04em',
            textShadow: `0 0 80px ${color}66`,
          }}
        >
          {aqi}
        </div>
        <div
          style={{
            display: 'inline-block',
            marginTop: 14,
            padding: '8px 26px',
            borderRadius: 999,
            fontSize: 34,
            fontWeight: 700,
            color: COLORS.bg,
            background: color,
          }}
        >
          {aqiCategory(aqi)}
        </div>
      </div>

      <Headline at={worse - 4} y={705} size={74}>
        AQI 427 — <span style={{ color: COLORS.red }}>worse than Delhi</span>
      </Headline>
    </SceneFade>
  );
};
