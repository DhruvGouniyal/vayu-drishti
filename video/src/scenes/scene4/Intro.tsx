// Scene 4 intro — "VAYU DRISHTI" title reveal in teal.
import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { progress } from '../../components/common';
import { LogoMark } from '../../components/Logo';
import { COLORS } from '../../theme';
import { clipCue } from '../../timeline';

export const Intro: React.FC = () => {
  const frame = useCurrentFrame();
  const titleAt = clipCue('s4_intro', 'Vayu', { fallback: 0.1 });
  const subAt = clipCue('s4_intro', 'AI', { fallback: 0.45 });
  const letters = 'VAYU DRISHTI'.split('');
  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
      <AbsoluteFill
        style={{
          background: `radial-gradient(circle at 50% 46%, ${COLORS.teal}26 0%, transparent 45%)`,
          opacity: progress(frame, titleAt - 6, titleAt + 30),
        }}
      />
      <div style={{ position: 'absolute', top: 210, opacity: progress(frame, 0, 20) }}>
        <LogoMark size={170} draw={progress(frame, 0, 34)} />
      </div>
      <div style={{ position: 'absolute', top: 420, display: 'flex', fontSize: 150, fontWeight: 800, color: COLORS.teal }}>
        {letters.map((ch, i) => {
          const p = progress(frame, titleAt + i * 2, titleAt + i * 2 + 16);
          return (
            <span
              key={i}
              style={{
                display: 'inline-block',
                width: ch === ' ' ? 50 : undefined,
                opacity: p,
                transform: `translateY(${(1 - p) * 40}px)`,
                letterSpacing: '0.04em',
              }}
            >
              {ch}
            </span>
          );
        })}
      </div>
      <div
        style={{
          position: 'absolute',
          top: 620,
          fontSize: 50,
          fontWeight: 500,
          color: COLORS.text,
          opacity: progress(frame, subAt, subAt + 16),
          transform: `translateY(${(1 - progress(frame, subAt, subAt + 16)) * 20}px)`,
        }}
      >
        AI early warning for Chandigarh's air
      </div>
    </AbsoluteFill>
  );
};
