// Colours and type for the whole video. Change them here, not in the scenes.

export const COLORS = {
  bg: '#0B1220',
  panel: '#111A2C',
  panelEdge: '#22314D',
  grid: '#1A2539',
  text: '#EEF2F7',
  muted: '#8B98AE',
  dim: '#4A5870',
  smoke: '#A3ACB8',
  amber: '#FFB020',
  orange: '#FF7A1A',
  teal: '#2EC4B6',
  red: '#E63946',
  yellow: '#F2C94C',
  green: '#3BB273',
  field: '#C9A646',
  fieldGreen: '#6F9A3A',
  scar: '#1C1612',
} as const;

export const FONT = "'Inter', 'Noto Sans Devanagari', 'Noto Sans Gurmukhi', sans-serif";
export const FONT_HI = "'Noto Sans Devanagari', 'Inter', sans-serif";
export const FONT_PA = "'Noto Sans Gurmukhi', 'Inter', sans-serif";

export const WIDTH = 1920;
export const HEIGHT = 1080;
export const FPS = 30;

// Space kept free at the bottom of the frame for subtitles.
export const SUBTITLE_SAFE = 170;

// CPCB National AQI colour bands.
export const aqiColor = (aqi: number): string => {
  if (aqi <= 50) return '#3BB273';
  if (aqi <= 100) return '#9BCB3B';
  if (aqi <= 200) return '#F2C94C';
  if (aqi <= 300) return '#FF9F1C';
  if (aqi <= 400) return '#F25C3B';
  return COLORS.red;
};

export const aqiCategory = (aqi: number): string => {
  if (aqi <= 50) return 'Good';
  if (aqi <= 100) return 'Satisfactory';
  if (aqi <= 200) return 'Moderate';
  if (aqi <= 300) return 'Poor';
  if (aqi <= 400) return 'Very Poor';
  return 'Severe';
};
