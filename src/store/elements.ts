import {
  Heart as iHeart,
  Star as iStar,
  Sun as iSun,
  Moon as iMoon,
  Cloud as iCloud,
  CloudRain as iCloudRain,
  Rainbow as iRainbow,
  Sunrise as iSunrise,
  Snowflake as iSnowflake,
  Umbrella as iUmbrella,
  Zap as iZap,
  Flame as iFlame,
  Droplet as iDroplet,
  Waves as iWaves,
  Leaf as iLeaf,
  Flower2 as iFlower2,
  Sprout as iSprout,
  TreePine as iTreePine,
  Mountain as iMountain,
  Tent as iTent,
  Compass as iCompass,
  Anchor as iAnchor,
  Globe as iGlobe,
  MapPin as iMapPin,
  Plane as iPlane,
  Car as iCar,
  Bus as iBus,
  Train as iTrain,
  Ship as iShip,
  Bike as iBike,
  Rocket as iRocket,
  House as iHouse,
  Building2 as iBuilding2,
  Store as iStore,
  School as iSchool,
  Hospital as iHospital,
  Camera as iCamera,
  Image as iImage,
  Video as iVideo,
  Film as iFilm,
  Music as iMusic,
  Mic as iMic,
  Headphones as iHeadphones,
  Guitar as iGuitar,
  Piano as iPiano,
  Ticket as iTicket,
  Popcorn as iPopcorn,
  PartyPopper as iPartyPopper,
  Gift as iGift,
  Cake as iCake,
  Coffee as iCoffee,
  Pizza as iPizza,
  Apple as iApple,
  Cherry as iCherry,
  Banana as iBanana,
  Grape as iGrape,
  Carrot as iCarrot,
  Salad as iSalad,
  Soup as iSoup,
  Sandwich as iSandwich,
  IceCreamCone as iIceCreamCone,
  Cookie as iCookie,
  Croissant as iCroissant,
  Egg as iEgg,
  CupSoda as iCupSoda,
  Beer as iBeer,
  Wine as iWine,
  Martini as iMartini,
  Candy as iCandy,
  Utensils as iUtensils,
  ShoppingCart as iShoppingCart,
  ShoppingBag as iShoppingBag,
  Tag as iTag,
  Percent as iPercent,
  DollarSign as iDollarSign,
  Package as iPackage,
  Truck as iTruck,
  Briefcase as iBriefcase,
  GraduationCap as iGraduationCap,
  Book as iBook,
  Bookmark as iBookmark,
  Lightbulb as iLightbulb,
  Award as iAward,
  Trophy as iTrophy,
  Medal as iMedal,
  Crown as iCrown,
  Gem as iGem,
  Diamond as iDiamond,
  Sparkles as iSparkles,
  Target as iTarget,
  Flag as iFlag,
  Megaphone as iMegaphone,
  Bell as iBell,
  Calendar as iCalendar,
  Clock as iClock,
  Watch as iWatch,
  User as iUser,
  Users as iUsers,
  Baby as iBaby,
  Smile as iSmile,
  Laugh as iLaugh,
  ThumbsUp as iThumbsUp,
  HandHeart as iHandHeart,
  HeartHandshake as iHeartHandshake,
  MessageCircle as iMessageCircle,
  Send as iSend,
  Mail as iMail,
  Phone as iPhone,
  AtSign as iAtSign,
  Hash as iHash,
  Link as iLink,
  Search as iSearch,
  Eye as iEye,
  Lock as iLock,
  Key as iKey,
  Shield as iShield,
  Wifi as iWifi,
  Settings as iSettings,
  Palette as iPalette,
  Brush as iBrush,
  PenTool as iPenTool,
  Scissors as iScissors,
  Feather as iFeather,
  Wand2 as iWand2,
  Puzzle as iPuzzle,
  Gamepad2 as iGamepad2,
  Dumbbell as iDumbbell,
  Stethoscope as iStethoscope,
  Pill as iPill,
  Recycle as iRecycle,
  Dog as iDog,
  Cat as iCat,
  Bird as iBird,
  Fish as iFish,
  PawPrint as iPawPrint,
  Bone as iBone,
  Footprints as iFootprints,
  Shirt as iShirt,
  Glasses as iGlasses,
  Check as iCheck,
  X as iX,
  Plus as iPlus,
  ArrowRight as iArrowRight,
  ArrowLeft as iArrowLeft,
  ArrowUp as iArrowUp,
  ArrowDown as iArrowDown,
  ChevronRight as iChevronRight,
  Play as iPlay,
  Pause as iPause,
  Infinity as iInfinity,
  Quote as iQuote,
  Download as iDownload,
  Share2 as iShare2,
} from 'lucide';
import { createShapeLayer, createTextLayer } from '../engine/document';
import { linear, radial, solid } from '../engine/fill';
import { loadFont } from '../engine/fonts';
import type { Pt } from '../engine/geometry';
import type { Fill, Layer, RasterLayer, ShapeKind, TextLayer } from '../engine/types';
import { createCanvas, ctx2d, loadImage, uid } from '../engine/util';
import { S, commit, setS, toast, withBusy } from './editor';
import { addLayer, addLayers } from './layers';

