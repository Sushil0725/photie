import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignStartHorizontal,
  AlignStartVertical,
  Check,
  FlipHorizontal2,
  FlipVertical2,
  Sparkles,
  X,
  SquarePlus,
  SquareMinus,
  Square,
  SquaresIntersect,
  Eraser as EraserIcon,
  RotateCcw,
  Crosshair,
} from 'lucide-react';
import { SHAPE_LABELS } from '../engine/shapes';
import type { SelectionMode, ShapeKind } from '../engine/types';
import { FONTS } from '../engine/fonts';
import { S, setOpts, setS, setTool, useEditor, type PaintOpts, type ToolOptions } from '../store/editor';
import { align, distribute, flipSelected } from '../store/layers';
import { contentAwareFill, deselect, invertSelection } from '../store/image';
import { actualSize, fitToScreen, zoomIn, zoomOut } from '../store/view';
import { applyCrop } from './canvas/tools';
import { ColorButton } from './ColorPicker';
import { Check as CheckBox, NumberField, Segmented, Select, Toggle } from './controls';
import { TOOLS } from './Toolbar';

function MiniSlider({ label, value, min, max, step = 1, unit = '', onChange, width = 90 }: { label: string; value: number; min: number; max: number; step?: number; unit?: string; onChange: (v: number) => void; width?: number }) {
  return (
    <label className="opt-slider">
      <span>{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} style={{ width }} onChange={(e) => onChange(parseFloat(e.target.value))} />
      <NumberField value={value} min={min} max={max} step={step} onChange={onChange} unit={unit} width={58} />
    </label>
  );
}

function PaintControls({ k, opacity = true, flow = true, hardness = true }: { k: keyof Pick<ToolOptions, 'brush' | 'eraser' | 'clone' | 'heal' | 'retouch' | 'selectBrush'>; opacity?: boolean; flow?: boolean; hardness?: boolean }) {
  const p = useEditor((s) => s.opts[k]) as PaintOpts;
  const set = (patch: Partial<PaintOpts>) => setOpts({ [k]: { ...S().opts[k], ...patch } } as Partial<ToolOptions>);
  return (
    <>
      <MiniSlider label="Size" value={p.size} min={1} max={1000} unit="px" onChange={(v) => set({ size: v })} width={110} />
      {hardness && <MiniSlider label="Hardness" value={Math.round(p.hardness * 100)} min={0} max={100} unit="%" onChange={(v) => set({ hardness: v / 100 })} />}
      {opacity && <MiniSlider label="Opacity" value={Math.round(p.opacity * 100)} min={1} max={100} unit="%" onChange={(v) => set({ opacity: v / 100 })} />}
      {flow && <MiniSlider label="Flow" value={Math.round(p.flow * 100)} min={1} max={100} unit="%" onChange={(v) => set({ flow: v / 100 })} />}
    </>
  );
}

function SelModes() {
  const mode = useEditor((s) => s.opts.selMode);
  return (
    <Segmented<SelectionMode>
      value={mode}
      onChange={(v) => setOpts({ selMode: v })}
      options={[
        { value: 'new', icon: <Square size={15} />, title: 'New selection' },
        { value: 'add', icon: <SquarePlus size={15} />, title: 'Add to selection (Shift)' },
        { value: 'subtract', icon: <SquareMinus size={15} />, title: 'Subtract from selection (Alt)' },
        { value: 'intersect', icon: <SquaresIntersect size={15} />, title: 'Intersect with selection (Shift+Alt)' },
      ]}
    />
  );
}

function SelExtras() {
  const feather = useEditor((s) => s.opts.feather);
  const hasSel = useEditor((s) => !!s.selection);
  return (
    <>
      <MiniSlider label="Feather" value={feather} min={0} max={200} unit="px" onChange={(v) => setOpts({ feather: v })} width={70} />
      <div className="opt-sep" />
      <button className="btn small" onClick={() => import('../engine/ai').then((m) => m.selectSubject())} title="AI: select the main subject">
        <Sparkles size={14} /> Select Subject
      </button>
      {hasSel && (
        <>
          <button className="btn small ghost" onClick={invertSelection}>
            Inverse
          </button>
          <button className="btn small ghost" onClick={deselect}>
            Deselect
          </button>
          <button className="btn small ghost" onClick={contentAwareFill} title="Remove the selected area and fill it in from surroundings">
            <EraserIcon size={14} /> Remove (Fill)
          </button>
        </>
      )}
    </>
  );
}

const CROP_RATIOS = [
  { value: 'free', label: 'Free' },
  { value: 'original', label: 'Original' },
  { value: '1:1', label: '1:1 Square' },
  { value: '4:5', label: '4:5 Portrait' },
  { value: '3:2', label: '3:2' },
  { value: '4:3', label: '4:3' },
  { value: '16:9', label: '16:9' },
  { value: '9:16', label: '9:16 Story' },
  { value: '2:3', label: '2:3' },
];

