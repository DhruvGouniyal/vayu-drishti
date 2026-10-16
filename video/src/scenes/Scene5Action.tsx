// Scene 5 — Action: a phone gets the evening-before alert in Punjabi, Hindi and English; officers get source districts.
// Alert text and district shares come from src/results.ts (PLACEHOLDER).
import React from 'react';
import { useCurrentFrame } from 'remotion';
import { Backdrop, Card, Headline, Kicker, PlaceholderBadge, progress, SceneFade } from '../components/common';
import { LogoMark } from '../components/Logo';
import { ALERT, SHOW_PLACEHOLDER_BADGE, SOURCE_DISTRICTS } from '../results';
import { COLORS, FONT, FONT_HI, FONT_PA } from '../theme';
import { cue, sceneTiming } from '../timeline';

const T = sceneTiming(5);
const CLIP = 's5_action';

type Lang = 'english' | 'punjabi' | 'hindi';
const LANG_FONT: Record<Lang, string> = { english: FONT, punjabi: FONT_PA, hindi: FONT_HI };
const LANG_LABEL: Record<Lang, string> = { punjabi: 'ਪੰਜਾਬੀ', hindi: 'हिन्दी', english: 'English' };

const Phone: React.FC<{ frame: number; alertAt: number; switches: Array<[number, Lang]> }> = ({ frame, alertAt, switches }) => {
  // Which language is showing, and how far through the flip we are.
  let lang: Lang = 'english';
  let flipStart = -999;
  for (const [at, l] of switches) {
    if (frame >= at) {
      lang = l;
      flipStart = at;
    }
  }
  const flip = progress(frame, flipStart, flipStart + 12);
  const rot = (1 - flip) * 90;
  const arrive = progress(frame, alertAt, alertAt + 16);
  const msg = ALERT[lang];

  return (
    <div
      style={{
        position: 'absolute',
        left: 170,
        top: 120,
        width: 430,
        height: 790,
        borderRadius: 64,
        background: '#05080F',
        border: '10px solid #263248',
        boxShadow: '0 40px 100px rgba(0,0,0,0.6)',
        overflow: 'hidden',
      }}
    >
      {/* lock-screen wallpaper */}
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(160deg, #18294A 0%, #0B1220 60%, #1A1430 100%)' }} />
      <div style={{ position: 'absolute', top: 18, left: '50%', width: 120, height: 30, marginLeft: -60, borderRadius: 16, background: '#000' }} />
      <div style={{ position: 'absolute', top: 96, width: '100%', textAlign: 'center' }}>
        <div style={{ fontSize: 24, fontWeight: 600, color: COLORS.muted }}>The evening before</div>
        <div style={{ fontSize: 96, fontWeight: 700, letterSpacing: '-0.03em', marginTop: 4 }}>{ALERT.sentAt.replace(' PM', '')}</div>
      </div>

      {/* notification */}
      <div
        style={{
          position: 'absolute',
          left: 20,
          right: 20,
          top: 300,
          opacity: arrive,
          transform: `translateY(${(1 - arrive) * -60}px) perspective(900px) rotateX(${frame >= flipStart && flipStart > alertAt ? rot : 0}deg)`,
        }}
      >
        <div
          style={{
            borderRadius: 26,
            background: 'rgba(238,242,247,0.96)',
            color: '#0B1220',
            padding: '20px 22px 24px',
            boxShadow: '0 20px 40px rgba(0,0,0,0.4)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: COLORS.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <LogoMark size={30} />
            </div>
            <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: '#4A5870' }}>Vayu Drishti</div>
            <div style={{ marginLeft: 'auto', fontSize: 20, color: '#6B7587' }}>now</div>
          </div>
          <div style={{ marginTop: 14, fontFamily: LANG_FONT[lang], fontSize: 30, fontWeight: 700, lineHeight: 1.25, color: COLORS.red }}>
            {msg.title}
          </div>
          <div style={{ marginTop: 8, fontFamily: LANG_FONT[lang], fontSize: 28, fontWeight: 500, lineHeight: 1.4 }}>{msg.body}</div>
        </div>
      </div>

      {/* language chips */}
      <div style={{ position: 'absolute', top: 640, width: '100%', display: 'flex', justifyContent: 'center', gap: 10, opacity: progress(frame, switches[0][0] - 6, switches[0][0] + 6) }}>
        {(['punjabi', 'hindi', 'english'] as Lang[]).map((l) => (
          <div
            key={l}
            style={{
              fontFamily: LANG_FONT[l],
              fontSize: 24,
              fontWeight: 700,
              padding: '8px 16px',
              borderRadius: 999,
              background: l === lang ? COLORS.teal : 'rgba(255,255,255,0.08)',
              color: l === lang ? COLORS.bg : COLORS.muted,
            }}
          >
            {LANG_LABEL[l]}
          </div>
        ))}
      </div>
    </div>
  );
};

const Audience: React.FC<{ frame: number; at: number }> = ({ frame, at }) => (
  <div style={{ display: 'flex', gap: 18 }}>
    {['Schools', 'Hospitals', 'Citizens'].map((a, i) => {
      const p = progress(frame, at + i * 6, at + i * 6 + 14);
      return (
        <div
          key={a}
          style={{
            fontSize: 32,
            fontWeight: 700,
            padding: '12px 26px',
            borderRadius: 999,
            border: `2.5px solid ${COLORS.teal}`,
            color: COLORS.teal,
            opacity: p,
            transform: `translateY(${(1 - p) * 16}px)`,
          }}
        >
          {a}
        </div>
      );
    })}
  </div>
);

const OfficerCard: React.FC<{ frame: number; at: number }> = ({ frame, at }) => {
  const p = progress(frame, at, at + 16);
  const max = Math.max(...SOURCE_DISTRICTS.map((d) => d.share));
  return (
    <Card style={{ position: 'absolute', left: 760, top: 430, width: 1000, padding: '30px 40px', opacity: p, transform: `translateY(${(1 - p) * 30}px)` }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <Kicker>Enforcement · tomorrow</Kicker>
        <div style={{ fontSize: 22, color: COLORS.muted }}>Estimated share of smoke</div>
      </div>
      <div style={{ fontSize: 40, fontWeight: 800, marginTop: 8 }}>Top source districts</div>
      <div style={{ marginTop: 18 }}>
        {SOURCE_DISTRICTS.map((d, i) => {
          const q = progress(frame, at + 10 + i * 5, at + 28 + i * 5);
          return (
            <div key={d.district} style={{ display: 'flex', alignItems: 'center', gap: 20, marginTop: 12 }}>
              <div style={{ width: 40, fontSize: 26, fontWeight: 700, color: COLORS.muted }}>{i + 1}</div>
              <div style={{ width: 290, fontSize: 32, fontWeight: 700 }}>{d.district}</div>
              <div style={{ flex: 1, height: 22, borderRadius: 11, background: '#1C2840' }}>
                <div style={{ width: `${(d.share / max) * 100 * q}%`, height: '100%', borderRadius: 11, background: COLORS.orange }} />
              </div>
              <div style={{ width: 80, textAlign: 'right', fontSize: 30, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{Math.round(d.share * q)}%</div>
            </div>
          );
        })}
      </div>
    </Card>
  );
};

export const Scene5Action: React.FC = () => {
  const frame = useCurrentFrame();
  const alertAt = cue(CLIP, 'alert', { fallback: 0.25 });
  const audienceAt = cue(CLIP, 'Schools,', { fallback: 0.1 });
  const switches: Array<[number, Lang]> = [
    [cue(CLIP, 'Punjabi,', { fallback: 0.42 }), 'punjabi'],
    [cue(CLIP, 'Hindi', { fallback: 0.5 }), 'hindi'],
    [cue(CLIP, 'English.', { fallback: 0.58 }), 'english'],
  ];
  const officerAt = cue(CLIP, 'enforcement', { fallback: 0.68 });

  return (
    <SceneFade duration={T.frames}>
      <Backdrop />
      <Phone frame={frame} alertAt={alertAt} switches={switches} />
      <Headline at={4} x={760} y={140} width={1100} size={78} align="left">
        Warned <span style={{ color: COLORS.teal }}>the evening before</span>
      </Headline>
      <div style={{ position: 'absolute', left: 760, top: 290 }}>
        <Audience frame={frame} at={audienceAt} />
      </div>
      <OfficerCard frame={frame} at={officerAt} />
      {SHOW_PLACEHOLDER_BADGE && frame > officerAt && <PlaceholderBadge style={{ left: 760, top: 880, opacity: progress(frame, officerAt + 10, officerAt + 24) }} />}
    </SceneFade>
  );
};
