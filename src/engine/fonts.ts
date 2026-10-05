import { bumpFontEpoch } from './text';

export interface FontDef {
  name: string;
  weights: number[];
  category: 'sans' | 'serif' | 'display' | 'script' | 'mono' | 'devanagari' | 'system';
}

const range = (a: number, b: number) => {
  const out: number[] = [];
  for (let w = a; w <= b; w += 100) out.push(w);
  return out;
};

export const FONTS: FontDef[] = [
  { name: 'Inter', weights: range(300, 900), category: 'sans' },
  { name: 'Poppins', weights: range(300, 900), category: 'sans' },
  { name: 'Montserrat', weights: range(300, 900), category: 'sans' },
  { name: 'Roboto', weights: [300, 400, 500, 700, 900], category: 'sans' },
  { name: 'Open Sans', weights: range(300, 800), category: 'sans' },
  { name: 'Lato', weights: [300, 400, 700, 900], category: 'sans' },
  { name: 'Raleway', weights: range(300, 900), category: 'sans' },
  { name: 'Nunito', weights: range(300, 900), category: 'sans' },
  { name: 'Rubik', weights: range(300, 900), category: 'sans' },
  { name: 'Work Sans', weights: range(300, 900), category: 'sans' },
  { name: 'Outfit', weights: range(300, 900), category: 'sans' },
  { name: 'Quicksand', weights: range(300, 700), category: 'sans' },
  { name: 'Josefin Sans', weights: range(300, 700), category: 'sans' },
  { name: 'Space Grotesk', weights: range(300, 700), category: 'sans' },
  { name: 'Archivo', weights: range(300, 900), category: 'sans' },
  { name: 'Syne', weights: range(400, 800), category: 'sans' },
  { name: 'Comfortaa', weights: range(300, 700), category: 'sans' },
  { name: 'Fredoka', weights: range(300, 700), category: 'sans' },
  { name: 'Oswald', weights: range(300, 700), category: 'sans' },
  { name: 'Barlow Condensed', weights: range(300, 900), category: 'sans' },
  { name: 'Teko', weights: range(300, 700), category: 'sans' },
  { name: 'Playfair Display', weights: range(400, 900), category: 'serif' },
  { name: 'Merriweather', weights: [300, 400, 700, 900], category: 'serif' },
  { name: 'Lora', weights: range(400, 700), category: 'serif' },
  { name: 'Cormorant Garamond', weights: range(300, 700), category: 'serif' },
  { name: 'Libre Baskerville', weights: [400, 700], category: 'serif' },
  { name: 'DM Serif Display', weights: [400], category: 'serif' },
  { name: 'Bodoni Moda', weights: range(400, 900), category: 'serif' },
  { name: 'Cinzel', weights: range(400, 900), category: 'serif' },
  { name: 'Zilla Slab', weights: range(300, 700), category: 'serif' },
  { name: 'Bebas Neue', weights: [400], category: 'display' },
  { name: 'Anton', weights: [400], category: 'display' },
  { name: 'Abril Fatface', weights: [400], category: 'display' },
  { name: 'Archivo Black', weights: [400], category: 'display' },
  { name: 'Alfa Slab One', weights: [400], category: 'display' },
  { name: 'Righteous', weights: [400], category: 'display' },
  { name: 'Russo One', weights: [400], category: 'display' },
  { name: 'Bangers', weights: [400], category: 'display' },
  { name: 'Black Ops One', weights: [400], category: 'display' },
  { name: 'Orbitron', weights: range(400, 900), category: 'display' },
  { name: 'Monoton', weights: [400], category: 'display' },
  { name: 'Press Start 2P', weights: [400], category: 'display' },
  { name: 'Lobster', weights: [400], category: 'script' },
  { name: 'Pacifico', weights: [400], category: 'script' },
  { name: 'Dancing Script', weights: range(400, 700), category: 'script' },
  { name: 'Great Vibes', weights: [400], category: 'script' },
  { name: 'Sacramento', weights: [400], category: 'script' },
  { name: 'Satisfy', weights: [400], category: 'script' },
  { name: 'Yellowtail', weights: [400], category: 'script' },
  { name: 'Kaushan Script', weights: [400], category: 'script' },
  { name: 'Caveat', weights: range(400, 700), category: 'script' },
  { name: 'Permanent Marker', weights: [400], category: 'script' },
  { name: 'Shadows Into Light', weights: [400], category: 'script' },
  { name: 'Amatic SC', weights: [400, 700], category: 'script' },
  { name: 'Source Code Pro', weights: range(300, 900), category: 'mono' },
  { name: 'Space Mono', weights: [400, 700], category: 'mono' },
  { name: 'Mukta', weights: range(300, 800), category: 'devanagari' },
  { name: 'Hind', weights: range(300, 700), category: 'devanagari' },
  { name: 'Noto Sans Devanagari', weights: range(300, 900), category: 'devanagari' },
  { name: 'Martel', weights: [300, 400, 600, 700, 800, 900], category: 'devanagari' },
  { name: 'Kalam', weights: [300, 400, 700], category: 'devanagari' },
  { name: 'Rozha One', weights: [400], category: 'devanagari' },
  { name: 'Yatra One', weights: [400], category: 'devanagari' },
  { name: 'Arial', weights: [400, 700], category: 'system' },
  { name: 'Georgia', weights: [400, 700], category: 'system' },
  { name: 'Times New Roman', weights: [400, 700], category: 'system' },
  { name: 'Courier New', weights: [400, 700], category: 'system' },
  { name: 'Impact', weights: [400], category: 'system' },
  { name: 'Verdana', weights: [400, 700], category: 'system' },
];

