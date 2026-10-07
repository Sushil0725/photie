export type BlendMode =
  | 'source-over'
  | 'multiply'
  | 'screen'
  | 'overlay'
  | 'darken'
  | 'lighten'
  | 'color-dodge'
  | 'color-burn'
  | 'hard-light'
  | 'soft-light'
  | 'difference'
  | 'exclusion'
  | 'hue'
  | 'saturation'
  | 'color'
  | 'luminosity';

export const BLEND_MODES: { value: BlendMode; label: string }[] = [
  { value: 'source-over', label: 'Normal' },
  { value: 'multiply', label: 'Multiply' },
  { value: 'screen', label: 'Screen' },
  { value: 'overlay', label: 'Overlay' },
  { value: 'darken', label: 'Darken' },
  { value: 'lighten', label: 'Lighten' },
  { value: 'color-dodge', label: 'Color Dodge' },
  { value: 'color-burn', label: 'Color Burn' },
  { value: 'hard-light', label: 'Hard Light' },
  { value: 'soft-light', label: 'Soft Light' },
  { value: 'difference', label: 'Difference' },
  { value: 'exclusion', label: 'Exclusion' },
  { value: 'hue', label: 'Hue' },
  { value: 'saturation', label: 'Saturation' },
  { value: 'color', label: 'Color' },
  { value: 'luminosity', label: 'Luminosity' },
];

export interface GradientStop {
  offset: number;
  color: string;
}

export type Fill =
  | { type: 'solid'; color: string }
  | { type: 'linear'; angle: number; stops: GradientStop[] }
  | { type: 'radial'; stops: GradientStop[] };

export interface Shadow {
  color: string;
  blur: number;
  x: number;
  y: number;
  opacity: number;
}

export interface Outline {
  color: string;
  width: number;
}

/** Non-destructive per-layer adjustments. All values are 0 when neutral. */
export interface Adjust {
  brightness: number; // -100..100
  contrast: number; // -100..100
  saturation: number; // -100..100
  hue: number; // -180..180
  temperature: number; // -100..100
  tint: number; // -100..100
  blur: number; // 0..100 (px in layer space)
  vignette: number; // 0..100
  grayscale: number; // 0..100
  sepia: number; // 0..100
  invert: number; // 0..100
}

export const NEUTRAL_ADJUST: Adjust = {
  brightness: 0,
  contrast: 0,
  saturation: 0,
  hue: 0,
  temperature: 0,
  tint: 0,
  blur: 0,
  vignette: 0,
  grayscale: 0,
  sepia: 0,
  invert: 0,
};

export type ShapeKind =
  | 'rect'
  | 'ellipse'
  | 'triangle'
  | 'rtriangle'
  | 'diamond'
  | 'pentagon'
  | 'hexagon'
  | 'octagon'
  | 'star'
  | 'star4'
  | 'heart'
  | 'arrow'
  | 'chevron'
  | 'cross'
  | 'speech'
  | 'parallelogram'
  | 'trapezoid'
  | 'ring'
  | 'moon'
  | 'line'
  | 'arrowline'
  | 'blob'
  | 'icon';

export type LayerType = 'raster' | 'text' | 'shape';

export interface LayerBase {
  id: string;
  name: string;
  type: LayerType;
  visible: boolean;
  locked: boolean;
  opacity: number; // 0..1
  blend: BlendMode;
  /** Center of the layer box in document coordinates. */
  x: number;
  y: number;
  rotation: number; // degrees
  scaleX: number;
  scaleY: number;
  adjust?: Adjust | null;
  shadow?: Shadow | null;
  /** Alpha mask in layer-local pixel space (same size as the layer box). */
  mask?: HTMLCanvasElement | null;
  maskEnabled?: boolean;
  /** Id of the layer group this layer belongs to (members of a group are adjacent in the stack). */
  group?: string | null;
}

export interface RasterLayer extends LayerBase {
  type: 'raster';
  canvas: HTMLCanvasElement;
  /** Optional frame shape the image is clipped to (Canva-style frames). */
  clip?: ShapeKind | null;
  clipRadius?: number;
  /** Optional outline drawn around frames. */
  frameStroke?: Outline | null;
}

export interface TextBackground {
  color: string;
  padding: number;
  radius: number;
}

export interface TextLayer extends LayerBase {
  type: 'text';
  text: string;
  font: string;
  size: number;
  weight: number;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  uppercase: boolean;
  align: 'left' | 'center' | 'right';
  lineHeight: number; // multiplier
  letterSpacing: number; // px
  /** Wrap width of the text box. */
  width: number;
  fill: Fill;
  outline?: Outline | null;
  background?: TextBackground | null;
  /** -100..100, 0 = straight. */
  curve: number;
}

export interface ShapeLayer extends LayerBase {
  type: 'shape';
  shape: ShapeKind;
  w: number;
  h: number;
  fill: Fill | null;
  stroke: string | null;
  strokeWidth: number;
  dash: number; // 0 = solid
  radius: number; // corner radius for rect-like shapes
  sides: number; // polygon sides / star points
  inner: number; // star inner ratio 0.1..0.95
  /** SVG path data in a 24x24 box (icons). */
  path?: string;
}

export type Layer = RasterLayer | TextLayer | ShapeLayer;

/** A Photoshop-style layer group. Its members are a contiguous run of `Doc.layers` tagged with its id. */
export interface LayerGroup {
  id: string;
  name: string;
  opacity: number; // 0..1, applied to the members composited together
  blend: BlendMode;
  collapsed?: boolean;
}

export interface Doc {
  id: string;
  name: string;
  width: number;
  height: number;
  background: Fill | null;
  layers: Layer[]; // bottom -> top
  groups?: LayerGroup[];
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Selection {
  /** Document-sized canvas; alpha = selection strength. */
  mask: HTMLCanvasElement;
  bounds: Rect;
  /** Outline in document coordinates for marching ants. */
  outline: Path2D;
}

export type SelectionMode = 'new' | 'add' | 'subtract' | 'intersect';