/* --------------------------------- Shapes --------------------------------- */

export interface ShapeElement {
  id: string;
  shape: ShapeKind;
  fill: Fill | null;
  stroke?: string;
  strokeWidth?: number;
  radius?: number;
  dash?: number;
  aspect?: number;
  sides?: number;
}

export const SHAPE_ELEMENTS: ShapeElement[] = [
  { id: 'rect', shape: 'rect', fill: solid('#7c5cff') },
  { id: 'rounded', shape: 'rect', fill: solid('#ff6b8b'), radius: 40 },
  { id: 'ellipse', shape: 'ellipse', fill: solid('#22c3a6') },
  { id: 'triangle', shape: 'triangle', fill: solid('#ffb020') },
  { id: 'rtriangle', shape: 'rtriangle', fill: solid('#3d8bfd') },
  { id: 'diamond', shape: 'diamond', fill: solid('#f2545b') },
  { id: 'pentagon', shape: 'pentagon', fill: solid('#8e5cf7') },
  { id: 'hexagon', shape: 'hexagon', fill: solid('#14b8a6') },
  { id: 'octagon', shape: 'octagon', fill: solid('#e11d48') },
  { id: 'star', shape: 'star', fill: solid('#fbbf24') },
  { id: 'star4', shape: 'star4', fill: solid('#a78bfa') },
  { id: 'heart', shape: 'heart', fill: solid('#ef4444') },
  { id: 'arrow', shape: 'arrow', fill: solid('#111827'), aspect: 0.5 },
  { id: 'chevron', shape: 'chevron', fill: solid('#0ea5e9'), aspect: 0.6 },
  { id: 'cross', shape: 'cross', fill: solid('#10b981') },
  { id: 'speech', shape: 'speech', fill: solid('#f59e0b') },
  { id: 'parallelogram', shape: 'parallelogram', fill: solid('#6366f1'), aspect: 0.6 },
  { id: 'trapezoid', shape: 'trapezoid', fill: solid('#ec4899'), aspect: 0.6 },
  { id: 'ring', shape: 'ring', fill: solid('#7c5cff') },
  { id: 'moon', shape: 'moon', fill: solid('#facc15') },
  { id: 'blob', shape: 'blob', fill: linear(135, '#ff9a8b', '#ff6a88', '#ff99ac') },
  { id: 'blob2', shape: 'blob', fill: linear(45, '#a18cd1', '#fbc2eb') },
  { id: 'circle-grad', shape: 'ellipse', fill: radial('#fdfcfb', '#e2d1c3') },
  { id: 'rect-grad', shape: 'rect', fill: linear(90, '#4facfe', '#00f2fe'), radius: 24 },
  { id: 'outline-rect', shape: 'rect', fill: null, stroke: '#111827', strokeWidth: 8 },
  { id: 'outline-circle', shape: 'ellipse', fill: null, stroke: '#111827', strokeWidth: 8 },
  { id: 'line', shape: 'line', fill: null, stroke: '#111827', strokeWidth: 6 },
  { id: 'dashed', shape: 'line', fill: null, stroke: '#111827', strokeWidth: 6, dash: 2 },
  { id: 'arrowline', shape: 'arrowline', fill: null, stroke: '#111827', strokeWidth: 6 },
];

