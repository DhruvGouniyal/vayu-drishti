import React from 'react';
import { useCurrentFrame } from 'remotion';
import { Clip, SCENES, Token } from '../timeline';
import { COLORS, FONT, FPS } from '../theme';

const MAX_WORDS = 8;
// Scenes whose narration is already on screen word for word (the closing card).
const NO_SUBTITLES = new Set([7]);

type Chunk = { text: string; from: number; to: number };

const chunkTokens = (tokens: Token[]): Token[][] => {
  const chunks: Token[][] = [];
  let cur: Token[] = [];
  tokens.forEach((t) => {
    cur.push(t);
    const punct = /[.,?!;:]$/.test(t.text);
    if ((punct && cur.length >= 3) || cur.length >= MAX_WORDS) {
      chunks.push(cur);
      cur = [];
    }
  });
  if (cur.length) {
    // Avoid a lonely one- or two-word last line if it fits on the previous one.
    const prev = chunks[chunks.length - 1];
    if (prev && cur.length <= 2 && prev.length + cur.length <= MAX_WORDS + 1) prev.push(...cur);
    else chunks.push(cur);
  }
  return chunks;
};

/** Absolute-frame subtitle cues for the whole video, built from the narration word timings. */
const buildCues = (): Chunk[] => {
  const cues: Chunk[] = [];
  for (const scene of SCENES) {
    if (NO_SUBTITLES.has(scene.scene)) continue;
    for (const clip of scene.clips as Clip[]) {
      const base = scene.start + clip.from;
      const chunks = chunkTokens(clip.tokens);
      chunks.forEach((ch, i) => {
        const next = chunks[i + 1];
        const from = base + Math.round((ch[0].start - 0.05) * FPS);
        const to = next ? base + Math.round((next[0].start - 0.05) * FPS) : base + Math.round((ch[ch.length - 1].end + 0.35) * FPS);
        cues.push({ text: ch.map((t) => t.text).join(' '), from, to });
      });
    }
  }
  return cues;
};

const CUES = buildCues();

export const Subtitles: React.FC = () => {
  const frame = useCurrentFrame();
  const cue = CUES.find((c) => frame >= c.from && frame < c.to);
  if (!cue) return null;
  const fadeIn = Math.min(1, (frame - cue.from) / 4);
  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 52,
        display: 'flex',
        justifyContent: 'center',
        fontFamily: FONT,
        opacity: fadeIn,
      }}
    >
      <div
        style={{
          maxWidth: 1560,
          padding: '12px 30px 14px',
          borderRadius: 16,
          background: 'rgba(5, 9, 18, 0.78)',
          color: COLORS.text,
          fontSize: 42,
          fontWeight: 600,
          lineHeight: 1.25,
          textAlign: 'center',
          letterSpacing: '-0.005em',
        }}
      >
        {cue.text}
      </div>
    </div>
  );
};
