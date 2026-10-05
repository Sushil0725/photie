import { useEffect, useMemo, useState } from 'react';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  CaseUpper,
  FlipHorizontal2,
  FlipVertical2,
  Italic,
  RotateCcw,
  Sparkles,
  Strikethrough,
  Underline,
  Replace,
  Wand2,
  Trash2,
} from 'lucide-react';
import { FILTER_PRESETS, isNeutral, renderAdjusted } from '../../engine/adjust';
import { solid } from '../../engine/fill';
import { getFont, loadFont } from '../../engine/fonts';
import { layerSize } from '../../engine/geometry';
import { SHAPE_LABELS, isLineShape } from '../../engine/shapes';
import { BLEND_MODES, NEUTRAL_ADJUST, type Adjust, type Layer, type RasterLayer, type ShapeKind, type ShapeLayer, type TextLayer } from '../../engine/types';
import { createCanvas, ctx2d, pickFiles } from '../../engine/util';
import { S, beginLive, endLive, live, selectedLayers, setS, useEditor } from '../../store/editor';
import { flipSelected, updateSelected, deleteLayers } from '../../store/layers';
import { setDocBackground } from '../../store/image';
import { fillFrameWithImage } from '../../store/elements';
import { ColorButton, FillButton, FillPicker } from '../ColorPicker';
import { FontPicker } from '../FontPicker';
import { cmd } from '../actions';
import { NumberField, Section, Select, Slider, Toggle, IconButton } from '../controls';

/* ------------------------------ Live editing ------------------------------ */

function liveSet(patch: Partial<Layer> | ((l: Layer) => Partial<Layer>)) {
  const s = S();
  if (!s.doc) return;
  const ids = new Set(s.selectedIds);
  beginLive();
  live({ ...s.doc, layers: s.doc.layers.map((l) => (ids.has(l.id) ? ({ ...l, ...(typeof patch === 'function' ? patch(l) : patch) } as Layer) : l)) });
}
const liveEnd = (label: string) => endLive(label);

function set(patch: Partial<Layer> | ((l: Layer) => Partial<Layer>), label: string) {
  updateSelected(patch, label);
}

function LiveSlider(props: { label: string; value: number; min: number; max: number; step?: number; unit?: string; patch: (v: number) => Partial<Layer> | ((l: Layer) => Partial<Layer>); historyLabel: string; centered?: boolean }) {
  return (
    <Slider
      label={props.label}
      value={props.value}
      min={props.min}
      max={props.max}
      step={props.step}
      unit={props.unit}
      centered={props.centered}
      onChange={(v) => liveSet(props.patch(v))}
      onCommit={() => liveEnd(props.historyLabel)}
    />
  );
}

/* ------------------------------ Layer section ------------------------------ */

function TransformSection({ layer }: { layer: Layer }) {
  const { w, h } = layerSize(layer);
  const W = w * Math.abs(layer.scaleX),
    H = h * Math.abs(layer.scaleY);
  const setSize = (nw: number | null, nh: number | null) => {
    set((l) => {
      const base = layerSize(l);
      const cw = base.w * Math.abs(l.scaleX),
        ch = base.h * Math.abs(l.scaleY);
      const tw = nw ?? cw,
        th = nh ?? ch;
      if (l.type === 'raster') return { scaleX: Math.sign(l.scaleX) * (tw / base.w), scaleY: Math.sign(l.scaleY) * (th / base.h) };
      if (l.type === 'shape') return { w: tw / Math.abs(l.scaleX), h: th / Math.abs(l.scaleY) };
      const k = tw / cw;
      return { width: l.width * k, size: nw !== null ? l.size * k : l.size * (th / ch) };
    }, 'Resize');
  };
  return (
    <div className="grid2">
      <NumberField label="X" value={Math.round(layer.x - W / 2)} onChange={(v) => set((l) => ({ x: v + (layerSize(l).w * Math.abs(l.scaleX)) / 2 }), 'Move')} />
      <NumberField label="Y" value={Math.round(layer.y - H / 2)} onChange={(v) => set((l) => ({ y: v + (layerSize(l).h * Math.abs(l.scaleY)) / 2 }), 'Move')} />
      <NumberField label="W" value={Math.round(W)} min={1} onChange={(v) => setSize(v, layer.type === 'text' ? null : null)} />
      <NumberField label="H" value={Math.round(H)} min={1} onChange={(v) => layer.type !== 'text' && setSize(null, v)} />
      <NumberField label="∠" value={Math.round(layer.rotation * 10) / 10} unit="°" onChange={(v) => set({ rotation: ((v % 360) + 360) % 360 }, 'Rotate')} />
      <div className="row" style={{ gap: 4 }}>
        <IconButton icon={<FlipHorizontal2 size={15} />} title="Flip horizontal" onClick={() => flipSelected('h')} />
        <IconButton icon={<FlipVertical2 size={15} />} title="Flip vertical" onClick={() => flipSelected('v')} />
      </div>
    </div>
  );
}