/* --------------------------------- Frames --------------------------------- */

export const FRAME_ELEMENTS: { id: string; clip: ShapeKind; radius?: number; aspect?: number }[] = [
  { id: 'f-circle', clip: 'ellipse' },
  { id: 'f-square', clip: 'rect' },
  { id: 'f-rounded', clip: 'rect', radius: 60 },
  { id: 'f-portrait', clip: 'rect', radius: 24, aspect: 1.35 },
  { id: 'f-landscape', clip: 'rect', radius: 24, aspect: 0.66 },
  { id: 'f-heart', clip: 'heart' },
  { id: 'f-star', clip: 'star' },
  { id: 'f-hexagon', clip: 'hexagon' },
  { id: 'f-blob', clip: 'blob' },
  { id: 'f-diamond', clip: 'diamond' },
  { id: 'f-triangle', clip: 'triangle' },
  { id: 'f-speech', clip: 'speech' },
];

/* ---------------------------------- Icons ---------------------------------- */

type IconNode = [string, Record<string, string | number>][];


const ICON_NODES: Record<string, IconNode> = {
  Heart: iHeart as unknown as IconNode,
  Star: iStar as unknown as IconNode,
  Sun: iSun as unknown as IconNode,
  Moon: iMoon as unknown as IconNode,
  Cloud: iCloud as unknown as IconNode,
  CloudRain: iCloudRain as unknown as IconNode,
  Rainbow: iRainbow as unknown as IconNode,
  Sunrise: iSunrise as unknown as IconNode,
  Snowflake: iSnowflake as unknown as IconNode,
  Umbrella: iUmbrella as unknown as IconNode,
  Zap: iZap as unknown as IconNode,
  Flame: iFlame as unknown as IconNode,
  Droplet: iDroplet as unknown as IconNode,
  Waves: iWaves as unknown as IconNode,
  Leaf: iLeaf as unknown as IconNode,
  Flower2: iFlower2 as unknown as IconNode,
  Sprout: iSprout as unknown as IconNode,
  TreePine: iTreePine as unknown as IconNode,
  Mountain: iMountain as unknown as IconNode,
  Tent: iTent as unknown as IconNode,
  Compass: iCompass as unknown as IconNode,
  Anchor: iAnchor as unknown as IconNode,
  Globe: iGlobe as unknown as IconNode,
  MapPin: iMapPin as unknown as IconNode,
  Plane: iPlane as unknown as IconNode,
  Car: iCar as unknown as IconNode,
  Bus: iBus as unknown as IconNode,
  Train: iTrain as unknown as IconNode,
  Ship: iShip as unknown as IconNode,
  Bike: iBike as unknown as IconNode,
  Rocket: iRocket as unknown as IconNode,
  House: iHouse as unknown as IconNode,
  Building2: iBuilding2 as unknown as IconNode,
  Store: iStore as unknown as IconNode,
  School: iSchool as unknown as IconNode,
  Hospital: iHospital as unknown as IconNode,
  Camera: iCamera as unknown as IconNode,
  Image: iImage as unknown as IconNode,
  Video: iVideo as unknown as IconNode,
  Film: iFilm as unknown as IconNode,
  Music: iMusic as unknown as IconNode,
  Mic: iMic as unknown as IconNode,
  Headphones: iHeadphones as unknown as IconNode,
  Guitar: iGuitar as unknown as IconNode,
  Piano: iPiano as unknown as IconNode,
  Ticket: iTicket as unknown as IconNode,
  Popcorn: iPopcorn as unknown as IconNode,
  PartyPopper: iPartyPopper as unknown as IconNode,
  Gift: iGift as unknown as IconNode,
  Cake: iCake as unknown as IconNode,
  Coffee: iCoffee as unknown as IconNode,
  Pizza: iPizza as unknown as IconNode,
  Apple: iApple as unknown as IconNode,
  Cherry: iCherry as unknown as IconNode,
  Banana: iBanana as unknown as IconNode,
  Grape: iGrape as unknown as IconNode,
  Carrot: iCarrot as unknown as IconNode,
  Salad: iSalad as unknown as IconNode,
  Soup: iSoup as unknown as IconNode,
  Sandwich: iSandwich as unknown as IconNode,
  IceCreamCone: iIceCreamCone as unknown as IconNode,
  Cookie: iCookie as unknown as IconNode,
  Croissant: iCroissant as unknown as IconNode,
  Egg: iEgg as unknown as IconNode,
  CupSoda: iCupSoda as unknown as IconNode,
  Beer: iBeer as unknown as IconNode,
  Wine: iWine as unknown as IconNode,
  Martini: iMartini as unknown as IconNode,
  Candy: iCandy as unknown as IconNode,
  Utensils: iUtensils as unknown as IconNode,
  ShoppingCart: iShoppingCart as unknown as IconNode,
  ShoppingBag: iShoppingBag as unknown as IconNode,
  Tag: iTag as unknown as IconNode,
  Percent: iPercent as unknown as IconNode,
  DollarSign: iDollarSign as unknown as IconNode,
  Package: iPackage as unknown as IconNode,
  Truck: iTruck as unknown as IconNode,
  Briefcase: iBriefcase as unknown as IconNode,
  GraduationCap: iGraduationCap as unknown as IconNode,
  Book: iBook as unknown as IconNode,
  Bookmark: iBookmark as unknown as IconNode,
  Lightbulb: iLightbulb as unknown as IconNode,
  Award: iAward as unknown as IconNode,
  Trophy: iTrophy as unknown as IconNode,
  Medal: iMedal as unknown as IconNode,
  Crown: iCrown as unknown as IconNode,
  Gem: iGem as unknown as IconNode,
  Diamond: iDiamond as unknown as IconNode,
  Sparkles: iSparkles as unknown as IconNode,
  Target: iTarget as unknown as IconNode,
  Flag: iFlag as unknown as IconNode,
  Megaphone: iMegaphone as unknown as IconNode,
  Bell: iBell as unknown as IconNode,
  Calendar: iCalendar as unknown as IconNode,
  Clock: iClock as unknown as IconNode,
  Watch: iWatch as unknown as IconNode,
  User: iUser as unknown as IconNode,
  Users: iUsers as unknown as IconNode,
  Baby: iBaby as unknown as IconNode,
  Smile: iSmile as unknown as IconNode,
  Laugh: iLaugh as unknown as IconNode,
  ThumbsUp: iThumbsUp as unknown as IconNode,
  HandHeart: iHandHeart as unknown as IconNode,
  HeartHandshake: iHeartHandshake as unknown as IconNode,
  MessageCircle: iMessageCircle as unknown as IconNode,
  Send: iSend as unknown as IconNode,
  Mail: iMail as unknown as IconNode,
  Phone: iPhone as unknown as IconNode,
  AtSign: iAtSign as unknown as IconNode,
  Hash: iHash as unknown as IconNode,
  Link: iLink as unknown as IconNode,
  Search: iSearch as unknown as IconNode,
  Eye: iEye as unknown as IconNode,
  Lock: iLock as unknown as IconNode,
  Key: iKey as unknown as IconNode,
  Shield: iShield as unknown as IconNode,
  Wifi: iWifi as unknown as IconNode,
  Settings: iSettings as unknown as IconNode,
  Palette: iPalette as unknown as IconNode,
  Brush: iBrush as unknown as IconNode,
  PenTool: iPenTool as unknown as IconNode,
  Scissors: iScissors as unknown as IconNode,
  Feather: iFeather as unknown as IconNode,
  Wand2: iWand2 as unknown as IconNode,
  Puzzle: iPuzzle as unknown as IconNode,
  Gamepad2: iGamepad2 as unknown as IconNode,
  Dumbbell: iDumbbell as unknown as IconNode,
  Stethoscope: iStethoscope as unknown as IconNode,
  Pill: iPill as unknown as IconNode,
  Recycle: iRecycle as unknown as IconNode,
  Dog: iDog as unknown as IconNode,
  Cat: iCat as unknown as IconNode,
  Bird: iBird as unknown as IconNode,
  Fish: iFish as unknown as IconNode,
  PawPrint: iPawPrint as unknown as IconNode,
  Bone: iBone as unknown as IconNode,
  Footprints: iFootprints as unknown as IconNode,
  Shirt: iShirt as unknown as IconNode,
  Glasses: iGlasses as unknown as IconNode,
  Check: iCheck as unknown as IconNode,
  X: iX as unknown as IconNode,
  Plus: iPlus as unknown as IconNode,
  ArrowRight: iArrowRight as unknown as IconNode,
  ArrowLeft: iArrowLeft as unknown as IconNode,
  ArrowUp: iArrowUp as unknown as IconNode,
  ArrowDown: iArrowDown as unknown as IconNode,
  ChevronRight: iChevronRight as unknown as IconNode,
  Play: iPlay as unknown as IconNode,
  Pause: iPause as unknown as IconNode,
  Infinity: iInfinity as unknown as IconNode,
  Quote: iQuote as unknown as IconNode,
  Download: iDownload as unknown as IconNode,
  Share2: iShare2 as unknown as IconNode,
};

