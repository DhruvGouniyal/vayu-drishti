import React, { useLayoutEffect, useMemo, useRef } from 'react';
import { AbsoluteFill, random, useCurrentFrame } from 'remotion';
import { DISTRICTS, FIRES_BY_DAY, Projection, ringsToPath, STATS } from '../data';
import { COLORS, HEIGHT, WIDTH } from '../theme';

/** District outlines of Punjab, Haryana and Chandigarh. */
export const DistrictMap: React.FC<{
  proj: Projection;
  opacity?: number;
  highlight?: string[];
  highlightColor?: string;
  labels?: string[];
}> = ({ proj, opacity = 1, highlight = [], highlightColor = COLORS.orange, labels = [] }) => {
  const paths = useMemo(
    () => DISTRICTS.map((d) => ({ ...d, d: ringsToPath(d.rings, proj) })),
    [proj],
  );
  return (
    <svg width={WIDTH} height={HEIGHT} style={{ position: 'absolute', inset: 0, opacity }}>
      {paths.map((d) => {
        const hi = highlight.includes(d.district);
        return (
          <path
            key={d.state + d.district}
            d={d.d}
            fill={hi ? `${highlightColor}22` : d.state === 'Punjab' ? '#15213A' : '#131D33'}
            stroke={hi ? highlightColor : '#3A4C6E'}
            strokeWidth={hi ? 2.4 : 1.2}
            strokeLinejoin="round"
          />
        );
      })}
      {paths
        .filter((d) => labels.includes(d.district))
        .map((d) => {
          const [x, y] = proj(d.centroid[0], d.centroid[1]);
          return (
            <text key={`l-${d.district}`} x={x} y={y + 6} textAnchor="middle" fontSize={20} fontWeight={600} fill={COLORS.muted}>
              {d.district}
            </text>
          );
        })}
    </svg>
  );
};

/** Small "Punjab / Haryana" state labels. */
export const StateLabels: React.FC<{ proj: Projection; opacity?: number }> = ({ proj, opacity = 1 }) => {
  const items: Array<[string, number, number]> = [
    ['PUNJAB', 75.2, 31.15],
    ['HARYANA', 76.25, 29.15],
  ];
  return (
    <svg width={WIDTH} height={HEIGHT} style={{ position: 'absolute', inset: 0, opacity }}>
      {items.map(([t, lon, lat]) => {
        const [x, y] = proj(lon, lat);
        return (
          <text key={t} x={x} y={y} textAnchor="middle" fontSize={26} fontWeight={700} letterSpacing="0.3em" fill="#5D6F92">
            {t}
          </text>
        );
      })}
    </svg>
  );
};

/**
 * Real FIRMS detections drawn on a canvas.
 * mode "season": every day up to `day` is shown; today's fires are bright, older ones fade to embers.
 * mode "pulse": only the given days, each point gently pulsing.
 */
export const FireLayer: React.FC<{
  proj: Projection;
  day?: number;
  mode?: 'season' | 'pulse';
  days?: number[];
  opacity?: number;
  size?: number;
}> = ({ proj, day = 0, mode = 'season', days = [], opacity = 1, size = 1 }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  const frame = useCurrentFrame();

  useLayoutEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, WIDTH, HEIGHT);
    ctx.globalCompositeOperation = 'lighter';

    const drawDay = (d: number, alpha: number, radius: number, color: string, pulse = false) => {
      const pts = FIRES_BY_DAY[d];
      if (!pts) return;
      ctx.fillStyle = color;
      for (let i = 0; i < pts.length; i += 2) {
        const [x, y] = proj(pts[i], pts[i + 1]);
        let r = radius;
        let a = alpha;
        if (pulse) {
          const ph = (frame / 30) * 2.2 + (i % 97) * 0.37;
          const s = 0.5 + 0.5 * Math.sin(ph);
          r = radius * (0.8 + 0.6 * s);
          a = alpha * (0.55 + 0.45 * s);
        }
        ctx.globalAlpha = a;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    if (mode === 'season') {
      const today = Math.floor(day);
      for (let d = 0; d <= today && d < FIRES_BY_DAY.length; d++) {
        const age = day - d;
        if (age < 1.5) {
          drawDay(d, 0.1, 5 * size, COLORS.orange); // glow
          drawDay(d, 0.9, 2.1 * size, COLORS.amber);
        } else {
          drawDay(d, Math.max(0.06, 0.45 * Math.exp(-age / 5)), 1.6 * size, '#D9541A');
        }
      }
    } else {
      for (const d of days) {
        drawDay(d, 0.09, 6 * size, COLORS.orange, true);
        drawDay(d, 0.85, 2 * size, COLORS.amber, true);
      }
    }
    ctx.globalAlpha = 1;
  }, [proj, day, mode, days, frame, size]);

  return <canvas ref={ref} width={WIDTH} height={HEIGHT} style={{ position: 'absolute', inset: 0, opacity }} />;
};

