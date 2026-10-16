import React from 'react';
import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from 'remotion';
import { COLORS, FONT } from '../theme';

export const ease = Easing.bezier(0.33, 0, 0.2, 1);

/** 0 → 1 between two frames, eased and clamped. */
export const progress = (frame: number, from: number, to: number, easing = ease): number =>
  interpolate(frame, [from, Math.max(from + 1, to)], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing,
  });

/** Dark backdrop with a faint grid and vignette, shared by every scene. */
export const Backdrop: React.FC<{ grid?: boolean }> = ({ grid = true }) => (
  <AbsoluteFill style={{ backgroundColor: COLORS.bg }}>
    {grid && (
      <AbsoluteFill
        style={{
          backgroundImage: `linear-gradient(${COLORS.grid}55 1px, transparent 1px), linear-gradient(90deg, ${COLORS.grid}55 1px, transparent 1px)`,
          backgroundSize: '80px 80px',
          opacity: 0.5,
        }}
      />
    )}
    <AbsoluteFill style={{ background: 'radial-gradient(ellipse at 50% 45%, transparent 40%, rgba(5,8,15,0.75) 100%)' }} />
  </AbsoluteFill>
);

/** Fades a whole scene in at the start and out at the end. */
export const SceneFade: React.FC<{ children: React.ReactNode; duration: number; fadeIn?: number; fadeOut?: number }> = ({
  children,
  duration: durationInFrames,
  fadeIn = 12,
  fadeOut = 12,
}) => {
  const frame = useCurrentFrame();
  const opacity = Math.min(progress(frame, 0, fadeIn), 1 - progress(frame, durationInFrames - fadeOut, durationInFrames));
  return <AbsoluteFill style={{ opacity, fontFamily: FONT, color: COLORS.text }}>{children}</AbsoluteFill>;
};

/** Big on-screen line that fades and slides in (and optionally out). */
export const Headline: React.FC<{
  children: React.ReactNode;
  at: number;
  until?: number;
  x?: number;
  y: number;
  width?: number;
  size?: number;
  align?: 'left' | 'center' | 'right';
  color?: string;
  weight?: number;
}> = ({ children, at, until, x = 0, y, width = 1920, size = 76, align = 'center', color = COLORS.text, weight = 700 }) => {
  const frame = useCurrentFrame();
  const inP = progress(frame, at, at + 18);
  const outP = until === undefined ? 0 : progress(frame, until, until + 12);
  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width,
        textAlign: align,
        fontSize: size,
        fontWeight: weight,
        letterSpacing: '-0.02em',
        lineHeight: 1.12,
        color,
        opacity: inP * (1 - outP),
        transform: `translateY(${(1 - inP) * 28}px)`,
      }}
    >
      {children}
    </div>
  );
};

/** Small uppercase label. */
export const Kicker: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({ children, style }) => (
  <div
    style={{
      fontSize: 26,
      fontWeight: 600,
      letterSpacing: '0.14em',
      textTransform: 'uppercase',
      color: COLORS.muted,
      ...style,
    }}
  >
    {children}
  </div>
);

/** "≠" drawn as "=" with a slash, because the bundled Inter subset has no ≠ glyph. */
export const NotEqual: React.FC = () => (
  <span style={{ position: 'relative', display: 'inline-block', padding: '0 0.08em' }}>
    =
    <span
      style={{
        position: 'absolute',
        left: '50%',
        top: '12%',
        width: '0.09em',
        height: '76%',
        background: 'currentColor',
        transform: 'translateX(-50%) rotate(28deg)',
        borderRadius: 4,
      }}
    />
  </span>
);

/** Rounded dark card. */
export const Card: React.FC<{ style?: React.CSSProperties; children: React.ReactNode }> = ({ style, children }) => (
  <div
    style={{
      background: `linear-gradient(180deg, ${COLORS.panel}F2, #0D1526F2)`,
      border: `1.5px solid ${COLORS.panelEdge}`,
      borderRadius: 28,
      boxShadow: '0 30px 80px rgba(0,0,0,0.45)',
      ...style,
    }}
  >
    {children}
  </div>
);

/** "Illustrative data" tag for charts that still use PLACEHOLDER numbers. */
export const PlaceholderBadge: React.FC<{ style?: React.CSSProperties }> = ({ style }) => (
  <div
    style={{
      position: 'absolute',
      fontSize: 20,
      fontWeight: 600,
      letterSpacing: '0.08em',
      textTransform: 'uppercase',
      color: COLORS.muted,
      border: `1.5px dashed ${COLORS.dim}`,
      borderRadius: 999,
      padding: '6px 16px',
      ...style,
    }}
  >
    Illustrative data
  </div>
);

export const formatInt = (n: number): string => Math.round(n).toLocaleString('en-US');