function LayerBasics({ layer }: { layer: Layer }) {
  return (
    <>
      <LiveSlider label="Opacity" value={Math.round(layer.opacity * 100)} min={0} max={100} unit="%" patch={(v) => ({ opacity: v / 100 })} historyLabel="Opacity" />
      <div className="prop-row">
        <span>Blend</span>
        <Select value={layer.blend} options={BLEND_MODES} onChange={(v) => set({ blend: v }, 'Blend mode')} />
      </div>
    </>
  );
}

/* ------------------------------- Text section ------------------------------- */

function TextSection({ t }: { t: TextLayer }) {
  const font = getFont(t.font);
  const weights = font?.weights || [400, 700];
  const weightNames: Record<number, string> = { 100: 'Thin', 200: 'Extra Light', 300: 'Light', 400: 'Regular', 500: 'Medium', 600: 'Semibold', 700: 'Bold', 800: 'Extra Bold', 900: 'Black' };
  return (
    <Section title="Text">
      <div className="row" style={{ gap: 6 }}>
        <FontPicker value={t.font} onChange={(f) => set((l) => ({ font: f, weight: (getFont(f)?.weights || [400]).reduce((a, b) => (Math.abs(b - (l as TextLayer).weight) < Math.abs(a - (l as TextLayer).weight) ? b : a)) }), 'Font')} />
        <NumberField value={Math.round(t.size * 10) / 10} min={1} max={3000} onChange={(v) => set((l) => ({ size: v, width: (l as TextLayer).width * (v / (l as TextLayer).size) }), 'Font size')} width={64} />
      </div>
      <div className="row" style={{ gap: 6 }}>
        <Select value={t.weight} options={weights.map((w) => ({ value: w, label: weightNames[w] || String(w) }))} onChange={(v) => set({ weight: v }, 'Font weight')} />
        <FillButton fill={t.fill} onChange={(f) => f && liveSet({ fill: f })} onCommit={() => liveEnd('Text color')} title="Text color" />
      </div>
      <div className="row toolrow">
        <IconButton icon={<Bold size={15} />} title="Bold" active={t.weight >= 700} onClick={() => set({ weight: t.weight >= 700 ? (weights.includes(400) ? 400 : weights[0]) : weights.includes(700) ? 700 : weights[weights.length - 1] }, 'Bold')} />
        <IconButton icon={<Italic size={15} />} title="Italic" active={t.italic} onClick={() => set({ italic: !t.italic }, 'Italic')} />
        <IconButton icon={<Underline size={15} />} title="Underline" active={t.underline} onClick={() => set({ underline: !t.underline }, 'Underline')} />
        <IconButton icon={<Strikethrough size={15} />} title="Strikethrough" active={t.strike} onClick={() => set({ strike: !t.strike }, 'Strikethrough')} />
        <IconButton icon={<CaseUpper size={15} />} title="Uppercase" active={t.uppercase} onClick={() => set({ uppercase: !t.uppercase }, 'Case')} />
        <span className="vsep" />
        <IconButton icon={<AlignLeft size={15} />} title="Align left" active={t.align === 'left'} onClick={() => set({ align: 'left' }, 'Align text')} />
        <IconButton icon={<AlignCenter size={15} />} title="Align center" active={t.align === 'center'} onClick={() => set({ align: 'center' }, 'Align text')} />
        <IconButton icon={<AlignRight size={15} />} title="Align right" active={t.align === 'right'} onClick={() => set({ align: 'right' }, 'Align text')} />
      </div>
      <LiveSlider label="Line height" value={t.lineHeight} min={0.5} max={3} step={0.05} patch={(v) => ({ lineHeight: v })} historyLabel="Line height" />
      <LiveSlider label="Letter spacing" value={Math.round(t.letterSpacing * 10) / 10} min={-20} max={Math.max(100, t.size)} step={0.5} patch={(v) => ({ letterSpacing: v })} historyLabel="Letter spacing" />
      <LiveSlider label="Curve" value={t.curve} min={-100} max={100} centered patch={(v) => ({ curve: v })} historyLabel="Curve text" />
      <div className="prop-row">
        <Toggle checked={!!t.outline} onChange={(v) => set({ outline: v ? { color: '#000000', width: Math.max(1, Math.round(t.size / 20)) } : null }, 'Outline')} label="Outline" />
        {t.outline && <ColorButton color={t.outline.color} onChange={(c) => liveSet((l) => ({ outline: { ...(l as TextLayer).outline!, color: c } }))} onCommit={() => liveEnd('Outline color')} size={24} />}
      </div>
      {t.outline && <LiveSlider label="Outline width" value={t.outline.width} min={0.5} max={Math.max(40, t.size / 4)} step={0.5} patch={(v) => (l) => ({ outline: { ...(l as TextLayer).outline!, width: v } })} historyLabel="Outline width" />}
      <div className="prop-row">
        <Toggle checked={!!t.background} onChange={(v) => set({ background: v ? { color: '#ffd166', padding: Math.round(t.size * 0.3), radius: Math.round(t.size * 0.2) } : null }, 'Text background')} label="Background" />
        {t.background && <ColorButton color={t.background.color} onChange={(c) => liveSet((l) => ({ background: { ...(l as TextLayer).background!, color: c } }))} onCommit={() => liveEnd('Background color')} size={24} />}
      </div>
      {t.background && (
        <>
          <LiveSlider label="Padding" value={Math.round(t.background.padding)} min={0} max={Math.max(100, t.size)} patch={(v) => (l) => ({ background: { ...(l as TextLayer).background!, padding: v } })} historyLabel="Padding" />
          <LiveSlider label="Roundness" value={Math.round(t.background.radius)} min={0} max={Math.max(100, t.size)} patch={(v) => (l) => ({ background: { ...(l as TextLayer).background!, radius: v } })} historyLabel="Roundness" />
        </>
      )}
    </Section>
  );
}