function nodeToPath(tag: string, a: Record<string, string | number>): string {
  const n = (k: string) => Number(a[k] ?? 0);
  switch (tag) {
    case 'path':
      return String(a.d);
    case 'circle': {
      const cx = n('cx'),
        cy = n('cy'),
        r = n('r');
      return `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0Z`;
    }
    case 'ellipse': {
      const cx = n('cx'),
        cy = n('cy'),
        rx = n('rx'),
        ry = n('ry');
      return `M${cx - rx} ${cy}a${rx} ${ry} 0 1 0 ${2 * rx} 0a${rx} ${ry} 0 1 0 ${-2 * rx} 0Z`;
    }
    case 'rect': {
      const x = n('x'),
        y = n('y'),
        w = n('width'),
        h = n('height'),
        r = Math.min(n('rx') || n('ry'), w / 2, h / 2);
      if (!r) return `M${x} ${y}h${w}v${h}h${-w}Z`;
      return `M${x + r} ${y}h${w - 2 * r}a${r} ${r} 0 0 1 ${r} ${r}v${h - 2 * r}a${r} ${r} 0 0 1 ${-r} ${r}h${-(w - 2 * r)}a${r} ${r} 0 0 1 ${-r} ${-r}v${-(h - 2 * r)}a${r} ${r} 0 0 1 ${r} ${-r}Z`;
    }
    case 'line':
      return `M${n('x1')} ${n('y1')}L${n('x2')} ${n('y2')}`;
    case 'polyline':
    case 'polygon': {
      const pts = String(a.points).trim().split(/[\s,]+/).map(Number);
      let d = '';
      for (let i = 0; i < pts.length; i += 2) d += (i ? 'L' : 'M') + pts[i] + ' ' + pts[i + 1];
      return tag === 'polygon' ? d + 'Z' : d;
    }
  }
  return '';
}

