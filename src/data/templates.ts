import { createDoc, createRasterLayer, createShapeLayer, createTextLayer } from '../engine/document';
import { naturalTextWidth } from '../engine/text';
import { linear, radial, solid } from '../engine/fill';
import { loadFonts } from '../engine/fonts';
import { renderDocToCanvas } from '../engine/render';
import type { Adjust, Doc, Fill, Layer, Shadow, ShapeKind, TextLayer } from '../engine/types';
import { NEUTRAL_ADJUST } from '../engine/types';
import { createCanvas, ctx2d, loadImage } from '../engine/util';
import { ICONS } from '../store/elements';

export interface Template {
  id: string;
  name: string;
  category: string;
  width: number;
  height: number;
  build: (b: Builder) => void;
}

export const picsum = (id: number, w: number, h: number) => `https://picsum.photos/id/${id}/${Math.max(8, Math.round(w))}/${Math.max(8, Math.round(h))}`;

interface TextOpts {
  x: number;
  y: number;
  size: number;
  font?: string;
  weight?: number;
  color?: string;
  fill?: Fill;
  align?: 'left' | 'center' | 'right';
  width?: number;
  spacing?: number;
  upper?: boolean;
  italic?: boolean;
  lineHeight?: number;
  shadow?: Shadow;
  outline?: { color: string; width: number };
  bg?: { color: string; padding: number; radius: number };
  curve?: number;
  rotation?: number;
  opacity?: number;
  name?: string;
}

interface ShapeOpts {
  x: number;
  y: number;
  w: number;
  h: number;
  fill?: Fill | string | null;
  stroke?: string;
  strokeWidth?: number;
  radius?: number;
  rotation?: number;
  opacity?: number;
  shadow?: Shadow;
  dash?: number;
  sides?: number;
  inner?: number;
  blend?: Layer['blend'];
}

interface ImageOpts {
  x: number;
  y: number;
  w: number;
  h: number;
  clip?: ShapeKind;
  radius?: number;
  adjust?: Partial<Adjust>;
  stroke?: { color: string; width: number };
  shadow?: Shadow;
  rotation?: number;
  opacity?: number;
}

export class Builder {
  doc: Doc;
  pending: Promise<void>[] = [];
  fonts = new Set<string>();
  /** Text layers whose box should hug their content once fonts are loaded. */
  private autoWidth: TextLayer[] = [];
  constructor(
    w: number,
    h: number,
    name: string,
    private imgScale = 1,
  ) {
    this.doc = createDoc(w, h, name, solid('#ffffff'));
  }

  bg(fill: Fill | string) {
    this.doc.background = typeof fill === 'string' ? solid(fill) : fill;
  }

  text(text: string, o: TextOpts): TextLayer {
    const font = o.font || 'Inter';
    this.fonts.add(font);
    const t = createTextLayer(this.doc, {
      text,
      font,
      size: o.size,
      weight: o.weight ?? 400,
      fill: o.fill || solid(o.color || '#111111'),
      align: o.align || 'center',
      letterSpacing: o.spacing || 0,
      uppercase: !!o.upper,
      italic: !!o.italic,
      lineHeight: o.lineHeight ?? 1.15,
      shadow: o.shadow || null,
      outline: o.outline || null,
      background: o.bg || null,
      curve: o.curve || 0,
      rotation: o.rotation || 0,
      opacity: o.opacity ?? 1,
      x: o.x,
      y: o.y,
      width: o.width ?? Math.round(this.doc.width * 0.9),
      name: o.name,
    });
    if (o.width === undefined) this.autoWidth.push(t);
    this.doc.layers.push(t);
    return t;
  }

  shape(kind: ShapeKind, o: ShapeOpts) {
    const fill = o.fill === undefined ? solid('#000') : typeof o.fill === 'string' ? solid(o.fill) : o.fill;
    const s = createShapeLayer(this.doc, kind, {
      x: o.x,
      y: o.y,
      w: o.w,
      h: o.h,
      fill,
      stroke: o.stroke ?? null,
      strokeWidth: o.strokeWidth ?? (o.stroke ? 4 : 0),
      radius: o.radius ?? 0,
      rotation: o.rotation ?? 0,
      opacity: o.opacity ?? 1,
      shadow: o.shadow ?? null,
      dash: o.dash ?? 0,
      sides: o.sides ?? 5,
      inner: o.inner ?? 0.45,
      blend: o.blend ?? 'source-over',
    });
    this.doc.layers.push(s);
    return s;
  }