/* ------------------------------- Shape section ------------------------------- */

function ShapeSection({ s }: { s: ShapeLayer }) {
  const line = isLineShape(s.shape);
  return (
    <Section title={s.shape === 'icon' ? 'Icon' : SHAPE_LABELS[s.shape]}>
      {!line && s.shape !== 'icon' && (
        <div className="prop-row">
          <span>Fill</span>
          <FillButton fill={s.fill} allowNone onChange={(f) => liveSet({ fill: f })} onCommit={() => liveEnd('Fill')} />
        </div>
      )}
      <div className="prop-row">
        <span>{line || s.shape === 'icon' ? 'Color' : 'Stroke'}</span>
        <ColorButton color={s.stroke || '#000000'} onChange={(c) => liveSet({ stroke: c, strokeWidth: s.strokeWidth || 4 })} onCommit={() => liveEnd('Stroke color')} />
        {!line && s.shape !== 'icon' && s.stroke && (
          <button className="icon-btn" title="Remove stroke" onClick={() => set({ stroke: null, strokeWidth: 0 }, 'Remove stroke')}>
            <Trash2 size={14} />
          </button>
        )}
      </div>
      {(s.stroke || line) && (
        <LiveSlider label={s.shape === 'icon' ? 'Line weight' : 'Stroke width'} value={s.strokeWidth} min={s.shape === 'icon' ? 0.25 : 0} max={s.shape === 'icon' ? 6 : 200} step={s.shape === 'icon' ? 0.25 : 1} patch={(v) => ({ strokeWidth: v })} historyLabel="Stroke width" />
      )}
      {s.shape !== 'icon' && (s.stroke || line) && (
        <div className="prop-row">
          <Toggle checked={s.dash > 0} onChange={(v) => set({ dash: v ? 2 : 0 }, 'Dashed')} label="Dashed" />
        </div>
      )}
      {(s.shape === 'rect' || s.shape === 'speech') && <LiveSlider label="Corner radius" value={Math.round(s.radius)} min={0} max={Math.round(Math.min(s.w, s.h) / 2)} patch={(v) => ({ radius: v })} historyLabel="Corner radius" />}
      {s.shape === 'star' && <LiveSlider label="Points" value={s.sides} min={3} max={24} patch={(v) => ({ sides: v })} historyLabel="Star points" />}
      {(s.shape === 'star' || s.shape === 'star4' || s.shape === 'ring') && <LiveSlider label={s.shape === 'ring' ? 'Hole size' : 'Inner radius'} value={Math.round(s.inner * 100)} min={5} max={95} unit="%" patch={(v) => ({ inner: v / 100 })} historyLabel="Inner radius" />}
    </Section>
  );
}