export const ICONS: { name: string; path: string }[] = Object.entries(ICON_NODES)
  .map(([name, node]) => ({ name, path: node ? node.map(([tag, attrs]) => nodeToPath(tag, attrs)).join(' ') : '' }))
  .filter((i) => i.path);

/* -------------------------------- Stickers -------------------------------- */

export const STICKERS = [
  '😀', '😂', '😍', '🥳', '😎', '🤩', '😇', '🥰', '😜', '🤔', '😴', '😱', '👍', '👏', '🙌', '🙏', '💪', '👋',
  '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '💖', '✨', '⭐', '🌟', '🔥', '💯', '🎉', '🎊', '🎈', '🎁', '🏆',
  '🎂', '🍕', '🍔', '🍟', '🍩', '🍦', '☕', '🍹', '🍓', '🍉', '🌸', '🌺', '🌻', '🌹', '🌴', '🍀', '🌈', '☀️',
  '🌙', '⚡', '❄️', '🌊', '🐶', '🐱', '🦋', '🐼', '🦄', '🐝', '🚀', '✈️', '🚗', '📷', '🎵', '🎧', '📚', '💡',
  '💼', '📌', '📍', '✅', '❌', '⚠️', '💬', '📣', '🛒', '💰', '🇳🇵', '🏔️', '🕉️', '🪔', '🪁', '🎨',
];

/* ------------------------------ Text presets ------------------------------ */