/** City marker with a pulsing ring. */
export const CityMarker: React.FC<{
  x: number;
  y: number;
  label?: string;
  color?: string;
  opacity?: number;
  labelSide?: 'right' | 'left' | 'top';
  size?: number;
}> = ({ x, y, label, color = COLORS.text, opacity = 1, labelSide = 'right', size = 1 }) => {
  const frame = useCurrentFrame();
  const ring = (frame % 45) / 45;
  return (
    <svg width={WIDTH} height={HEIGHT} style={{ position: 'absolute', inset: 0, opacity, overflow: 'visible' }}>
      <circle cx={x} cy={y} r={(10 + ring * 26) * size} fill="none" stroke={color} strokeWidth={2.5} opacity={1 - ring} />
      <circle cx={x} cy={y} r={9 * size} fill={color} stroke={COLORS.bg} strokeWidth={3} />
      {label && (
        <text
          x={labelSide === 'right' ? x + 22 * size : labelSide === 'left' ? x - 22 * size : x}
          y={labelSide === 'top' ? y - 26 * size : y + 9}
          textAnchor={labelSide === 'right' ? 'start' : labelSide === 'left' ? 'end' : 'middle'}
          fontSize={28 * size}
          fontWeight={700}
          fill={color}
          stroke={COLORS.bg}
          strokeWidth={6}
          paintOrder="stroke"
        >
          {label}
        </text>
      )}
    </svg>
  );
};

/**
 * Wisps of smoke drifting from the fire belt toward a target (Chandigarh).
 * Purely illustrative motion; sources are the real top fire districts.
 */
export const SmokeDrift: React.FC<{
  proj: Projection;
  target: [number, number];
  intensity?: number;
  count?: number;
  speed?: number;
  /** 0-1: smog that has already piled up over the target. */
  buildup?: number;
}> = ({ proj, target, intensity = 1, count = 60, speed = 1, buildup = 0 }) => {
  const frame = useCurrentFrame();
  const sources = STATS.topDistricts.map((d) => d.centroid).filter(Boolean);
  const [tx, ty] = proj(target[0], target[1]);
  return (
    <svg width={WIDTH} height={HEIGHT} style={{ position: 'absolute', inset: 0, opacity: intensity }}>
      <defs>
        <filter id="smokeBlur" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="16" />
        </filter>
      </defs>
      <g filter="url(#smokeBlur)">
        <circle cx={tx} cy={ty} r={60 + 50 * buildup} fill={COLORS.smoke} opacity={0.32 * buildup} />
        {Array.from({ length: count }, (_, i) => {
          const src = sources[i % sources.length];
          const [sx, sy] = proj(src[0] + (random(`sx${i}`) - 0.5) * 0.6, src[1] + (random(`sy${i}`) - 0.5) * 0.5);
          const life = 150 + random(`l${i}`) * 90;
          const t = ((frame * speed + random(`o${i}`) * life) % life) / life;
          // Curve: drift a little south-east first, then bend up toward the target.
          const bend = (random(`b${i}`) - 0.3) * 120;
          const x = sx + (tx - sx) * t + Math.sin(t * Math.PI) * bend * 0.4;
          const y = sy + (ty - sy) * t + Math.sin(t * Math.PI) * bend;
          const r = 12 + t * 34 + random(`r${i}`) * 10;
          // Fade in near the fires, stay visible all the way to the city, fade as it settles.
          const a = Math.min(1, t / 0.2) * (1 - Math.max(0, (t - 0.9) / 0.1)) * 0.2;
          return <circle key={i} cx={x} cy={y} r={r} fill={COLORS.smoke} opacity={a} />;
        })}
      </g>
    </svg>
  );
};