/* ------------------------------- Image section ------------------------------- */

function usePresetThumbs(layer: RasterLayer) {
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const src = layer.canvas;
  useEffect(() => {
    let cancelled = false;
    const size = 72;
    const k = Math.min(size / src.width, size / src.height);
    const small = createCanvas(Math.max(1, src.width * k), Math.max(1, src.height * k));
    ctx2d(small).drawImage(src, 0, 0, small.width, small.height);
    const out: Record<string, string> = {};
    let i = 0;
    const step = () => {
      if (cancelled) return;
      const batch = FILTER_PRESETS.slice(i, i + 4);
      for (const p of batch) {
        const a = { ...NEUTRAL_ADJUST, ...p.adjust, blur: (p.adjust.blur || 0) * k };
        out[p.id] = (isNeutral(a) ? small : renderAdjusted(small, small.width, small.height, a)).toDataURL('image/jpeg', 0.8);
      }
      i += 4;
      setThumbs({ ...out });
      if (i < FILTER_PRESETS.length) setTimeout(step, 16);
    };
    const t = setTimeout(step, 50);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [src]);
  return thumbs;
}

const ADJUST_SLIDERS: { key: keyof Adjust; label: string; min: number; max: number; centered?: boolean }[] = [
  { key: 'brightness', label: 'Brightness', min: -100, max: 100, centered: true },
  { key: 'contrast', label: 'Contrast', min: -100, max: 100, centered: true },
  { key: 'saturation', label: 'Saturation', min: -100, max: 100, centered: true },
  { key: 'temperature', label: 'Temperature', min: -100, max: 100, centered: true },
  { key: 'tint', label: 'Tint', min: -100, max: 100, centered: true },
  { key: 'hue', label: 'Hue', min: -180, max: 180, centered: true },
  { key: 'vignette', label: 'Vignette', min: 0, max: 100 },
  { key: 'blur', label: 'Blur', min: 0, max: 100 },
  { key: 'grayscale', label: 'Grayscale', min: 0, max: 100 },
  { key: 'sepia', label: 'Sepia', min: 0, max: 100 },
  { key: 'invert', label: 'Invert', min: 0, max: 100 },
];

export function AdjustSection({ layer }: { layer: Layer }) {
  const a = layer.adjust || NEUTRAL_ADJUST;
  return (
    <Section
      title="Adjust"
      right={
        !isNeutral(layer.adjust) ? (
          <button className="link-btn" onClick={() => set({ adjust: null }, 'Reset adjustments')}>
            <RotateCcw size={12} /> Reset
          </button>
        ) : undefined
      }
    >
      {ADJUST_SLIDERS.map((sl) => (
        <LiveSlider
          key={sl.key}
          label={sl.label}
          value={a[sl.key]}
          min={sl.min}
          max={sl.max}
          centered={sl.centered}
          patch={(v) => (l) => ({ adjust: { ...(l.adjust || NEUTRAL_ADJUST), [sl.key]: v } })}
          historyLabel={sl.label}
        />
      ))}
    </Section>
  );
}

export function FilterPresets({ layer }: { layer: RasterLayer }) {
  const thumbs = usePresetThumbs(layer);
  const current = useMemo(() => {
    const a = layer.adjust || NEUTRAL_ADJUST;
    return FILTER_PRESETS.find((p) => (Object.keys(NEUTRAL_ADJUST) as (keyof Adjust)[]).every((k) => (p.adjust[k] || 0) === a[k]))?.id;
  }, [layer.adjust]);
  return (
    <Section title="Filters">
      <div className="preset-grid">
        {FILTER_PRESETS.map((p) => (
          <button key={p.id} className={'preset' + (current === p.id ? ' active' : '')} onClick={() => set({ adjust: p.id === 'none' ? null : { ...NEUTRAL_ADJUST, ...p.adjust } }, 'Filter: ' + p.name)}>
            {thumbs[p.id] ? <img src={thumbs[p.id]} alt="" /> : <span className="preset-ph" />}
            <span>{p.name}</span>
          </button>
        ))}
      </div>
    </Section>
  );
}

const CLIP_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'None' },
  ...(['ellipse', 'rect', 'heart', 'star', 'hexagon', 'diamond', 'triangle', 'blob', 'speech', 'pentagon', 'octagon'] as ShapeKind[]).map((k) => ({ value: k, label: SHAPE_LABELS[k] })),
];

