// Scene 7 — Close: teal wordmark, tagline, team name.
import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { Backdrop, progress, SceneFade } from '../components/common';
import { LogoMark } from '../components/Logo';
import { TEAM_NAME } from '../results';
import { COLORS } from '../theme';
import { cue, sceneTiming } from '../timeline';

const T = sceneTiming(7);
const CLIP = 's7_close';

export const Scene7Close: React.FC = () => {
  const frame = useCurrentFrame();
  const tagAt = cue(CLIP, 'Smog', { fallback: 0.4 });
  const word = progress(frame, 4, 24);
  const tag = progress(frame, tagAt, tagAt + 16);
  return (
    <SceneFade duration={T.frames} fadeOut={20}>
      <Backdrop grid={false} />
      <AbsoluteFill style={{ background: `radial-gradient(circle at 50% 44%, ${COLORS.teal}1F 0%, transparent 50%)` }} />
      <AbsoluteFill style={{ alignItems: 'center' }}>
        <div style={{ marginTop: 200, opacity: word }}>
          <LogoMark size={190} draw={progress(frame, 0, 30)} />
        </div>
        <div
          style={{
            marginTop: 20,
            fontSize: 150,
            fontWeight: 800,
            color: COLORS.teal,
            letterSpacing: '-0.02em',
            opacity: word,
            transform: `translateY(${(1 - word) * 24}px)`,
          }}
        >
          Vayu Drishti
        </div>
        <div style={{ marginTop: 18, fontSize: 60, fontWeight: 600, opacity: tag, transform: `translateY(${(1 - tag) * 18}px)` }}>
          Smog shouldn't be a surprise.
        </div>
      </AbsoluteFill>
      <div
        style={{
          position: 'absolute',
          bottom: 190,
          width: '100%',
          textAlign: 'center',
          fontSize: 30,
          fontWeight: 600,
          color: COLORS.muted,
          letterSpacing: '0.06em',
          opacity: progress(frame, tagAt + 20, tagAt + 36),
        }}
      >
        Team: {TEAM_NAME}
      </div>
    </SceneFade>
  );
};
