import React from 'react';
import { Composition } from 'remotion';
import { Video } from './Video';
import { loadFonts } from './fonts';
import { FPS, HEIGHT, WIDTH } from './theme';
import { TOTAL_FRAMES } from './timeline';

loadFonts();

export const RemotionRoot: React.FC = () => (
  <Composition id="VayuDrishti" component={Video} durationInFrames={TOTAL_FRAMES} fps={FPS} width={WIDTH} height={HEIGHT} />
);