function ImageSection({ layer }: { layer: RasterLayer }) {
  return (
    <Section title="Image">
      <div className="btn-grid">
        <button className="btn small" onClick={() => import('../../engine/ai').then((m) => m.removeBackground())}>
          <Sparkles size={14} /> Remove BG
        </button>
        <button
          className="btn small"
          onClick={async () => {
            const [f] = await pickFiles('image/*');
            if (f) fillFrameWithImage(layer.id, URL.createObjectURL(f));
          }}
        >
          <Replace size={14} /> Replace
        </button>
        <button className="btn small" onClick={() => cmd.filter('auto-tone')} title="Automatically improve tones">
          <Wand2 size={14} /> Auto
        </button>
      </div>
      <div className="prop-row">
        <span>Frame shape</span>
        <Select value={layer.clip || ''} options={CLIP_OPTIONS} onChange={(v) => set({ clip: (v || null) as ShapeKind | null }, 'Frame shape')} />
      </div>
      {layer.clip === 'rect' && (
        <LiveSlider label="Corner radius" value={Math.round((layer.clipRadius || 0) * Math.abs(layer.scaleX))} min={0} max={Math.round((Math.min(layer.canvas.width, layer.canvas.height) * Math.abs(layer.scaleX)) / 2)} patch={(v) => (l) => ({ clipRadius: v / Math.abs(l.scaleX) })} historyLabel="Corner radius" />
      )}
      {layer.clip && (
        <div className="prop-row">
          <Toggle
            checked={!!layer.frameStroke}
            onChange={(v) => set((l) => ({ frameStroke: v ? { color: '#ffffff', width: 8 / Math.abs(l.scaleX) } : null }), 'Frame border')}
            label="Border"
          />
          {layer.frameStroke && <ColorButton color={layer.frameStroke.color} onChange={(c) => liveSet((l) => ({ frameStroke: { ...(l as RasterLayer).frameStroke!, color: c } }))} onCommit={() => liveEnd('Border color')} size={24} />}
        </div>
      )}
      {layer.clip && layer.frameStroke && (
        <LiveSlider label="Border width" value={Math.round(layer.frameStroke.width * Math.abs(layer.scaleX))} min={1} max={80} patch={(v) => (l) => ({ frameStroke: { ...(l as RasterLayer).frameStroke!, width: v / Math.abs(l.scaleX) } })} historyLabel="Border width" />
      )}
    </Section>
  );
}

/* ------------------------------ Effects section ------------------------------ */

