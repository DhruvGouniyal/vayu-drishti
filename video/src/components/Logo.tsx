import React from 'react';
import { COLORS } from '../theme';

/** Original Vayu Drishti mark: an eye (drishti = sight) with wind lines (vayu = air). */
export const LogoMark: React.FC<{ size?: number; draw?: number; color?: string }> = ({ size = 160, draw = 1, color = COLORS.teal }) => {
  const dash = 600;
  return (
    <svg width={size} height={size} viewBox="0 0 160 160" fill="none">
      <path
        d="M10 80 C40 32 120 32 150 80 C120 128 40 128 10 80Z"
        stroke={color}
        strokeWidth={9}
        strokeLinejoin="round"
        strokeDasharray={dash}
        strokeDashoffset={dash * (1 - draw)}
      />
      <circle cx={80} cy={80} r={24 * draw} fill={color} />
      <circle cx={88} cy={72} r={7 * draw} fill={COLORS.bg} />
      <path d="M36 140 C64 128 96 152 124 140" stroke={color} strokeWidth={6} strokeLinecap="round" opacity={0.7 * draw} />
      <path d="M50 20 C74 10 92 30 112 20" stroke={color} strokeWidth={6} strokeLinecap="round" opacity={0.7 * draw} />
    </svg>
  );
};