export interface TextPreset {
  id: string;
  label: string;
  layers: Partial<TextLayer>[];
}

export const TEXT_PRESETS: TextPreset[] = [
  { id: 'h', label: 'Add a heading', layers: [{ text: 'Add a heading', font: 'Inter', weight: 800, sizeK: 1.6 } as Partial<TextLayer>] },
  { id: 'sh', label: 'Add a subheading', layers: [{ text: 'Add a subheading', font: 'Inter', weight: 600, sizeK: 1 } as Partial<TextLayer>] },
  { id: 'b', label: 'Add a little bit of body text', layers: [{ text: 'Add a little bit of body text', font: 'Inter', weight: 400, sizeK: 0.55 } as Partial<TextLayer>] },
];

export interface ComboPreset {
  id: string;
  preview: { font: string; weight: number; color: string; size: number; text: string; italic?: boolean; spacing?: number; upper?: boolean }[];
  bg?: string;
}

export const TEXT_COMBOS: ComboPreset[] = [
  { id: 'c1', bg: '#111', preview: [{ text: 'SUMMER', font: 'Bebas Neue', weight: 400, color: '#ffd166', size: 1.8, spacing: 6 }, { text: 'sale up to 50% off', font: 'Poppins', weight: 500, color: '#ffffff', size: 0.5 }] },
  { id: 'c2', preview: [{ text: 'Wedding', font: 'Great Vibes', weight: 400, color: '#b08968', size: 1.6 }, { text: 'SAVE THE DATE', font: 'Cinzel', weight: 600, color: '#3a3a3a', size: 0.45, spacing: 4 }] },
  { id: 'c3', preview: [{ text: 'Big Idea', font: 'Playfair Display', weight: 900, color: '#1d3557', size: 1.4 }, { text: 'A short supporting line', font: 'Lato', weight: 400, color: '#457b9d', size: 0.5 }] },
  { id: 'c4', bg: '#ff4d6d', preview: [{ text: 'HELLO!', font: 'Bangers', weight: 400, color: '#ffffff', size: 1.7, spacing: 3 }] },
  { id: 'c5', preview: [{ text: 'Grand Opening', font: 'Montserrat', weight: 800, color: '#0f172a', size: 1, upper: true, spacing: 2 }, { text: 'Join us this Saturday', font: 'Dancing Script', weight: 700, color: '#e76f51', size: 0.7 }] },
  { id: 'c6', bg: '#0b132b', preview: [{ text: 'NEON', font: 'Monoton', weight: 400, color: '#00f5d4', size: 1.5 }] },
  { id: 'c7', preview: [{ text: 'Café', font: 'Pacifico', weight: 400, color: '#6f4e37', size: 1.3 }, { text: 'FRESH · LOCAL · DAILY', font: 'Josefin Sans', weight: 600, color: '#6f4e37', size: 0.38, spacing: 3 }] },
  { id: 'c8', preview: [{ text: 'नमस्ते', font: 'Yatra One', weight: 400, color: '#d62828', size: 1.4 }, { text: 'शुभ दिन', font: 'Mukta', weight: 600, color: '#003049', size: 0.6 }] },
  { id: 'c9', preview: [{ text: 'Minimal.', font: 'Space Grotesk', weight: 700, color: '#111', size: 1.3 }, { text: 'design studio', font: 'Space Grotesk', weight: 400, color: '#666', size: 0.45 }] },
  { id: 'c10', bg: '#fef3c7', preview: [{ text: 'Thank you', font: 'Caveat', weight: 700, color: '#92400e', size: 1.5 }] },
];

/* ------------------------------ Insertion API ------------------------------ */

const doc = () => S().doc!;
const baseSize = () => Math.min(doc().width, doc().height);

