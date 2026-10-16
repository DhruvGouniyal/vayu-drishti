import React from 'react';
import { AbsoluteFill, Audio, Sequence, staticFile } from 'remotion';
import { Subtitles } from './components/Subtitles';
import { Scene1Hook } from './scenes/Scene1Hook';
import { Scene2Problem } from './scenes/Scene2Problem';
import { Scene3Hidden } from './scenes/Scene3Hidden';
import { Scene4Solution } from './scenes/Scene4Solution';
import { Scene5Action } from './scenes/Scene5Action';
import { Scene6Dpi } from './scenes/Scene6Dpi';
import { Scene7Close } from './scenes/Scene7Close';
import { COLORS } from './theme';
import { SCENES } from './timeline';

// One component per scene; edit them independently in src/scenes/.
const SCENE_COMPONENTS: Record<number, React.FC> = {
  1: Scene1Hook,
  2: Scene2Problem,
  3: Scene3Hidden,
  4: Scene4Solution,
  5: Scene5Action,
  6: Scene6Dpi,
  7: Scene7Close,
};

export const Video: React.FC = () => (
  <AbsoluteFill style={{ backgroundColor: COLORS.bg }}>
    {SCENES.map((s) => {
      const Scene = SCENE_COMPONENTS[s.scene];
      return (
        <Sequence key={s.scene} name={`Scene ${s.scene}`} from={s.start} durationInFrames={s.frames}>
          {Scene && <Scene />}
          {s.clips
            .filter((c) => c.hasAudio)
            .map((c) => (
              <Sequence key={c.id} name={c.id} from={c.from} durationInFrames={c.frames}>
                <Audio src={staticFile(`audio/${c.id}.mp3`)} />
              </Sequence>
            ))}
        </Sequence>
      );
    })}
    <Subtitles />
  </AbsoluteFill>
);