  icon(name: string, o: { x: number; y: number; size: number; color: string; width?: number; rotation?: number }) {
    const icon = ICONS.find((i) => i.name === name);
    if (!icon) return;
    const s = createShapeLayer(this.doc, 'icon', {
      x: o.x,
      y: o.y,
      w: o.size,
      h: o.size,
      fill: null,
      path: icon.path,
      stroke: o.color,
      strokeWidth: o.width ?? 2,
      rotation: o.rotation ?? 0,
      name: icon.name,
    });
    this.doc.layers.push(s);
  }

  image(id: number, o: ImageOpts) {
    const pw = Math.max(8, Math.round(o.w * this.imgScale));
    const ph = Math.max(8, Math.round(o.h * this.imgScale));
    const placeholder = createCanvas(pw, ph);
    const pctx = ctx2d(placeholder);
    pctx.fillStyle = '#cfd5e1';
    pctx.fillRect(0, 0, pw, ph);
    const l = createRasterLayer(placeholder, o.x, o.y, 'Photo');
    l.scaleX = o.w / pw;
    l.scaleY = o.h / ph;
    l.clip = o.clip || null;
    l.clipRadius = o.radius ? o.radius / (o.w / pw) : 0;
    l.frameStroke = o.stroke ? { color: o.stroke.color, width: o.stroke.width / (o.w / pw) } : null;
    l.adjust = o.adjust ? { ...NEUTRAL_ADJUST, ...o.adjust } : null;
    l.shadow = o.shadow || null;
    l.rotation = o.rotation || 0;
    l.opacity = o.opacity ?? 1;
    this.doc.layers.push(l);
    this.pending.push(
      loadImage(picsum(id, pw, ph))
        .then((img) => {
          // Draw into the placeholder so documents built before the photo arrived update too.
          const ctx = ctx2d(placeholder);
          ctx.clearRect(0, 0, pw, ph);
          ctx.drawImage(img, 0, 0, pw, ph);
          this.onImage?.(placeholder);
        })
        .catch(() => {}),
    );
  }

  /** Called when a photo finishes loading after `finish()` returned early. */
  onImage?: (canvas: HTMLCanvasElement) => void;

  /** Resolves when fonts are ready and photos have loaded (or `maxWait` ms passed). */
  async finish(maxWait = Infinity): Promise<Doc> {
    const images = Promise.all(this.pending);
    await loadFonts(this.fonts);
    // Hug the text now that real font metrics are available; left/right aligned boxes keep their anchor edge.
    for (const t of this.autoWidth) {
      const w = Math.min(naturalTextWidth(t), this.doc.width * 0.95);
      if (t.align === 'left') t.x -= (t.width - w) / 2;
      else if (t.align === 'right') t.x += (t.width - w) / 2;
      t.width = w;
    }
    if (maxWait === Infinity) await images;
    else await Promise.race([images, new Promise((r) => setTimeout(r, maxWait))]);
    return this.doc;
  }
}

const sh = (color = 'rgba(0,0,0,0.35)', blur = 24, y = 8, x = 0, opacity = 1): Shadow => ({ color, blur, x, y, opacity });

