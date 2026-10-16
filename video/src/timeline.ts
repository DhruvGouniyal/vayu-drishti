// Builds the whole video's timing from narration.json + the generated audio timings.
// Every scene's length = its clips' speech length + padding, so voice and visuals stay in sync.

import narration from '../narration.json';
import rawTimings from '../public/audio/timings.json';
import { FPS } from './theme';

type BoundaryWord = [text: string, start: number, end: number];
type ClipTiming = { duration: number; speech_end?: number; words: BoundaryWord[] };

/** Seconds of quiet before the very first word (narration.json → lead_in_seconds). */
export const LEAD_IN_SECONDS: number = narration.lead_in_seconds ?? 0.4;
/** Extra hold at the end of a scene, on top of the padding after its last clip (narration.json → scene_hold_seconds). */
export const SCENE_HOLD_SECONDS = (narration.scene_hold_seconds ?? {}) as Record<string, number>;

export type Token = { text: string; start: number; end: number };

export type Clip = {
  id: string;
  scene: number;
  text: string;
  hasAudio: boolean;
  /** First frame of this clip, counted from the start of its scene. */
  from: number;
  /** Frames reserved for this clip (speech + padding). */
  frames: number;
  speechSeconds: number;
  /** Narration words (with punctuation) and their times in seconds from clip start. */
  tokens: Token[];
};

export type SceneTiming = { scene: number; start: number; frames: number; clips: Clip[] };

const timings = rawTimings as unknown as Record<string, ClipTiming>;
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9ऀ-੿]/g, '');

/** Match the narration text (which has punctuation) to edge-tts word boundaries (which don't). */
const alignTokens = (text: string, words: BoundaryWord[], seconds: number): Token[] => {
  const raw = text.split(/\s+/).filter(Boolean);
  const totalChars = raw.reduce((n, t) => n + norm(t).length, 0);
  const boundaryChars = words.reduce((n, w) => n + norm(w[0]).length, 0);

  if (!words.length || boundaryChars !== totalChars) {
    // No usable timings: spread words evenly across the clip.
    let t = 0.1;
    const per = (seconds - 0.2) / Math.max(1, totalChars);
    return raw.map((w) => {
      const len = Math.max(1, norm(w).length) * per;
      const tok = { text: w, start: t, end: t + len };
      t += len;
      return tok;
    });
  }

  // Character stream: each normalised character knows which narration word it belongs to.
  const owner: number[] = [];
  raw.forEach((w, i) => {
    for (let k = 0; k < norm(w).length; k++) owner.push(i);
  });
  const start = new Array<number>(raw.length).fill(NaN);
  const end = new Array<number>(raw.length).fill(NaN);
  let p = 0;
  for (const [wText, s, e] of words) {
    const n = norm(wText).length;
    for (let k = 0; k < n; k++, p++) {
      const i = owner[p];
      if (Number.isNaN(start[i])) start[i] = s;
      end[i] = e;
    }
  }
  return raw.map((w, i) => ({
    text: w,
    start: Number.isNaN(start[i]) ? (i ? end[i - 1] : 0) : start[i],
    end: Number.isNaN(end[i]) ? (i ? end[i - 1] : 0.3) : end[i],
  }));
};

const build = (): SceneTiming[] => {
  const pad = narration.padding_seconds ?? 0.5;
  const scenes: SceneTiming[] = [];
  let cursor = 0;
  const sceneIds = [...new Set(narration.clips.map((c) => c.scene))].sort((a, b) => a - b);

  for (const sceneId of sceneIds) {
    const sceneStart = cursor;
    let local = sceneId === sceneIds[0] ? Math.round(LEAD_IN_SECONDS * FPS) : 0;
    const clips: Clip[] = [];
    for (const c of narration.clips.filter((x) => x.scene === sceneId)) {
      const t = timings[c.id];
      // Fallback if the voiceover hasn't been generated for a new/edited clip yet: ~2.6 words/s.
      const speech = t ? t.speech_end ?? t.duration : c.text.split(/\s+/).length / 2.6;
      const frames = Math.round((speech + pad) * FPS);
      clips.push({
        id: c.id,
        scene: sceneId,
        text: c.text,
        hasAudio: Boolean(t),
        from: local,
        frames,
        speechSeconds: speech,
        tokens: alignTokens(c.text, t?.words ?? [], speech),
      });
      local += frames;
    }
    local += Math.round((SCENE_HOLD_SECONDS[sceneId] ?? 0) * FPS);
    scenes.push({ scene: sceneId, start: sceneStart, frames: local, clips });
    cursor += local;
  }
  return scenes;
};

export const SCENES = build();
export const TOTAL_FRAMES = SCENES.reduce((n, s) => n + s.frames, 0);
export const PLANNED_SECONDS = narration.planned_seconds as Record<string, number>;

export const sceneTiming = (scene: number): SceneTiming => {
  const s = SCENES.find((x) => x.scene === scene);
  if (!s) throw new Error(`No narration clips for scene ${scene}`);
  return s;
};

export const clipById = (id: string): Clip => {
  for (const s of SCENES) {
    const c = s.clips.find((x) => x.id === id);
    if (c) return c;
  }
  throw new Error(`Unknown clip ${id}`);
};

/**
 * Frame (relative to the clip's scene) when a word is spoken, e.g. cue('s2_problem', 'monitoring').
 * Falls back to `fallback` (a 0-1 fraction of the clip) if the word isn't found.
 */
export const cue = (clipId: string, word: string, opts: { edge?: 'start' | 'end'; nth?: number; fallback?: number } = {}): number => {
  const clip = clipById(clipId);
  const target = norm(word);
  const hits = clip.tokens.filter((t) => norm(t.text) === target);
  const tok = hits[opts.nth ?? 0];
  const seconds = tok ? (opts.edge === 'end' ? tok.end : tok.start) : (opts.fallback ?? 0) * clip.speechSeconds;
  return clip.from + Math.round(seconds * FPS);
};

/** Like cue(), but counted from the start of the clip itself (for components inside a clip's <Sequence>). */
export const clipCue = (clipId: string, word: string, opts: { edge?: 'start' | 'end'; nth?: number; fallback?: number } = {}): number =>
  cue(clipId, word, opts) - clipById(clipId).from;
