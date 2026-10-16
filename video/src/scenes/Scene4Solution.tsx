// Scene 4 — The solution: title reveal, then four numbered steps (each in its own file in ./scene4).
import React from 'react';
import { Sequence, useCurrentFrame } from 'remotion';
import { Backdrop, progress, SceneFade } from '../components/common';
import { clipById, sceneTiming } from '../timeline';
import { BurnScar } from './scene4/BurnScar';
import { Detect } from './scene4/Detect';
import { Forecast } from './scene4/Forecast';
import { Intro } from './scene4/Intro';
import { StepProgress } from './scene4/StepProgress';
import { Trace } from './scene4/Trace';

const T = sceneTiming(4);

const PARTS: Array<{ clip: string; step: number; Component: React.FC }> = [
  { clip: 's4_intro', step: 0, Component: Intro },
  { clip: 's4_1_detect', step: 1, Component: Detect },
  { clip: 's4_2_burnscar', step: 2, Component: BurnScar },
  { clip: 's4_3_trace', step: 3, Component: Trace },
  { clip: 's4_4_forecast', step: 4, Component: Forecast },
];

/** Cross-fade wrapper for one sub-step. */
const Part: React.FC<{ frames: number; children: React.ReactNode }> = ({ frames, children }) => {
  const frame = useCurrentFrame();
  const o = Math.min(progress(frame, 0, 10), 1 - progress(frame, frames - 8, frames));
  return <div style={{ position: 'absolute', inset: 0, opacity: o }}>{children}</div>;
};

export const Scene4Solution: React.FC = () => {
  const frame = useCurrentFrame();
  const firstStep = clipById('s4_1_detect');
  const active = PARTS.reduce((a, p) => (frame >= clipById(p.clip).from ? p.step : a), 0);

  return (
    <SceneFade duration={T.frames}>
      <Backdrop />
      {PARTS.map(({ clip, Component }) => {
        const c = clipById(clip);
        return (
          <Sequence key={clip} from={c.from} durationInFrames={c.frames} layout="none">
            <Part frames={c.frames}>
              <Component />
            </Part>
          </Sequence>
        );
      })}
      {active > 0 && <StepProgress active={active} frame={frame} showAt={firstStep.from} />}
    </SceneFade>
  );
};