export const TEMPLATES: Template[] = [
  {
    id: 'ig-coffee',
    name: 'Coffee Promo',
    category: 'Instagram Post',
    width: 1080,
    height: 1080,
    build: (b) => {
      b.image(431, { x: 540, y: 540, w: 1080, h: 1080 });
      b.shape('rect', { x: 540, y: 540, w: 1080, h: 1080, fill: linear(180, 'rgba(20,12,6,0.05)', 'rgba(20,12,6,0.85)') });
      b.text('Fresh Brew\nFriday', { x: 540, y: 700, size: 120, font: 'Playfair Display', weight: 900, color: '#fff5e6', lineHeight: 1.0 });
      b.text('20% OFF ALL LATTES', { x: 540, y: 880, size: 34, font: 'Montserrat', weight: 700, color: '#2b1a0e', spacing: 4, bg: { color: '#ffd59e', padding: 22, radius: 40 } });
      b.text('THE DAILY GRIND · CAFÉ', { x: 540, y: 110, size: 26, font: 'Montserrat', weight: 600, color: '#fff5e6', spacing: 8 });
    },
  },
  {
    id: 'ig-sale',
    name: 'Summer Sale',
    category: 'Instagram Post',
    width: 1080,
    height: 1080,
    build: (b) => {
      b.bg(linear(135, '#ffe259', '#ffa751'));
      b.shape('ellipse', { x: 900, y: 170, w: 420, h: 420, fill: 'rgba(255,255,255,0.35)' });
      b.shape('ellipse', { x: 140, y: 930, w: 520, h: 520, fill: 'rgba(255,92,138,0.35)' });
      b.shape('star4', { x: 200, y: 230, w: 90, h: 90, fill: '#ffffff' });
      b.shape('star4', { x: 880, y: 820, w: 70, h: 70, fill: '#ffffff' });
      b.text('SUMMER', { x: 540, y: 400, size: 230, font: 'Bebas Neue', color: '#ff3d6e', spacing: 6, shadow: sh('rgba(160,40,0,0.35)', 0, 10, 8) });
      b.text('SALE', { x: 540, y: 600, size: 230, font: 'Bebas Neue', color: '#ffffff', spacing: 6, shadow: sh('rgba(160,40,0,0.35)', 0, 10, 8) });
      b.text('UP TO 50% OFF', { x: 540, y: 790, size: 48, font: 'Poppins', weight: 800, color: '#ffffff', spacing: 2, bg: { color: '#ff3d6e', padding: 26, radius: 50 } });
      b.text('shop now · limited time', { x: 540, y: 905, size: 30, font: 'Poppins', weight: 500, color: '#7a3b00' });
    },
  },
  {
    id: 'ig-quote',
    name: 'Inspirational Quote',
    category: 'Instagram Post',
    width: 1080,
    height: 1080,
    build: (b) => {
      b.bg('#f6efe7');
      b.shape('rect', { x: 540, y: 540, w: 920, h: 920, fill: null, stroke: '#c9a27e', strokeWidth: 4 });
      b.icon('Quote', { x: 540, y: 260, size: 120, color: '#c9a27e', width: 1.6 });
      b.text('The best way to predict the future is to create it.', { x: 540, y: 540, size: 72, font: 'Playfair Display', weight: 700, italic: true, color: '#3d2c22', width: 760, lineHeight: 1.25 });
      b.shape('line', { x: 540, y: 760, w: 120, h: 20, fill: null, stroke: '#c9a27e', strokeWidth: 4 });
      b.text('PETER DRUCKER', { x: 540, y: 830, size: 30, font: 'Montserrat', weight: 600, color: '#8a6a52', spacing: 6 });
    },
  },
  {
    id: 'ig-travel',
    name: 'Travel Postcard',
    category: 'Instagram Post',
    width: 1080,
    height: 1080,
    build: (b) => {
      b.bg('#ffffff');
      b.image(1015, { x: 540, y: 470, w: 1000, h: 860, adjust: { saturation: 15, contrast: 8 } });
      b.text('EXPLORE', { x: 540, y: 330, size: 170, font: 'Anton', color: '#ffffff', spacing: 18, shadow: sh('rgba(0,0,0,0.35)', 30, 6) });
      b.text('Norway', { x: 540, y: 470, size: 130, font: 'Great Vibes', color: '#ffffff', shadow: sh('rgba(0,0,0,0.4)', 20, 4) });
      b.text('@wanderlust.diaries', { x: 540, y: 980, size: 34, font: 'Poppins', weight: 600, color: '#1d3557' });
      b.icon('MapPin', { x: 290, y: 980, size: 46, color: '#e63946', width: 2.2 });
    },
  },
  {
    id: 'ig-food',
    name: 'Recipe of the Day',
    category: 'Instagram Post',
    width: 1080,
    height: 1080,
    build: (b) => {
      b.bg('#fdf3e1');
      b.shape('blob', { x: 330, y: 560, w: 720, h: 720, fill: '#f7d9a8', rotation: -10 });
      b.image(488, { x: 340, y: 560, w: 600, h: 600, clip: 'ellipse', shadow: sh('rgba(90,50,0,0.35)', 40, 16) });
      b.text('RECIPE OF THE DAY', { x: 780, y: 300, size: 30, font: 'Montserrat', weight: 700, color: '#e76f51', spacing: 4, width: 520 });
      b.text('Rainbow\nBuddha\nBowl', { x: 800, y: 520, size: 96, font: 'DM Serif Display', color: '#264653', lineHeight: 1.0, width: 480, align: 'left' });
      b.text('15 min · vegan · 420 kcal', { x: 800, y: 760, size: 30, font: 'Poppins', weight: 500, color: '#2a9d8f', width: 480, align: 'left' });
      b.icon('Utensils', { x: 950, y: 140, size: 70, color: '#e76f51' });
    },
  },
  {
    id: 'ig-pet',
    name: 'Adopt a Pet',
    category: 'Instagram Post',
    width: 1080,
    height: 1080,
    build: (b) => {
      b.bg('#ffe8d6');
      b.image(237, { x: 540, y: 470, w: 760, h: 760, clip: 'rect', radius: 60, stroke: { color: '#ffffff', width: 18 }, shadow: sh('rgba(120,60,20,0.3)', 40, 18) });
      b.text("Adopt, don't shop", { x: 540, y: 950, size: 84, font: 'Pacifico', color: '#6b3e26' });
      b.shape('heart', { x: 880, y: 140, w: 110, h: 100, fill: '#ff6b6b', rotation: 14 });
      b.icon('PawPrint', { x: 170, y: 150, size: 110, color: '#6b3e26', width: 1.6, rotation: -18 });
    },
  },
  {
    id: 'story-post',
    name: 'New Post Alert',
    category: 'Instagram Story',
    width: 1080,
    height: 1920,
    build: (b) => {
      b.bg(linear(160, '#a18cd1', '#fbc2eb'));
      b.shape('ellipse', { x: 900, y: 260, w: 400, h: 400, fill: 'rgba(255,255,255,0.25)' });
      b.shape('ellipse', { x: 120, y: 1700, w: 500, h: 500, fill: 'rgba(255,255,255,0.25)' });
      b.text('NEW POST', { x: 540, y: 300, size: 150, font: 'Bebas Neue', color: '#ffffff', spacing: 10, shadow: sh('rgba(80,40,120,0.35)', 20, 8) });
      b.image(64, { x: 540, y: 960, w: 780, h: 980, clip: 'rect', radius: 60, stroke: { color: '#ffffff', width: 20 }, shadow: sh('rgba(80,40,120,0.4)', 50, 20), rotation: -3 });
      b.text('Tap to see more', { x: 540, y: 1600, size: 56, font: 'Poppins', weight: 700, color: '#5b2a86', bg: { color: '#ffffff', padding: 30, radius: 60 } });
      b.icon('ArrowUp', { x: 540, y: 1760, size: 80, color: '#ffffff', width: 2.5 });
    },
  },
  {
    id: 'story-travel',
    name: 'Travel Diary',
    category: 'Instagram Story',
    width: 1080,
    height: 1920,
    build: (b) => {
      b.image(1011, { x: 540, y: 960, w: 1080, h: 1920, adjust: { contrast: 10, saturation: 10 } });
      b.shape('rect', { x: 540, y: 1500, w: 1080, h: 840, fill: linear(180, 'rgba(0,30,40,0)', 'rgba(0,30,40,0.85)') });
      b.text('travel diary', { x: 540, y: 1430, size: 120, font: 'Great Vibes', color: '#ffffff' });
      b.text('DAY 07 · LAKE MORAINE', { x: 540, y: 1590, size: 44, font: 'Montserrat', weight: 700, color: '#bdf5ff', spacing: 8 });
      b.shape('line', { x: 540, y: 1680, w: 200, h: 20, fill: null, stroke: '#ffffff', strokeWidth: 4 });
      b.text('Some places steal your breath.', { x: 540, y: 1760, size: 40, font: 'Lora', italic: true, color: '#ffffff', width: 900 });
    },
  },
  {
    id: 'yt-adventure',
    name: 'Adventure Vlog',
    category: 'YouTube Thumbnail',
    width: 1280,
    height: 720,
    build: (b) => {
      b.image(1035, { x: 640, y: 360, w: 1280, h: 720, adjust: { contrast: 18, saturation: 25 } });
      b.shape('rect', { x: 330, y: 360, w: 660, h: 720, fill: linear(90, 'rgba(0,0,0,0.75)', 'rgba(0,0,0,0)') });
      b.text('MY BIGGEST\nADVENTURE', { x: 330, y: 300, size: 110, font: 'Anton', color: '#ffe600', lineHeight: 1.0, width: 600, align: 'left', outline: { color: '#111111', width: 6 }, shadow: sh('rgba(0,0,0,0.6)', 10, 8, 6) });
      b.text('ICELAND 4K', { x: 220, y: 520, size: 56, font: 'Poppins', weight: 800, color: '#ffffff', bg: { color: '#ff0033', padding: 20, radius: 14 }, rotation: -4 });
      b.shape('arrowline', { x: 860, y: 520, w: 260, h: 60, fill: null, stroke: '#ff0033', strokeWidth: 16, rotation: -35 });
    },
  },
  {
    id: 'yt-tech',
    name: 'Tech Review',
    category: 'YouTube Thumbnail',
    width: 1280,
    height: 720,
    build: (b) => {
      b.bg(linear(120, '#0f0c29', '#302b63', '#24243e'));
      b.image(48, { x: 900, y: 380, w: 640, h: 520, clip: 'rect', radius: 40, rotation: 6, shadow: sh('rgba(0,240,255,0.5)', 60, 0) });
      b.text('TOP 5', { x: 330, y: 230, size: 170, font: 'Russo One', color: '#00f0ff', shadow: sh('rgba(0,240,255,0.8)', 40, 0) });
      b.text('GADGETS\nOF 2026', { x: 330, y: 470, size: 92, font: 'Russo One', color: '#ffffff', lineHeight: 1.05 });
      b.shape('rect', { x: 330, y: 640, w: 380, h: 12, fill: linear(90, '#00f0ff', '#ff00e5'), radius: 6 });
    },
  },
  {
    id: 'poster-festival',
    name: 'Music Festival',
    category: 'Poster',
    width: 1240,
    height: 1754,
    build: (b) => {
      b.bg(linear(180, '#12002f', '#5b0060', '#ff4e50'));
      b.shape('ellipse', { x: 620, y: 760, w: 900, h: 900, fill: radial('#ffd76a', '#ff7e5f', 'rgba(255,126,95,0)') });
      for (let i = 0; i < 6; i++) b.shape('rect', { x: 620, y: 860 + i * 70, w: 1240, h: 26, fill: '#12002f', opacity: 0.85 });
      b.text('SUNSET', { x: 620, y: 300, size: 210, font: 'Monoton', color: '#ffd76a', spacing: 4 });
      b.text('BEATS FESTIVAL', { x: 620, y: 470, size: 74, font: 'Montserrat', weight: 800, color: '#ffffff', spacing: 16 });
      b.text('DJ AURORA · THE NEON KIDS · LUNA PARK\nVELVET ECHO · MIDNIGHT TAPE', { x: 620, y: 1360, size: 44, font: 'Montserrat', weight: 600, color: '#ffffff', lineHeight: 1.6, width: 1100 });
      b.text('AUG 24–26 · RIVERSIDE PARK', { x: 620, y: 1560, size: 52, font: 'Bebas Neue', color: '#12002f', spacing: 6, bg: { color: '#ffd76a', padding: 26, radius: 8 } });
    },
  },
  {
    id: 'poster-opening',
    name: 'Grand Opening',
    category: 'Poster',
    width: 1240,
    height: 1754,
    build: (b) => {
      b.bg('#0e1b2c');
      b.image(1060, { x: 620, y: 640, w: 1240, h: 1280, adjust: { brightness: -10 } });
      b.shape('rect', { x: 620, y: 640, w: 1240, h: 1280, fill: linear(180, 'rgba(14,27,44,0)', 'rgba(14,27,44,1)') });
      b.text('GRAND', { x: 620, y: 1120, size: 200, font: 'Cinzel', weight: 900, color: '#e9c46a', spacing: 12 });
      b.text('OPENING', { x: 620, y: 1300, size: 120, font: 'Cinzel', weight: 700, color: '#ffffff', spacing: 24 });
      b.text('Saturday · 10 AM · Main Street 42', { x: 620, y: 1480, size: 44, font: 'Lato', weight: 400, color: '#e9c46a' });
      b.text('free coffee for the first 100 guests', { x: 620, y: 1600, size: 52, font: 'Dancing Script', weight: 700, color: '#ffffff' });
    },
  },
  {
    id: 'pres-title',
    name: 'Pitch Deck Title',
    category: 'Presentation',
    width: 1920,
    height: 1080,
    build: (b) => {
      b.bg('#f8f9fc');
      b.image(1067, { x: 1440, y: 540, w: 960, h: 1080 });
      b.shape('rect', { x: 980, y: 540, w: 40, h: 1080, fill: '#4f46e5' });
      b.text('Q4 2026', { x: 160, y: 300, size: 40, font: 'Space Grotesk', weight: 700, color: '#4f46e5', align: 'left', width: 700, spacing: 4 });
      b.text('Building the\nfuture of cities', { x: 160, y: 500, size: 110, font: 'Space Grotesk', weight: 700, color: '#0f172a', align: 'left', width: 820, lineHeight: 1.05 });
      b.text('Investor presentation · Northwind Labs', { x: 160, y: 720, size: 36, font: 'Inter', weight: 400, color: '#64748b', align: 'left', width: 820 });
      b.shape('rect', { x: 230, y: 860, w: 140, h: 10, fill: '#4f46e5', radius: 5 });
    },
  },
  {
    id: 'logo-badge',
    name: 'Mountain Badge Logo',
    category: 'Logo',
    width: 1000,
    height: 1000,
    build: (b) => {
      b.bg('#ffffff');
      b.shape('ellipse', { x: 500, y: 500, w: 760, h: 760, fill: '#1b4332' });
      b.shape('ellipse', { x: 500, y: 500, w: 700, h: 700, fill: null, stroke: '#d8f3dc', strokeWidth: 6, dash: 1.5 });
      b.shape('triangle', { x: 430, y: 470, w: 330, h: 260, fill: '#95d5b2' });
      b.shape('triangle', { x: 590, y: 500, w: 260, h: 200, fill: '#d8f3dc' });
      b.shape('ellipse', { x: 640, y: 330, w: 80, h: 80, fill: '#ffd166' });
      b.text('NORTH PEAK', { x: 500, y: 680, size: 72, font: 'Bebas Neue', color: '#ffffff', spacing: 8 });
      b.text('OUTDOOR CO. · EST 2026', { x: 500, y: 755, size: 26, font: 'Montserrat', weight: 600, color: '#95d5b2', spacing: 4 });
    },
  },
  {
    id: 'card-business',
    name: 'Business Card',
    category: 'Business Card',
    width: 1050,
    height: 600,
    build: (b) => {
      b.bg('#111827');
      b.shape('rect', { x: 860, y: 300, w: 380, h: 600, fill: linear(160, '#f59e0b', '#ef4444') });
      b.shape('ellipse', { x: 860, y: 300, w: 200, h: 200, fill: 'rgba(255,255,255,0.15)' });
      b.icon('Sparkles', { x: 860, y: 300, size: 110, color: '#ffffff', width: 1.6 });
      b.text('Aarav Sharma', { x: 90, y: 200, size: 62, font: 'Poppins', weight: 700, color: '#ffffff', align: 'left', width: 560 });
      b.text('Creative Director', { x: 90, y: 265, size: 30, font: 'Poppins', weight: 400, color: '#f59e0b', align: 'left', width: 560 });
      b.text('+977 98XXXXXXXX\nhello@studio.com\nwww.studio.com', { x: 90, y: 420, size: 26, font: 'Inter', weight: 400, color: '#d1d5db', align: 'left', width: 560, lineHeight: 1.6 });
    },
  },
  {
    id: 'invite-wedding',
    name: 'Wedding Invitation',
    category: 'Invitation',
    width: 1500,
    height: 2100,
    build: (b) => {
      b.bg('#fbf7f2');
      b.shape('rect', { x: 750, y: 1050, w: 1360, h: 1960, fill: null, stroke: '#c8a97e', strokeWidth: 4 });
      b.shape('rect', { x: 750, y: 1050, w: 1320, h: 1920, fill: null, stroke: '#c8a97e', strokeWidth: 2 });
      b.image(106, { x: 750, y: 520, w: 520, h: 520, clip: 'ellipse', stroke: { color: '#c8a97e', width: 10 } });
      b.text('TOGETHER WITH THEIR FAMILIES', { x: 750, y: 920, size: 34, font: 'Cinzel', weight: 600, color: '#8b6f47', spacing: 6 });
      b.text('Maya & Rohan', { x: 750, y: 1100, size: 170, font: 'Great Vibes', color: '#5c4630' });
      b.text('request the pleasure of your company\nat the celebration of their marriage', { x: 750, y: 1330, size: 44, font: 'Cormorant Garamond', italic: true, color: '#5c4630', lineHeight: 1.4, width: 1100 });
      b.text('SATURDAY, 14 NOVEMBER 2026', { x: 750, y: 1550, size: 46, font: 'Cinzel', weight: 700, color: '#8b6f47', spacing: 4 });
      b.text('Hotel Annapurna · Kathmandu', { x: 750, y: 1650, size: 42, font: 'Cormorant Garamond', color: '#5c4630' });
      b.shape('heart', { x: 750, y: 1800, w: 60, h: 54, fill: '#c8a97e' });
    },
  },
  {
    id: 'greet-tihar',
    name: 'शुभ दीपावली',
    category: 'Greeting',
    width: 1080,
    height: 1080,
    build: (b) => {
      b.bg(radial('#4a1a6b', '#1a0626'));
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * Math.PI * 2;
        b.shape('star4', { x: 540 + Math.cos(a) * 430, y: 540 + Math.sin(a) * 430, w: 26 + (i % 3) * 12, h: 26 + (i % 3) * 12, fill: '#ffd166', opacity: 0.8 });
      }
      b.shape('ellipse', { x: 540, y: 560, w: 640, h: 640, fill: radial('rgba(255,180,60,0.45)', 'rgba(255,180,60,0)') });
      b.text('शुभ दीपावली', { x: 540, y: 380, size: 120, font: 'Yatra One', color: '#ffd166', shadow: sh('rgba(255,160,0,0.7)', 30, 0) });
      b.text('🪔', { x: 540, y: 600, size: 200 });
      b.text('तपाईं र तपाईंको परिवारलाई तिहारको हार्दिक शुभकामना', { x: 540, y: 820, size: 46, font: 'Mukta', weight: 600, color: '#ffffff', width: 860, lineHeight: 1.3 });
      b.text('HAPPY TIHAR', { x: 540, y: 960, size: 34, font: 'Montserrat', weight: 700, color: '#ffd166', spacing: 10 });
    },
  },
  {
    id: 'fb-event',
    name: 'Event Cover',
    category: 'Facebook Cover',
    width: 1640,
    height: 624,
    build: (b) => {
      b.bg(linear(90, '#11998e', '#38ef7d'));
      b.image(1043, { x: 1250, y: 312, w: 780, h: 624, clip: 'parallelogram' });
      b.text('Weekend Hike Club', { x: 470, y: 230, size: 84, font: 'Poppins', weight: 800, color: '#ffffff', width: 860 });
      b.text('Join 2,000+ nature lovers every Saturday', { x: 470, y: 340, size: 38, font: 'Poppins', weight: 500, color: '#eafff4', width: 860 });
      b.text('JOIN FREE', { x: 470, y: 460, size: 34, font: 'Montserrat', weight: 800, color: '#11998e', spacing: 4, bg: { color: '#ffffff', padding: 22, radius: 40 } });
      b.icon('Mountain', { x: 120, y: 110, size: 80, color: '#ffffff', width: 2 });
    },
  },
];

export const TEMPLATE_CATEGORIES = [...new Set(TEMPLATES.map((t) => t.category))];

export async function buildTemplate(t: Template, imgScale = 1, opts: { maxWait?: number; onImage?: (c: HTMLCanvasElement) => void } = {}): Promise<Doc> {
  const b = new Builder(t.width, t.height, t.name, imgScale);
  b.onImage = opts.onImage;
  t.build(b);
  return b.finish(opts.maxWait);
}

const thumbCache = new Map<string, Promise<string>>();

/** Renders a template preview (data URL) at the given width. */
export function templateThumb(t: Template, width = 280): Promise<string> {
  const key = t.id + '@' + width;
  let p = thumbCache.get(key);
  if (!p) {
    p = (async () => {
      const scale = width / t.width;
      const doc = await buildTemplate(t, Math.min(1, scale * 1.5));
      const c = renderDocToCanvas(doc, scale);
      return c.toDataURL('image/jpeg', 0.85);
    })();
    thumbCache.set(key, p);
  }
  return p;
}
