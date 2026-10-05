import { useRef, useState, type ComponentType } from 'react';
import {
  ArrowLeftRight,
  Bandage,
  Crop,
  Droplet,
  Eraser,
  Hand,
  Lasso,
  MousePointer2,
  PaintBucket,
  Paintbrush,
  Pipette,
  Shapes,
  SquareDashed,
  Stamp,
  SunDim,
  Type,
  WandSparkles,
  ZoomIn,
  Blend,
  Pencil,
  Circle,
  Brush,
  Sparkles,
  Hexagon,
} from 'lucide-react';
import { setS, setTool, useEditor, type ToolId } from '../store/editor';
import { ColorPicker, Popover } from './ColorPicker';

interface ToolDef {
  id: ToolId;
  name: string;
  key: string;
  icon: ComponentType<{ size?: number }>;
  hint: string;
}

export const TOOLS: ToolDef[] = [
  { id: 'move', name: 'Move & Select', key: 'V', icon: MousePointer2, hint: 'Click to select, drag to move. Handles resize & rotate.' },
  { id: 'marquee', name: 'Marquee Select', key: 'M', icon: SquareDashed, hint: 'Drag a rectangle or ellipse selection.' },
  { id: 'lasso', name: 'Lasso', key: 'L', icon: Lasso, hint: 'Draw a freehand or polygon selection.' },
  { id: 'wand', name: 'Magic Wand / AI Select', key: 'W', icon: WandSparkles, hint: 'Select similar colors, paint a selection, or AI object select.' },
  { id: 'crop', name: 'Crop', key: 'C', icon: Crop, hint: 'Crop the canvas. Enter to apply.' },
  { id: 'eyedropper', name: 'Eyedropper', key: 'I', icon: Pipette, hint: 'Pick a color from the image.' },
  { id: 'heal', name: 'Healing / Remove', key: 'J', icon: Bandage, hint: 'Paint over spots or objects to remove them.' },
  { id: 'brush', name: 'Brush / Pencil', key: 'B', icon: Paintbrush, hint: 'Paint with the foreground color.' },
  { id: 'clone', name: 'Clone Stamp', key: 'S', icon: Stamp, hint: 'Alt+click to set source, then paint.' },
  { id: 'eraser', name: 'Eraser', key: 'E', icon: Eraser, hint: 'Erase pixels. Magic eraser removes similar colors.' },
  { id: 'fill', name: 'Gradient / Paint Bucket', key: 'G', icon: PaintBucket, hint: 'Drag a gradient or click to fill.' },
  { id: 'blur', name: 'Blur / Sharpen / Smudge', key: 'R', icon: Droplet, hint: 'Locally soften, sharpen or smudge.' },
  { id: 'dodge', name: 'Dodge / Burn / Sponge', key: 'O', icon: SunDim, hint: 'Lighten, darken or (de)saturate areas.' },
  { id: 'text', name: 'Text', key: 'T', icon: Type, hint: 'Click to add text, drag for a text box.' },
  { id: 'shape', name: 'Shapes', key: 'U', icon: Shapes, hint: 'Drag to draw a shape.' },
  { id: 'hand', name: 'Hand', key: 'H', icon: Hand, hint: 'Pan the view (or hold Space).' },
  { id: 'zoom', name: 'Zoom', key: 'Z', icon: ZoomIn, hint: 'Click to zoom in, Alt+click to zoom out.' },
];

function variantIcon(id: ToolId, opts: ReturnType<typeof useEditor.getState>['opts']): ComponentType<{ size?: number }> | null {
  if (id === 'fill' && opts.fillVariant === 'gradient') return Blend;
  if (id === 'brush' && opts.brushVariant === 'pencil') return Pencil;
  if (id === 'marquee' && opts.marquee === 'ellipse') return Circle;
  if (id === 'wand' && opts.wandVariant === 'selectBrush') return Brush;
  if (id === 'wand' && opts.wandVariant === 'object') return Sparkles;
  if (id === 'eraser' && opts.eraserVariant === 'magic') return WandSparkles;
  if (id === 'shape' && opts.shape === 'hexagon') return Hexagon;
  return null;
}

export function Toolbar() {
  const tool = useEditor((s) => s.tool);
  const opts = useEditor((s) => s.opts);
  return (
    <aside className="toolbar" aria-label="Tools">
      <div className="tools">
        {TOOLS.map((t) => {
          const Icon = variantIcon(t.id, opts) || t.icon;
          return (
            <button
              key={t.id}
              className={'tool-btn' + (tool === t.id ? ' active' : '')}
              onClick={() => {
                setTool(t.id);
                if (t.id === 'crop') setS({ cropRect: null });
              }}
              title={`${t.name} (${t.key})\n${t.hint}`}
              aria-label={t.name}
            >
              <Icon size={19} />
            </button>
          );
        })}
      </div>
      <ColorWells />
    </aside>
  );
}

function ColorWells() {
  const fg = useEditor((s) => s.fg);
  const bg = useEditor((s) => s.bg);
  const [edit, setEdit] = useState<'fg' | 'bg' | null>(null);
  const fgRef = useRef<HTMLButtonElement>(null);
  const bgRef = useRef<HTMLButtonElement>(null);
  return (
    <div className="wells">
      <button ref={bgRef} className="well bg" style={{ background: bg }} title="Background color" onClick={() => setEdit('bg')} />
      <button ref={fgRef} className="well fg" style={{ background: fg }} title="Foreground color" onClick={() => setEdit('fg')} />
      <button className="well-swap" title="Swap colors (X)" onClick={() => setS({ fg: bg, bg: fg })}>
        <ArrowLeftRight size={11} />
      </button>
      <button className="well-reset" title="Default colors (D)" onClick={() => setS({ fg: '#000000', bg: '#ffffff' })}>
        <span />
        <span />
      </button>
      {edit && (
        <Popover anchor={edit === 'fg' ? fgRef.current : bgRef.current} onClose={() => setEdit(null)}>
          <div className="popover-title">{edit === 'fg' ? 'Foreground color' : 'Background color'}</div>
          <ColorPicker color={edit === 'fg' ? fg : bg} onChange={(c) => setS(edit === 'fg' ? { fg: c } : { bg: c })} />
        </Popover>
      )}
    </div>
  );
}
