import { continueRender, delayRender, staticFile } from 'remotion';

// Fonts ship in public/fonts (Inter + Noto Sans, SIL Open Font License), so rendering
// works offline and looks the same on every machine.
const FACES: Array<[family: string, file: string, weight: string]> = [
  ['Inter', 'inter-latin-400-normal.woff2', '400'],
  ['Inter', 'inter-latin-500-normal.woff2', '500'],
  ['Inter', 'inter-latin-600-normal.woff2', '600'],
  ['Inter', 'inter-latin-700-normal.woff2', '700'],
  ['Inter', 'inter-latin-800-normal.woff2', '800'],
  ['Noto Sans Devanagari', 'noto-sans-devanagari-devanagari-500-normal.woff2', '500'],
  ['Noto Sans Devanagari', 'noto-sans-devanagari-devanagari-700-normal.woff2', '700'],
  ['Noto Sans Gurmukhi', 'noto-sans-gurmukhi-gurmukhi-500-normal.woff2', '500'],
  ['Noto Sans Gurmukhi', 'noto-sans-gurmukhi-gurmukhi-700-normal.woff2', '700'],
];

let started = false;

export const loadFonts = (): void => {
  if (started || typeof document === 'undefined') return;
  started = true;
  const handle = delayRender('Loading fonts');
  Promise.all(
    FACES.map(([family, file, weight]) => {
      const face = new FontFace(family, `url(${staticFile(`fonts/${file}`)}) format('woff2')`, { weight });
      (document.fonts as unknown as { add: (f: FontFace) => void }).add(face);
      return face.load();
    }),
  )
    .then(() => continueRender(handle))
    .catch((err) => {
      console.error('Font loading failed', err);
      continueRender(handle);
    });
};