export const FONT_CATEGORIES: { id: FontDef['category']; label: string }[] = [
  { id: 'sans', label: 'Sans Serif' },
  { id: 'serif', label: 'Serif' },
  { id: 'display', label: 'Display' },
  { id: 'script', label: 'Handwriting' },
  { id: 'mono', label: 'Monospace' },
  { id: 'devanagari', label: 'Devanagari (नेपाली / हिन्दी)' },
  { id: 'system', label: 'System' },
];

const fontByName = new Map(FONTS.map((f) => [f.name, f]));
export const getFont = (name: string) => fontByName.get(name);

const loaded = new Map<string, Promise<void>>();
const listeners = new Set<() => void>();
export const onFontsChanged = (fn: () => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

function notify() {
  bumpFontEpoch();
  listeners.forEach((fn) => fn());
}

function addStylesheet(href: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.onload = () => resolve();
    link.onerror = () => {
      link.remove();
      reject(new Error('font css failed'));
    };
    document.head.appendChild(link);
  });
}

/** Loads a Google font (all of its weights). Resolves once the faces are usable. */
export function loadFont(name: string): Promise<void> {
  const def = fontByName.get(name);
  if (!def || def.category === 'system') return Promise.resolve();
  const existing = loaded.get(name);
  if (existing) return existing;
  const fam = encodeURIComponent(name).replace(/%20/g, '+');
  const p = (async () => {
    try {
      await addStylesheet(`https://fonts.googleapis.com/css2?family=${fam}:wght@${def.weights.join(';')}&display=swap`);
    } catch {
      try {
        await addStylesheet(`https://fonts.googleapis.com/css2?family=${fam}&display=swap`);
      } catch {
        return;
      }
    }
    try {
      await Promise.all(def.weights.map((w) => document.fonts.load(`${w} 32px "${name}"`)));
    } catch {
      /* ignore */
    }
    notify();
  })();
  loaded.set(name, p);
  return p;
}

export const loadFonts = (names: Iterable<string>) => Promise.all([...new Set(names)].map(loadFont));

export const isFontLoaded = (name: string) => loaded.has(name);

if (typeof document !== 'undefined' && document.fonts) {
  document.fonts.addEventListener?.('loadingdone', () => notify());
}
