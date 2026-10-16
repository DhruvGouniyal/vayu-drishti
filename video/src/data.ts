// Real project data (exported by scripts/export_data.py) plus map projection helpers.

import districtsJson from '../public/data/districts.json';
import firesJson from '../public/data/fires.json';
import statsJson from '../public/data/stats.json';

export type District = { state: string; district: string; centroid: [number, number]; rings: [number, number][][] };
export const DISTRICTS = (districtsJson as unknown as { districts: District[] }).districts;

export const STATS = statsJson as unknown as {
  chandigarh: { lat: number; lon: number };
  stations: Array<{ key: string; name: string; lat: number; lon: number }>;
  season: number;
  detectionsPerSeason: Array<{ year: number; count: number }>;
  topDistricts: Array<{ district: string; count: number; centroid: [number, number] }>;
};

export const CHANDIGARH: [number, number] = [STATS.chandigarh.lon, STATS.chandigarh.lat];

const fires = firesJson as unknown as { season: number; start: string; days: number; daily: number[]; points: number[] };
export const FIRE_SEASON = fires.season;
export const FIRE_DAYS = fires.days;
export const FIRE_DAILY = fires.daily;
export const FIRE_START = new Date(`${fires.start}T00:00:00Z`);

/** Fire points grouped by day index (0 = 1 Oct): flat [lon, lat, lon, lat, ...]. */
export const FIRES_BY_DAY: Float32Array[] = (() => {
  const buckets: number[][] = Array.from({ length: fires.days }, () => []);
  const p = fires.points;
  for (let i = 0; i < p.length; i += 3) buckets[p[i]]?.push(p[i + 1], p[i + 2]);
  return buckets.map((b) => Float32Array.from(b));
})();

export const firesUpToDay = (day: number): number =>
  FIRE_DAILY.slice(0, Math.max(0, Math.floor(day) + 1)).reduce((a, b) => a + b, 0);

export const dayLabel = (day: number): string => {
  const d = new Date(FIRE_START.getTime() + Math.floor(day) * 86400000);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
};

// ---------- projection ----------

export type Bounds = { west: number; east: number; south: number; north: number };
export type Projection = {
  (lon: number, lat: number): [number, number];
  scale: number;
};

/** Equirectangular projection fitted into a box, x scaled by cos(latitude) so shapes look right. */
export const fitProjection = (b: Bounds, box: { x: number; y: number; w: number; h: number }): Projection => {
  const k = Math.cos((((b.north + b.south) / 2) * Math.PI) / 180);
  const spanX = (b.east - b.west) * k;
  const spanY = b.north - b.south;
  const scale = Math.min(box.w / spanX, box.h / spanY);
  const ox = box.x + (box.w - spanX * scale) / 2;
  const oy = box.y + (box.h - spanY * scale) / 2;
  const f = ((lon: number, lat: number) => [ox + (lon - b.west) * k * scale, oy + (b.north - lat) * scale]) as Projection;
  f.scale = scale;
  return f;
};

/** Punjab + Haryana + Chandigarh (a little tighter than config.BBOX, which has a margin). */
export const PB_HR_BOUNDS: Bounds = { west: 73.85, east: 77.6, south: 27.6, north: 32.55 };

export const ringsToPath = (rings: [number, number][][], proj: Projection): string =>
  rings
    .map((ring) =>
      ring
        .map(([lon, lat], i) => {
          const [x, y] = proj(lon, lat);
          return `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`;
        })
        .join('') + 'Z',
    )
    .join('');