function EffectsSection({ layer }: { layer: Layer }) {
  const sh = layer.shadow;
  const unit = Math.max(4, Math.round(Math.min(layerSize(layer).w * Math.abs(layer.scaleX), 400) / 25));
  return (
    <Section title="Effects">
      <div className="prop-row">
        <Toggle checked={!!sh && (sh.x !== 0 || sh.y !== 0)} onChange={(v) => set({ shadow: v ? { color: '#000000', blur: unit * 2, x: unit / 2, y: unit, opacity: 0.45 } : null }, 'Drop shadow')} label="Drop shadow" />
        <Toggle checked={!!sh && sh.x === 0 && sh.y === 0} onChange={(v) => set({ shadow: v ? { color: '#ffd166', blur: unit * 3, x: 0, y: 0, opacity: 0.9 } : null }, 'Glow')} label="Glow" />
      </div>
      {sh && (
        <>
          <div className="prop-row">
            <span>Color</span>
            <ColorButton color={sh.color} onChange={(c) => liveSet((l) => ({ shadow: { ...l.shadow!, color: c } }))} onCommit={() => liveEnd('Shadow color')} size={24} />
          </div>
          <LiveSlider label="Blur" value={Math.round(sh.blur)} min={0} max={200} patch={(v) => (l) => ({ shadow: { ...l.shadow!, blur: v } })} historyLabel="Shadow blur" />
          {(sh.x !== 0 || sh.y !== 0) && (
            <>
              <LiveSlider label="Offset X" value={Math.round(sh.x)} min={-200} max={200} centered patch={(v) => (l) => ({ shadow: { ...l.shadow!, x: v } })} historyLabel="Shadow offset" />
              <LiveSlider label="Offset Y" value={Math.round(sh.y)} min={-200} max={200} centered patch={(v) => (l) => ({ shadow: { ...l.shadow!, y: v } })} historyLabel="Shadow offset" />
            </>
          )}
          <LiveSlider label="Intensity" value={Math.round(sh.opacity * 100)} min={0} max={100} unit="%" patch={(v) => (l) => ({ shadow: { ...l.shadow!, opacity: v / 100 } })} historyLabel="Shadow opacity" />
        </>
      )}
    </Section>
  );
}

/* ------------------------------ Document section ------------------------------ */

function DocumentSection() {
  const doc = useEditor((s) => s.doc)!;
  return (
    <>
      <Section title="Design">
        <div className="prop-row">
          <span>Size</span>
          <span className="muted">
            {doc.width} × {doc.height} px
          </span>
          <button className="btn small ghost" onClick={() => setS({ dialog: { type: 'resize' } })}>
            Resize
          </button>
        </div>
        <div className="prop-row">
          <Toggle checked={!doc.background} onChange={(v) => setDocBackground(v ? null : solid('#ffffff'))} label="Transparent background" />
        </div>
      </Section>
      {doc.background && (
        <Section title="Background color">
          <FillPicker fill={doc.background} onChange={(f) => S().doc && live({ ...S().doc!, background: f })} onCommit={() => endLive('Background')} />
        </Section>
      )}
      <div className="empty-hint">Tip: click any element on the canvas to edit it. Drag photos, text and elements from the left panel.</div>
    </>
  );
}

/* --------------------------------- Panel --------------------------------- */

export function PropertiesPanel() {
  useEditor((s) => s.doc);
  const ids = useEditor((s) => s.selectedIds);
  const layers = selectedLayers();
  const layer = layers[layers.length - 1];
  useEffect(() => {
    if (layer?.type === 'text') loadFont(layer.font);
  }, [layer]);
  if (!S().doc) return null;
  if (!layer) return <DocumentSection />;
  const multi = layers.length > 1;
  return (
    <div className="props">
      <Section
        title={multi ? `${ids.length} layers` : layer.name}
        right={
          <button className="icon-btn" title="Delete" onClick={() => deleteLayers()}>
            <Trash2 size={14} />
          </button>
        }
      >
        {!multi && <TransformSection layer={layer} />}
        <LayerBasics layer={layer} />
      </Section>
      {!multi && layer.type === 'text' && <TextSection t={layer} />}
      {!multi && layer.type === 'shape' && <ShapeSection s={layer} />}
      {!multi && layer.type === 'raster' && <ImageSection layer={layer} />}
      {!multi && layer.type === 'raster' && <FilterPresets layer={layer} />}
      <AdjustSection layer={layer} />
      <EffectsSection layer={layer} />
    </div>
  );
}