export function addShapeElement(el: ShapeElement, at?: Pt) {
  const d = doc();
  const s = Math.round(baseSize() * 0.3);
  const isLine = el.shape === 'line' || el.shape === 'arrowline';
  const layer = createShapeLayer(d, el.shape, {
    fill: el.fill,
    stroke: el.stroke ?? null,
    strokeWidth: el.strokeWidth ? Math.max(2, Math.round((el.strokeWidth * baseSize()) / 1000)) : 0,
    radius: el.radius ? Math.round((el.radius * baseSize()) / 1000) : 0,
    dash: el.dash || 0,
    w: isLine ? Math.round(s * 1.3) : s,
    h: isLine ? Math.max(20, Math.round(s * 0.12)) : Math.round(s * (el.aspect || 1)),
    x: at?.x ?? d.width / 2,
    y: at?.y ?? d.height / 2,
    name: el.id[0].toUpperCase() + el.id.slice(1).replace(/-/g, ' '),
  });
  addLayer(layer, 'Add shape');
  setS({ tool: 'move' });
}

export function addIcon(icon: { name: string; path: string }, at?: Pt) {
  const d = doc();
  const s = Math.round(baseSize() * 0.22);
  const layer = createShapeLayer(d, 'icon', {
    path: icon.path,
    w: s,
    h: s,
    fill: null,
    stroke: S().fg === '#ffffff' ? '#111111' : S().fg,
    strokeWidth: 2,
    x: at?.x ?? d.width / 2,
    y: at?.y ?? d.height / 2,
    name: icon.name,
  });
  addLayer(layer, 'Add icon');
  setS({ tool: 'move' });
}

export function addSticker(emoji: string, at?: Pt) {
  const d = doc();
  const size = Math.round(baseSize() * 0.2);
  const t = createTextLayer(d, { text: emoji, size, font: 'Inter', name: 'Sticker ' + emoji, lineHeight: 1.15, x: at?.x ?? d.width / 2, y: at?.y ?? d.height / 2 });
  addLayer(t, 'Add sticker');
  setS({ tool: 'move' });
}

function placeholderCanvas(w: number, h: number) {
  const c = createCanvas(w, h);
  const ctx = ctx2d(c);
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, '#dfe3ec');
  g.addColorStop(1, '#c9cfdc');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  // A simple "image" glyph in the middle.
  const s = Math.min(w, h) * 0.22;
  ctx.translate(w / 2 - s / 2, h / 2 - s / 2);
  ctx.strokeStyle = 'rgba(80,88,110,0.55)';
  ctx.lineWidth = s * 0.07;
  ctx.lineJoin = 'round';
  ctx.strokeRect(0, 0, s, s * 0.8);
  ctx.beginPath();
  ctx.moveTo(s * 0.1, s * 0.68);
  ctx.lineTo(s * 0.4, s * 0.38);
  ctx.lineTo(s * 0.62, s * 0.58);
  ctx.lineTo(s * 0.74, s * 0.48);
  ctx.lineTo(s * 0.9, s * 0.64);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(s * 0.72, s * 0.24, s * 0.08, 0, Math.PI * 2);
  ctx.stroke();
  return c;
}

export function addFrame(f: { id: string; clip: ShapeKind; radius?: number; aspect?: number }, at?: Pt) {
  const d = doc();
  const base = 800;
  const w = base,
    h = Math.round(base * (f.aspect || 1));
  const s = (baseSize() * 0.45) / base;
  const layer: RasterLayer = {
    id: uid(),
    name: 'Frame',
    type: 'raster',
    canvas: placeholderCanvas(w, h),
    visible: true,
    locked: false,
    opacity: 1,
    blend: 'source-over',
    x: at?.x ?? d.width / 2,
    y: at?.y ?? d.height / 2,
    rotation: 0,
    scaleX: s,
    scaleY: s,
    adjust: null,
    shadow: null,
    mask: null,
    maskEnabled: true,
    clip: f.clip,
    clipRadius: f.radius ? (f.radius * base) / 400 : 0,
  };
  addLayer(layer, 'Add frame');
  setS({ tool: 'move' });
  toast('Drag a photo onto the frame to fill it');
}