const SHAPES: ShapeKind[] = ['rect', 'ellipse', 'triangle', 'diamond', 'pentagon', 'hexagon', 'star', 'star4', 'heart', 'arrow', 'speech', 'line', 'arrowline', 'ring', 'blob'];

export function OptionsBar() {
  const tool = useEditor((s) => s.tool);
  const o = useEditor((s) => s.opts);
  const fg = useEditor((s) => s.fg);
  const crop = useEditor((s) => s.cropRect);
  const editMask = useEditor((s) => s.editMask);
  const nSel = useEditor((s) => s.selectedIds.length);
  const pickSource = useEditor((s) => s.pickCloneSource);
  const hasSource = useEditor((s) => !!s.cloneSource);
  const def = TOOLS.find((t) => t.id === tool)!;

  let body: React.ReactNode = null;
  switch (tool) {
    case 'move':
      body = (
        <>
          <span className="opt-hint">{nSel > 1 ? `${nSel} layers selected` : 'Align'}</span>
          <div className="btn-group">
            <button className="icon-btn" title="Align left" disabled={!nSel} onClick={() => align('left')}>
              <AlignStartVertical size={16} />
            </button>
            <button className="icon-btn" title="Align center" disabled={!nSel} onClick={() => align('hcenter')}>
              <AlignCenterVertical size={16} />
            </button>
            <button className="icon-btn" title="Align right" disabled={!nSel} onClick={() => align('right')}>
              <AlignEndVertical size={16} />
            </button>
            <button className="icon-btn" title="Align top" disabled={!nSel} onClick={() => align('top')}>
              <AlignStartHorizontal size={16} />
            </button>
            <button className="icon-btn" title="Align middle" disabled={!nSel} onClick={() => align('vcenter')}>
              <AlignCenterHorizontal size={16} />
            </button>
            <button className="icon-btn" title="Align bottom" disabled={!nSel} onClick={() => align('bottom')}>
              <AlignEndHorizontal size={16} />
            </button>
          </div>
          {nSel > 2 && (
            <>
              <button className="btn small ghost" onClick={() => distribute('h')}>
                Distribute ↔
              </button>
              <button className="btn small ghost" onClick={() => distribute('v')}>
                Distribute ↕
              </button>
            </>
          )}
          <div className="opt-sep" />
          <button className="icon-btn" title="Flip horizontal" disabled={!nSel} onClick={() => flipSelected('h')}>
            <FlipHorizontal2 size={16} />
          </button>
          <button className="icon-btn" title="Flip vertical" disabled={!nSel} onClick={() => flipSelected('v')}>
            <FlipVertical2 size={16} />
          </button>
          <div className="opt-sep" />
          <Toggle checked={useEditor.getState().snap} onChange={(v) => setS({ snap: v })} label="Smart guides" />
        </>
      );
      break;
    case 'marquee':
      body = (
        <>
          <Segmented value={o.marquee} onChange={(v) => setOpts({ marquee: v })} options={[{ value: 'rect', label: 'Rectangle' }, { value: 'ellipse', label: 'Ellipse' }]} />
          <SelModes />
          <SelExtras />
        </>
      );
      break;
    case 'lasso':
      body = (
        <>
          <Segmented value={o.lasso} onChange={(v) => setOpts({ lasso: v })} options={[{ value: 'free', label: 'Freehand' }, { value: 'polygon', label: 'Polygon' }]} />
          <SelModes />
          <SelExtras />
        </>
      );
      break;
    case 'wand':
      body = (
        <>
          <Segmented
            value={o.wandVariant}
            onChange={(v) => setOpts({ wandVariant: v })}
            options={[
              { value: 'object', label: 'AI Object', title: 'Click an object to select it (AI)' },
              { value: 'wand', label: 'Magic Wand', title: 'Select similar colors' },
              { value: 'selectBrush', label: 'Select Brush', title: 'Paint a selection' },
            ]}
          />
          <SelModes />
          {o.wandVariant === 'wand' && (
            <>
              <MiniSlider label="Tolerance" value={o.tolerance} min={0} max={255} onChange={(v) => setOpts({ tolerance: v })} width={80} />
              <CheckBox checked={o.contiguous} onChange={(v) => setOpts({ contiguous: v })} label="Contiguous" />
              <CheckBox checked={o.sampleAll} onChange={(v) => setOpts({ sampleAll: v })} label="All layers" />
            </>
          )}
          {o.wandVariant === 'selectBrush' && <PaintControls k="selectBrush" opacity={false} flow={false} />}
          <SelExtras />
        </>
      );
      break;
    case 'crop':
      body = (
        <>
          <Select value={o.cropRatio} options={CROP_RATIOS} onChange={(v) => setOpts({ cropRatio: v })} title="Aspect ratio" />
          {crop && (
            <span className="opt-hint">
              {Math.round(crop.w)} × {Math.round(crop.h)} px
            </span>
          )}
          <div className="opt-sep" />
          <button className="btn small primary" onClick={applyCrop} disabled={!crop}>
            <Check size={14} /> Apply
          </button>
          <button className="btn small ghost" onClick={() => setS({ cropRect: null })}>
            <RotateCcw size={14} /> Reset
          </button>
          <button
            className="btn small ghost"
            onClick={() => {
              setS({ cropRect: null });
              setTool('move');
            }}
          >
            <X size={14} /> Cancel
          </button>
          <span className="opt-hint">Drag on the canvas to set the crop. Press Enter to apply.</span>
        </>
      );
      break;
    case 'eyedropper':
      body = (
        <>
          <Select
            value={String(o.sampleSize)}
            options={[
              { value: '1', label: 'Point sample' },
              { value: '3', label: '3 × 3 average' },
              { value: '5', label: '5 × 5 average' },
            ]}
            onChange={(v) => setOpts({ sampleSize: Number(v) as 1 | 3 | 5 })}
          />
          <span className="opt-hint">Click to set foreground, Alt+click for background.</span>
        </>
      );
      break;
    case 'heal':
      body = (
        <>
          <PaintControls k="heal" opacity={false} flow={false} />
          <span className="opt-hint">Paint over a blemish or object, then release to remove it.</span>
        </>
      );
      break;
    case 'brush':
      body = (
        <>
          <Segmented value={o.brushVariant} onChange={(v) => setOpts({ brushVariant: v })} options={[{ value: 'brush', label: 'Brush' }, { value: 'pencil', label: 'Pencil' }]} />
          <ColorButton color={fg} onChange={(c) => setS({ fg: c })} title="Brush color" size={26} />
          <PaintControls k="brush" hardness={o.brushVariant === 'brush'} flow={o.brushVariant === 'brush'} />
          <CheckBox checked={o.pressure} onChange={(v) => setOpts({ pressure: v })} label="Pen pressure" />
        </>
      );
      break;
    case 'clone':
      body = (
        <>
          <button
            className={'btn small' + (pickSource ? ' primary' : ' ghost')}
            onClick={() => setS({ pickCloneSource: !pickSource })}
            title="Click, then tap the area to copy from (or Alt+click on the canvas)"
          >
            <Crosshair size={14} /> {pickSource ? 'Tap the source…' : hasSource ? 'Change source' : 'Set source'}
          </button>
          <PaintControls k="clone" />
          <CheckBox checked={o.cloneAligned} onChange={(v) => setOpts({ cloneAligned: v })} label="Aligned" />
          <Select
            value={o.cloneSampleAll ? 'all' : 'layer'}
            options={[
              { value: 'layer', label: 'Sample: Current layer' },
              { value: 'all', label: 'Sample: All layers' },
            ]}
            onChange={(v) => setOpts({ cloneSampleAll: v === 'all' })}
            title="Which pixels to copy from"
          />
          <span className="opt-hint">{hasSource ? 'Paint to copy. Alt+click picks a new source.' : 'Click (or Alt+click) the area to copy from.'}</span>
        </>
      );
      break;
    case 'eraser':
      body = (
        <>
          <Segmented value={o.eraserVariant} onChange={(v) => setOpts({ eraserVariant: v })} options={[{ value: 'eraser', label: 'Eraser' }, { value: 'magic', label: 'Magic Eraser' }]} />
          {o.eraserVariant === 'eraser' ? (
            <PaintControls k="eraser" />
          ) : (
            <>
              <MiniSlider label="Tolerance" value={o.tolerance} min={0} max={255} onChange={(v) => setOpts({ tolerance: v })} width={80} />
              <CheckBox checked={o.contiguous} onChange={(v) => setOpts({ contiguous: v })} label="Contiguous" />
            </>
          )}
        </>
      );
      break;
    case 'fill':
      body = (
        <>
          <Segmented value={o.fillVariant} onChange={(v) => setOpts({ fillVariant: v })} options={[{ value: 'gradient', label: 'Gradient' }, { value: 'bucket', label: 'Paint Bucket' }]} />
          <ColorButton color={fg} onChange={(c) => setS({ fg: c })} title="Foreground color" size={26} />
          {o.fillVariant === 'gradient' ? (
            <>
              <Select
                value={o.gradientType}
                options={[
                  { value: 'linear', label: 'Linear' },
                  { value: 'radial', label: 'Radial' },
                  { value: 'angle', label: 'Angle' },
                  { value: 'reflected', label: 'Reflected' },
                ]}
                onChange={(v) => setOpts({ gradientType: v })}
              />
              <Select
                value={o.gradientPreset}
                options={[
                  { value: 'fg-bg', label: 'Foreground → Background' },
                  { value: 'fg-transparent', label: 'Foreground → Transparent' },
                  { value: 'rainbow', label: 'Rainbow' },
                  { value: 'sunset', label: 'Sunset' },
                  { value: 'ocean', label: 'Ocean' },
                  { value: 'chrome', label: 'Chrome' },
                ]}
                onChange={(v) => setOpts({ gradientPreset: v })}
              />
              <MiniSlider label="Opacity" value={Math.round(o.gradientOpacity * 100)} min={1} max={100} unit="%" onChange={(v) => setOpts({ gradientOpacity: v / 100 })} />
            </>
          ) : (
            <>
              <MiniSlider label="Tolerance" value={o.tolerance} min={0} max={255} onChange={(v) => setOpts({ tolerance: v })} width={80} />
              <CheckBox checked={o.contiguous} onChange={(v) => setOpts({ contiguous: v })} label="Contiguous" />
              <CheckBox checked={o.sampleAll} onChange={(v) => setOpts({ sampleAll: v })} label="All layers" />
            </>
          )}
        </>
      );
      break;
    case 'blur':
      body = (
        <>
          <Segmented value={o.blurVariant} onChange={(v) => setOpts({ blurVariant: v })} options={[{ value: 'blur', label: 'Blur' }, { value: 'sharpen', label: 'Sharpen' }, { value: 'smudge', label: 'Smudge' }]} />
          <PaintControls k="retouch" opacity={false} flow={false} />
          <MiniSlider label="Strength" value={Math.round(o.strength * 100)} min={1} max={100} unit="%" onChange={(v) => setOpts({ strength: v / 100 })} />
        </>
      );
      break;
    case 'dodge':
      body = (
        <>
          <Segmented value={o.dodgeVariant} onChange={(v) => setOpts({ dodgeVariant: v })} options={[{ value: 'dodge', label: 'Dodge' }, { value: 'burn', label: 'Burn' }, { value: 'sponge', label: 'Sponge' }]} />
          {o.dodgeVariant !== 'sponge' ? (
            <Select
              value={o.dodgeRange}
              options={[
                { value: 'shadows', label: 'Shadows' },
                { value: 'midtones', label: 'Midtones' },
                { value: 'highlights', label: 'Highlights' },
              ]}
              onChange={(v) => setOpts({ dodgeRange: v })}
            />
          ) : (
            <span className="opt-hint">Saturates · hold Alt to desaturate</span>
          )}
          <PaintControls k="retouch" opacity={false} flow={false} />
          <MiniSlider label="Exposure" value={Math.round(o.strength * 100)} min={1} max={100} unit="%" onChange={(v) => setOpts({ strength: v / 100 })} />
        </>
      );
      break;
    case 'text':
      body = (
        <>
          <Select value={o.textFont} options={FONTS.map((f) => ({ value: f.name, label: f.name }))} onChange={(v) => setOpts({ textFont: v })} />
          <NumberField value={o.textSize} min={4} max={2000} unit="px" onChange={(v) => setOpts({ textSize: v })} width={80} />
          <ColorButton color={fg} onChange={(c) => setS({ fg: c })} title="Text color" size={26} />
          <span className="opt-hint">Click to add text · drag to make a text box · double-click text to edit</span>
        </>
      );
      break;
    case 'shape':
      body = (
        <>
          <Select value={o.shape} options={SHAPES.map((k) => ({ value: k, label: SHAPE_LABELS[k] }))} onChange={(v) => setOpts({ shape: v })} />
          <span className="opt-label">Fill</span>
          <ColorButton color={o.shapeFill} onChange={(c) => setOpts({ shapeFill: c })} title="Fill color" size={26} />
          <span className="opt-label">Stroke</span>
          <ColorButton color={o.shapeStroke} onChange={(c) => setOpts({ shapeStroke: c })} title="Stroke color" size={26} />
          <NumberField value={o.shapeStrokeWidth} min={0} max={200} unit="px" onChange={(v) => setOpts({ shapeStrokeWidth: v })} width={70} />
          <span className="opt-hint">Drag to draw · Shift keeps proportions</span>
        </>
      );
      break;
    case 'hand':
    case 'zoom':
      body = (
        <>
          <button className="btn small ghost" onClick={() => zoomOut()}>
            −
          </button>
          <button className="btn small ghost" onClick={() => zoomIn()}>
            +
          </button>
          <button className="btn small ghost" onClick={actualSize}>
            100%
          </button>
          <button className="btn small ghost" onClick={fitToScreen}>
            Fit Screen
          </button>
        </>
      );
      break;
  }

  return (
    <div className="optionsbar">
      <span className="opt-tool">{def.name}</span>
      {editMask && <span className="mask-badge">Editing mask</span>}
      <div className="opt-body">{body}</div>
    </div>
  );
}
