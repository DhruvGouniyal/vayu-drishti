// ============================================================================
//  PLACEHOLDER RESULTS  —  swap these for the real Phase 2 outputs.
//  Everything in this file is illustrative, NOT model output.
//  While SHOW_PLACEHOLDER_BADGE is true, an "Illustrative data" tag is shown
//  on the charts that use these numbers. Set it to false once the numbers are real.
// ============================================================================

export const SHOW_PLACEHOLDER_BADGE = true;

/** Team name shown on the closing card. */
export const TEAM_NAME = 'SKILL BOX CODER';

/**
 * Scene 4.4 line chart (PLACEHOLDER): hourly AQI at Sector 22 over 6 days.
 * `actual` spikes on day 4; `forecast` is what the model issued 48 h earlier.
 * One value every 3 hours (8 per day). Replace with a real hindcast from Phase 2.
 */
const hours = Array.from({ length: 6 * 8 + 1 }, (_, i) => i * 3);
const bump = (h: number, centre: number, width: number, height: number) =>
  height * Math.exp(-((h - centre) ** 2) / (2 * width ** 2));
export const FORECAST_CHART = {
  station: 'Sector 22',
  hours,
  actual: hours.map((h) => Math.round(150 + 0.25 * h + bump(h, 96, 14, 270) + 12 * Math.sin(h / 5))),
  forecast: hours.map((h) => Math.round(158 + 0.25 * h + bump(h, 94, 16, 250))),
  /** Forecast horizon in hours: the dashed line runs this far ahead of the "now" cursor. */
  leadHours: 48,
};

/** Scene 4.4 donut (PLACEHOLDER): estimated share of tomorrow's PM2.5 by source. Must sum to 100. */
export const ATTRIBUTION = [
  { label: 'Farm fires', detail: 'Patiala, Sangrur…', share: 58, color: '#FF7A1A' },
  { label: 'Weather', detail: 'low wind, inversion', share: 24, color: '#6C7A93' },
  { label: 'Local', detail: 'traffic, dust, waste', share: 18, color: '#A3ACB8' },
];

/** Scene 5 alert + officer card (PLACEHOLDER). */
export const ALERT = {
  aqi: '380+',
  station: 'Sector 22',
  sentAt: '7:00 PM',
  english: { title: 'Air quality alert', body: 'Tomorrow: AQI expected 380+ in Sector 22. Avoid outdoor assembly.' },
  hindi: { title: 'वायु गुणवत्ता चेतावनी', body: 'कल: सेक्टर 22 में AQI 380+ रहने की आशंका। बाहरी सभा से बचें।' },
  punjabi: { title: 'ਹਵਾ ਗੁਣਵੱਤਾ ਚੇਤਾਵਨੀ', body: 'ਕੱਲ੍ਹ: ਸੈਕਟਰ 22 ਵਿੱਚ AQI 380+ ਰਹਿਣ ਦੀ ਸੰਭਾਵਨਾ। ਬਾਹਰੀ ਇਕੱਠ ਤੋਂ ਬਚੋ।' },
};

/** Officer dashboard (PLACEHOLDER): estimated share of tomorrow's smoke by source district. */
export const SOURCE_DISTRICTS = [
  { district: 'Patiala', share: 21 },
  { district: 'Sangrur', share: 17 },
  { district: 'Fatehgarh Sahib', share: 9 },
  { district: 'Ludhiana', share: 7 },
  { district: 'Kaithal', share: 4 },
];