/** Replaces a raster layer's pixels with an image, cropped to cover the same box. */
export async function fillFrameWithImage(layerId: string, url: string, fallback?: string) {
  await withBusy('Placing image…', async () => {
    let img: HTMLImageElement;
    try {
      img = await loadImage(url);
    } catch (e) {
      if (!fallback) {
        toast('Could not load image', 'error');
        return;
      }
      img = await loadImage(fallback);
    }
    const d = doc();
    const l = d.layers.find((x) => x.id === layerId);
    if (!l || l.type !== 'raster') return;
    const W = l.canvas.width * Math.abs(l.scaleX);
    const H = l.canvas.height * Math.abs(l.scaleY);
    const A = W / H;
    const iw = img.naturalWidth,
      ih = img.naturalHeight;
    let cw = iw,
      ch = ih;
    if (iw / ih > A) cw = ih * A;
    else ch = iw / A;
    const maxDim = Math.max(d.width, d.height) * 2;
    const k = Math.min(1, maxDim / Math.max(cw, ch));
    const c = createCanvas(cw * k, ch * k);
    const ctx = ctx2d(c);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, (iw - cw) / 2, (ih - ch) / 2, cw, ch, 0, 0, c.width, c.height);
    const next: Layer = {
      ...l,
      canvas: c,
      mask: null,
      adjust: l.clip ? l.adjust : null,
      scaleX: Math.sign(l.scaleX) * (W / c.width),
      scaleY: Math.sign(l.scaleY) * (H / c.height),
      name: l.clip ? 'Frame' : l.name,
    };
    commit('Replace image', { ...d, layers: d.layers.map((x) => (x.id === layerId ? next : x)) }, { selectedIds: [layerId] });
  });
}

export async function addTextPreset(p: TextPreset, at?: Pt) {
  const d = doc();
  const unit = baseSize() / 14;
  const layers = p.layers.map((props) => {
    const { sizeK, ...rest } = props as Partial<TextLayer> & { sizeK?: number };
    return createTextLayer(d, { ...rest, size: Math.round(unit * (sizeK || 1)), fill: solid('#111111'), x: at?.x ?? d.width / 2, y: at?.y ?? d.height / 2 });
  });
  await Promise.all(layers.map((l) => loadFont(l.font)));
  // Recompute widths after fonts load.
  const fixed = layers.map((l) => createTextLayer(d, { ...l, width: undefined }));
  fixed.forEach((l, i) => (l.id = layers[i].id));
  addLayers(fixed, 'Add text');
  setS({ tool: 'move' });
}

export async function addCombo(c: ComboPreset, at?: Pt) {
  const d = doc();
  const unit = baseSize() / 12;
  await Promise.all(c.preview.map((p) => loadFont(p.font)));
  const cx = at?.x ?? d.width / 2;
  let y = at?.y ?? d.height / 2;
  const items = c.preview.map((p) =>
    createTextLayer(d, {
      text: p.text,
      font: p.font,
      weight: p.weight,
      size: Math.round(unit * p.size),
      fill: solid(c.bg && p.color === '#111' ? '#fff' : p.color),
      letterSpacing: p.spacing ? (p.spacing * unit) / 20 : 0,
      uppercase: !!p.upper,
      italic: !!p.italic,
      x: cx,
      y: 0,
    }),
  );
  const heights = items.map((t) => t.size * t.lineHeight);
  const total = heights.reduce((a, b) => a + b, 0);
  y -= total / 2;
  items.forEach((t, i) => {
    t.y = y + heights[i] / 2;
    y += heights[i];
  });
  addLayers(items, 'Add text');
  setS({ tool: 'move' });
}

/** Handles drops of side-panel items onto the canvas. */
export function dropElement(data: { type: string; id?: string; name?: string; emoji?: string }, p: Pt) {
  switch (data.type) {
    case 'shape': {
      const el = SHAPE_ELEMENTS.find((x) => x.id === data.id);
      if (el) addShapeElement(el, p);
      break;
    }
    case 'frame': {
      const f = FRAME_ELEMENTS.find((x) => x.id === data.id);
      if (f) addFrame(f, p);
      break;
    }
    case 'icon': {
      const i = ICONS.find((x) => x.name === data.name);
      if (i) addIcon(i, p);
      break;
    }
    case 'sticker':
      if (data.emoji) addSticker(data.emoji, p);
      break;
    case 'text': {
      const t = TEXT_PRESETS.find((x) => x.id === data.id);
      if (t) addTextPreset(t, p);
      const c = TEXT_COMBOS.find((x) => x.id === data.id);
      if (c) addCombo(c, p);
      break;
    }
  }
}
