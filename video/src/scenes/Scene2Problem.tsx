// Scene 2 — The problem: a real season of FIRMS fires, smoke drifting east, stations that only know "now".
import React, { useMemo } from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import { Backdrop, Card, formatInt, Headline, Kicker, progress, SceneFade } from '../components/common';
import { CityMarker, DistrictMap, FireLayer, SmokeDrift, StateLabels } from '../components/map';
import { CHANDIGARH, dayLabel, FIRE_DAYS, FIRE_SEASON, firesUpToDay, fitProjection, PB_HR_BOUNDS, STATS } from '../data';
import { COLORS } from '../theme';
import { cue, sceneTiming } from '../timeline';

const T = sceneTiming(2);
const CLIP = 's2_problem';

const StationRow: React.FC<{ name: string; at: number }> = ({ name, at }) => {
  const frame = useCurrentFrame();
  const p = progress(frame, at, at + 16);
  const q = progress(frame, at + 14, at + 30);
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 26,
        padding: '22px 30px',
        opacity: p,
        transform: `translateX(${(1 - p) * 40}px)`,
      }}
    >
      <svg width={34} height={44} viewBox="0 0 34 44">
        <path d="M17 43 C17 43 2 25 2 16 A15 15 0 0 1 32 16 C32 25 17 43 17 43Z" fill={COLORS.text} />
        <circle cx={17} cy={16} r={6} fill={COLORS.bg} />
      </svg>
      <div style={{ flex: 1, fontSize: 38, fontWeight: 700 }}>{name}</div>
      <div
        style={{
          fontSize: 28,
          fontWeight: 800,
          letterSpacing: '0.1em',
          padding: '10px 22px',
          borderRadius: 14,
          background: COLORS.amber,
          color: COLORS.bg,
        }}
      >
        NOW
      </div>
      <div
        style={{
          fontSize: 28,
          fontWeight: 700,
          letterSpacing: '0.1em',
          padding: '8px 20px',
          borderRadius: 14,
          border: `2.5px dashed ${COLORS.dim}`,
          color: COLORS.dim,
          opacity: q,
        }}
      >
        TOMORROW?
      </div>
    </div>
  );
};

export const Scene2Problem: React.FC = () => {
  const frame = useCurrentFrame();
  const proj = useMemo(() => fitProjection(PB_HR_BOUNDS, { x: 90, y: 40, w: 800, h: 880 }), []);
  const [cx, cy] = proj(CHANDIGARH[0], CHANDIGARH[1]);

  const firesStart = 12;
  const firesEnd = cue(CLIP, 'city.', { edge: 'end', fallback: 0.42 });
  const day = interpolate(frame, [firesStart, firesEnd], [0, FIRE_DAYS - 0.01], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const smokeOn = cue(CLIP, 'wind', { fallback: 0.25 });
  const stationsAt = cue(CLIP, 'Our', { fallback: 0.45 });
  const butAt = cue(CLIP, 'But', { fallback: 0.68 });
  const whereAt = cue(CLIP, 'where', { fallback: 0.85 });

  const counterOut = progress(frame, stationsAt - 10, stationsAt + 5);
  const names = STATS.stations.map((s) => s.name.split(',')[0]);

  return (
    <SceneFade duration={T.frames}>
      <Backdrop />
      <DistrictMap proj={proj} opacity={progress(frame, 0, 18)} />
      <StateLabels proj={proj} opacity={0.8 * progress(frame, 0, 18)} />
      <FireLayer proj={proj} day={day} />
      <SmokeDrift proj={proj} target={CHANDIGARH} intensity={progress(frame, smokeOn - 10, smokeOn + 50)} buildup={progress(frame, smokeOn + 30, T.frames)} />
      <CityMarker x={cx} y={cy} label="Chandigarh" labelSide="right" />

      {/* "where from?" over the smoke path */}
      <div
        style={{
          position: 'absolute',
          left: cx - 330,
          top: cy + 120,
          fontSize: 34,
          fontWeight: 700,
          color: COLORS.smoke,
          opacity: progress(frame, whereAt, whereAt + 14),
        }}
      >
        Coming from where?
      </div>

      {/* date + live fire counter (real FIRMS data) */}
      <div style={{ position: 'absolute', left: 1040, top: 330, opacity: progress(frame, 6, 22) * (1 - counterOut) }}>
        <Kicker>Stubble-burning season {FIRE_SEASON}</Kicker>
        <div style={{ fontSize: 96, fontWeight: 800, marginTop: 10, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.03em' }}>
          {dayLabel(day)}
        </div>
        <div style={{ fontSize: 44, fontWeight: 600, color: COLORS.amber, marginTop: 16, fontVariantNumeric: 'tabular-nums' }}>
          {formatInt(firesUpToDay(day))} fires detected
        </div>
        <div style={{ fontSize: 26, color: COLORS.muted, marginTop: 14 }}>NASA FIRMS (VIIRS) · Punjab + Haryana</div>
      </div>

      {/* stations: they only know "now" */}
      <AbsoluteFill style={{ opacity: progress(frame, stationsAt - 4, stationsAt + 10) }}>
        <Card style={{ position: 'absolute', left: 1000, top: 400, width: 840, padding: '20px 0' }}>
          <Kicker style={{ padding: '10px 30px 4px' }}>Chandigarh monitoring stations</Kicker>
          {names.map((n, i) => (
            <StationRow key={n} name={n} at={stationsAt + i * 8} />
          ))}
        </Card>
      </AbsoluteFill>

      <Headline at={butAt} x={1000} y={210} width={840} size={64} align="left">
        We see the air today.
        <br />
        <span style={{ color: COLORS.muted }}>Not tomorrow.</span>
      </Headline>
    </SceneFade>
  );
};
