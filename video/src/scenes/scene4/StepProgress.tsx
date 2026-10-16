import React from 'react';
import { progress } from '../../components/common';
import { COLORS } from '../../theme';

export const STEPS = ['Detect', 'Hidden fires', 'Trace smoke', 'Forecast'];

/** Numbered 1–4 progress bar along the top of scene 4. `active` is 1-based; 0 hides it. */
export const StepProgress: React.FC<{ active: number; frame: number; showAt: number }> = ({ active, frame, showAt }) => {
  const appear = progress(frame, showAt, showAt + 15);
  return (
    <div
      style={{
        position: 'absolute',
        top: 38,
        left: 260,
        right: 260,
        display: 'flex',
        gap: 18,
        opacity: appear,
        transform: `translateY(${(1 - appear) * -20}px)`,
      }}
    >
      {STEPS.map((label, i) => {
        const n = i + 1;
        const state = n < active ? 'done' : n === active ? 'active' : 'todo';
        const c = state === 'todo' ? COLORS.dim : COLORS.teal;
        return (
          <div key={label} style={{ flex: 1 }}>
            <div style={{ height: 6, borderRadius: 3, background: state === 'todo' ? '#24324C' : c, opacity: state === 'done' ? 0.55 : 1 }} />
            <div
              style={{
                marginTop: 12,
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                fontSize: 26,
                fontWeight: state === 'active' ? 700 : 600,
                color: state === 'active' ? COLORS.text : state === 'done' ? COLORS.muted : COLORS.dim,
              }}
            >
              <span
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 19,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 22,
                  fontWeight: 800,
                  background: state === 'active' ? COLORS.teal : 'transparent',
                  color: state === 'active' ? COLORS.bg : c,
                  border: `2.5px solid ${c}`,
                }}
              >
                {n}
              </span>
              {label}
            </div>
          </div>
        );
      })}
    </div>
  );
};
