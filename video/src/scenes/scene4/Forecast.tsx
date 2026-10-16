// Scene 4.4 — Forecast + attribution.
// Uses PLACEHOLDER numbers from src/results.ts (FORECAST_CHART, ATTRIBUTION) until Phase 2 results are in.
import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import { Card, Kicker, PlaceholderBadge, progress } from '../../components/common';
import { ATTRIBUTION, FORECAST_CHART, SHOW_PLACEHOLDER_BADGE } from '../../results';
import { aqiColor, COLORS } from '../../theme';
import { clipCue } from '../../timeline';

const PLOT = { x: 210, y: 300, w: 840, h: 470 };
const H_MAX = FORECAST_CHART.hours[FORECAST_CHART.hours.length - 1];
const AQI_MAX = 500;
const px = (h: number) => PLOT.x + (h / H_MAX) * PLOT.w;
const py = (aqi: number) => PLOT.y + PLOT.h - (Math.min(aqi, AQI_MAX) / AQI_MAX) * PLOT.h;

/** Polyline of a series up to hour `upTo`, interpolating the last segment. */
const seriesPath = (values: number[], upTo: number): string => {
  const pts: string[] = [];
  FORECAST_CHART.hours.forEach((h, i) => {
    if (h <= upTo) pts.push(`${px(h).toFixed(1)},${py(values[i]).toFixed(1)}`);
    else if (i > 0 && FORECAST_CHART.hours[i - 1] < upTo) {
      const h0 = FORECAST_CHART.hours[i - 1];
      const v = values[i - 1] + ((values[i] - values[i - 1]) * (upTo - h0)) / (h - h0);
      pts.push(`${px(upTo).toFixed(1)},${py(v).toFixed(1)}`);
    }
  });
  return pts.length > 1 ? `M${pts.join('L')}` : '';
};

const Donut: React.FC<{ at: number; frame: number }> = ({ at, frame }) => {
  const R = 150;
  const W = 58;
  const C = 2 * Math.PI * R;
  let acc = 0;
  return (
    <svg width={400} height={400} viewBox="-200 -200 400 400">
      <circle r={R} fill="none" stroke="#1C2840" strokeWidth={W} />
      {ATTRIBUTION.map((s, i) => {
        const p = progress(frame, at + i * 8, at + i * 8 + 22);
        const len = (s.share / 100) * C * p;
        const seg = (
          <circle
            key={s.label}
            r={R}
            fill="none"
            stroke={s.color}
            strokeWidth={W}
            strokeDasharray={`${Math.max(0, len - 4)} ${C}`}
            strokeDashoffset={-acc}
            transform="rotate(-90)"
          />
        );
        acc += (s.share / 100) * C;
        return seg;
      })}
      <text y={-6} textAnchor="middle" fontSize={30} fontWeight={700} fill={COLORS.text}>
        Tomorrow
      </text>
      <text y={34} textAnchor="middle" fontSize={24} fill={COLORS.muted}>
        Sector 22
      </text>
    </svg>
  );
};

export const Forecast: React.FC = () => {
  const frame = useCurrentFrame();
  const chartAt = clipCue('s4_4_forecast', 'forecasts', { fallback: 0.15 });
  const donutAt = clipCue('s4_4_forecast', 'estimates', { fallback: 0.55 });
  const hNow = interpolate(frame, [chartAt - 6, donutAt + 30], [0, H_MAX - FORECAST_CHART.leadHours], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const hFc = Math.min(H_MAX, hNow + FORECAST_CHART.leadHours);
  const bracket = progress(frame, chartAt + 6, chartAt + 20);

  return (
    <AbsoluteFill>
      {/* line chart */}
      <Card style={{ position: 'absolute', left: 70, top: 130, width: 1060, height: 780, opacity: progress(frame, 0, 14) }}>
        <div style={{ position: 'absolute', left: 40, top: 30 }}>
          <Kicker style={{ color: COLORS.teal }}>Step 4 · Forecast</Kicker>
          <div style={{ fontSize: 40, fontWeight: 800, marginTop: 8 }}>48 hours ahead, every station</div>
        </div>
      </Card>
      <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0, opacity: progress(frame, 0, 14) }}>
        {/* AQI bands */}
        {[
          [0, 100],
          [100, 200],
          [200, 300],
          [300, 400],
          [400, 500],
        ].map(([a, b]) => (
          <rect key={a} x={PLOT.x} y={py(b)} width={PLOT.w} height={py(a) - py(b)} fill={aqiColor(b)} opacity={0.07} />
        ))}
        {[0, 100, 200, 300, 400, 500].map((v) => (
          <g key={v}>
            <line x1={PLOT.x} x2={PLOT.x + PLOT.w} y1={py(v)} y2={py(v)} stroke="#24324C" strokeWidth={1.5} />
            <text x={PLOT.x - 16} y={py(v) + 8} textAnchor="end" fontSize={22} fill={COLORS.muted}>
              {v}
            </text>
          </g>
        ))}
        {Array.from({ length: 7 }, (_, d) => (
          <text key={d} x={px(d * 24)} y={PLOT.y + PLOT.h + 36} textAnchor="middle" fontSize={22} fill={COLORS.muted}>
            {d === 0 ? 'Day 1' : `${d + 1}`}
          </text>
        ))}
        <text x={PLOT.x - 16} y={PLOT.y - 22} textAnchor="end" fontSize={22} fontWeight={700} fill={COLORS.muted}>
          AQI
        </text>
        {/* forecast runs ahead of reality */}
        <path d={seriesPath(FORECAST_CHART.forecast, hFc)} fill="none" stroke={COLORS.teal} strokeWidth={6} strokeDasharray="14 9" strokeLinecap="round" />
        <path d={seriesPath(FORECAST_CHART.actual, hNow)} fill="none" stroke={COLORS.text} strokeWidth={6} strokeLinejoin="round" strokeLinecap="round" />
        {/* "now" cursor */}
        <line x1={px(hNow)} x2={px(hNow)} y1={PLOT.y} y2={PLOT.y + PLOT.h} stroke={COLORS.text} strokeWidth={2} opacity={0.5} />
        <text x={px(hNow)} y={PLOT.y - 14} textAnchor="middle" fontSize={22} fontWeight={700} fill={COLORS.text} opacity={bracket}>
          now
        </text>
        {/* 48 h bracket */}
        <g opacity={bracket}>
          <line x1={px(hNow) + 6} x2={px(hFc) - 6} y1={PLOT.y + 34} y2={PLOT.y + 34} stroke={COLORS.teal} strokeWidth={3} />
          <path d={`M${px(hFc) - 16},${PLOT.y + 24} L${px(hFc) - 4},${PLOT.y + 34} L${px(hFc) - 16},${PLOT.y + 44}`} fill="none" stroke={COLORS.teal} strokeWidth={3} />
          <text x={(px(hNow) + px(hFc)) / 2} y={PLOT.y + 22} textAnchor="middle" fontSize={24} fontWeight={800} fill={COLORS.teal}>
            +48 h
          </text>
        </g>
      </svg>
      {/* legend */}
      <div style={{ position: 'absolute', left: 230, top: 840, display: 'flex', gap: 40, fontSize: 26, fontWeight: 600, opacity: progress(frame, chartAt, chartAt + 14) }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ width: 40, height: 6, background: COLORS.text, borderRadius: 3 }} /> Measured
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 12, color: COLORS.teal }}>
          <span style={{ width: 40, height: 0, borderTop: `6px dashed ${COLORS.teal}` }} /> Forecast
        </span>
        <span style={{ color: COLORS.muted }}>{FORECAST_CHART.station}</span>
      </div>

      {/* attribution donut */}
      <div style={{ position: 'absolute', left: 1200, top: 130, width: 660, opacity: progress(frame, donutAt - 4, donutAt + 12) }}>
        <Kicker>Estimated contribution</Kicker>
        <div style={{ marginTop: 10, marginLeft: 100 }}>
          <Donut at={donutAt} frame={frame} />
        </div>
        <div style={{ marginTop: 6 }}>
          {ATTRIBUTION.map((s, i) => (
            <div
              key={s.label}
              style={{
                display: 'flex',
                alignItems: 'baseline',
                gap: 16,
                marginTop: 14,
                opacity: progress(frame, donutAt + i * 8 + 10, donutAt + i * 8 + 24),
              }}
            >
              <span style={{ width: 22, height: 22, borderRadius: 6, background: s.color, alignSelf: 'center' }} />
              <span style={{ fontSize: 34, fontWeight: 800, width: 90, fontVariantNumeric: 'tabular-nums' }}>{s.share}%</span>
              <span style={{ fontSize: 32, fontWeight: 700 }}>{s.label}</span>
              <span style={{ fontSize: 26, color: COLORS.muted }}>{s.detail}</span>
            </div>
          ))}
        </div>
      </div>
      {SHOW_PLACEHOLDER_BADGE && <PlaceholderBadge style={{ right: 70, top: 96 }} />}
    </AbsoluteFill>
  );
};
