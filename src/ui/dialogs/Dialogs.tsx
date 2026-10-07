import { useEffect, useState, type ComponentType } from 'react';
import {
  Briefcase,
  Camera,
  CreditCard,
  Download,
  FileImage,
  FileText,
  Hexagon,
  Link2,
  Link2Off,
  Mail,
  MessageCircle,
  Monitor,
  Pin,
  Play,
  Presentation,
  Smartphone,
  Square,
  ThumbsUp,
} from 'lucide-react';
import { SIZE_PRESETS } from '../../data/presets';
import type { ExportFormat } from '../../engine/export';
import type { Fill } from '../../engine/types';
import { canvasToBlob, formatBytes } from '../../engine/util';
import { renderDocToCanvas } from '../../engine/render';
import { S, setS, toast, useEditor } from '../../store/editor';
import { downloadProject, exportCurrent, newDocument } from '../../store/files';
import { magicResize, resizeCanvas, resizeImage } from '../../store/image';
import { fitToScreen } from '../../store/view';
import { ColorButton } from '../ColorPicker';
import { Check, NumberField, Segmented, Select, Slider } from '../controls';
import { kb } from '../actions';
import { Modal } from './Modal';
import { FilterDialog } from './FilterDialog';

const close = () => setS({ dialog: null });

const PRESET_ICONS: Record<string, ComponentType<{ size?: number }>> = {
  Briefcase,
  Camera,
  CreditCard,
  FileImage,
  FileText,
  Hexagon,
  Mail,
  MessageCircle,
  Monitor,
  Pin,
  Play,
  Presentation,
  Smartphone,
  ThumbsUp,
};

export function PresetIcon({ name, size = 18 }: { name: string; size?: number }) {
  const I = PRESET_ICONS[name] || Square;
  return <I size={size} />;
}

/* -------------------------------- New design -------------------------------- */

function NewDialog() {
  const [w, setW] = useState(1080);
  const [h, setH] = useState(1080);
  const [name, setName] = useState('Untitled design');
  const [bgMode, setBgMode] = useState<'white' | 'transparent' | 'color'>('white');
  const [color, setColor] = useState('#f4f1ff');
  const create = () => {
    const bg: Fill | null = bgMode === 'transparent' ? null : { type: 'solid', color: bgMode === 'white' ? '#ffffff' : color };
    close();
    newDocument(Math.max(1, Math.min(12000, w)), Math.max(1, Math.min(12000, h)), name || 'Untitled design', bg);
  };
  return (
    <Modal
      title="Create a design"
      onClose={close}
      width={640}
      footer={
        <>
          <span className="muted">
            {w} × {h} px
          </span>
          <span style={{ flex: 1 }} />
          <button className="btn ghost" onClick={close}>
            Cancel
          </button>
          <button className="btn primary" onClick={create}>
            Create design
          </button>
        </>
      }
    >
      <div className="preset-list">
        {SIZE_PRESETS.map((p) => (
          <button
            key={p.id}
            className={'size-preset' + (w === p.width && h === p.height ? ' active' : '')}
            onClick={() => {
              setW(p.width);
              setH(p.height);
              if (/^Untitled/.test(name)) setName(p.name);
            }}
          >
            <PresetIcon name={p.icon} />
            <span>{p.name}</span>
            <small>
              {p.width}×{p.height}
            </small>
          </button>
        ))}
      </div>
      <div className="grid2" style={{ marginTop: 14 }}>
        <NumberField label="Width" value={w} min={1} max={12000} unit="px" onChange={setW} />
        <NumberField label="Height" value={h} min={1} max={12000} unit="px" onChange={setH} />
      </div>
      <label className="field">
        <span>Name</span>
        <input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && create()} />
      </label>
      <div className="prop-row">
        <span>Background</span>
        <Segmented
          value={bgMode}
          onChange={setBgMode}
          options={[
            { value: 'white', label: 'White' },
            { value: 'transparent', label: 'Transparent' },
            { value: 'color', label: 'Color' },
          ]}
        />
        {bgMode === 'color' && <ColorButton color={color} onChange={setColor} alpha={false} />}
      </div>
    </Modal>
  );
}

/* ---------------------------------- Export ---------------------------------- */

function ExportDialog() {
  const doc = useEditor((s) => s.doc)!;
  const [format, setFormat] = useState<ExportFormat | 'photie'>('png');
  const [scale, setScale] = useState(1);
  const [quality, setQuality] = useState(0.92);
  const [transparent, setTransparent] = useState(!doc.background);
  const [estimate, setEstimate] = useState<string>('');
  const pxW = Math.round(doc.width * scale),
    pxH = Math.round(doc.height * scale);

  useEffect(() => {
    if (format === 'psd' || format === 'pdf' || format === 'photie') return setEstimate('');
    let alive = true;
    const t = setTimeout(async () => {
      try {
        const k = Math.min(1, 600 / Math.max(doc.width, doc.height));
        const c = renderDocToCanvas(doc, k * scale, format === 'jpeg' || !transparent);
        const b = await canvasToBlob(c, `image/${format}`, quality);
        const ratio = 1 / (k * k);
        if (alive) setEstimate('≈ ' + formatBytes(b.size * ratio));
      } catch {
        if (alive) setEstimate('');
      }
    }, 250);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [doc, format, scale, quality, transparent]);

  const go = async () => {
    close();
    if (format === 'photie') return downloadProject();
    await exportCurrent(format, { scale, quality, transparent });
  };
  const copyPng = async () => {
    try {
      const blob = await canvasToBlob(renderDocToCanvas(doc, scale, !transparent));
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      toast('Image copied to clipboard', 'success');
      close();
    } catch {
      toast('Copy is not supported in this browser', 'error');
    }
  };

  return (
    <Modal
      title="Download"
      onClose={close}
      width={420}
      footer={
        <>
          {(format === 'png' || format === 'jpeg') && 'ClipboardItem' in window && (
            <button className="btn ghost" onClick={copyPng}>
              Copy image
            </button>
          )}
          <span style={{ flex: 1 }} />
          <button className="btn ghost" onClick={close}>
            Cancel
          </button>
          <button className="btn primary" onClick={go}>
            <Download size={16} /> Download
          </button>
        </>
      }
    >
      <label className="field">
        <span>File type</span>
        <Select
          value={format}
          onChange={setFormat}
          options={[
            { value: 'png', label: 'PNG — best quality, supports transparency' },
            { value: 'jpeg', label: 'JPG — small file size' },
            { value: 'webp', label: 'WebP — modern, small, transparent' },
            { value: 'pdf', label: 'PDF — for printing' },
            { value: 'psd', label: 'PSD — Photoshop document with layers' },
            { value: 'photie', label: 'Photie project — re-open & keep editing' },
          ]}
        />
      </label>
      {format !== 'photie' && format !== 'psd' && (
        <>
          <div className="field">
            <span>Size</span>
            <Segmented
              value={String(scale)}
              onChange={(v) => setScale(Number(v))}
              options={[0.5, 1, 2, 3].map((s) => ({ value: String(s), label: s + '×' }))}
            />
            <small className="muted">
              {pxW} × {pxH} px {estimate}
            </small>
          </div>
          {(format === 'jpeg' || format === 'webp') && <Slider label="Quality" value={Math.round(quality * 100)} min={10} max={100} unit="%" onChange={(v) => setQuality(v / 100)} />}
          {(format === 'png' || format === 'webp') && <Check checked={transparent} onChange={setTransparent} label="Transparent background" />}
        </>
      )}
      {format === 'psd' && <p className="hint">Each layer is exported as a separate pixel layer (effects and adjustments are baked in).</p>}
      {format === 'photie' && <p className="hint">Saves every layer, text and effect so you can open it again later in Photie (File → Open).</p>}
    </Modal>
  );
}

/* -------------------------------- Image size -------------------------------- */

function ImageSizeDialog() {
  const doc = useEditor((s) => s.doc)!;
  const [w, setW] = useState(doc.width);
  const [h, setH] = useState(doc.height);
  const [lock, setLock] = useState(true);
  const ratio = doc.width / doc.height;
  return (
    <Modal
      title="Image Size"
      onClose={close}
      width={380}
      footer={
        <>
          <span className="muted">
            Current: {doc.width} × {doc.height}
          </span>
          <span style={{ flex: 1 }} />
          <button className="btn ghost" onClick={close}>
            Cancel
          </button>
          <button
            className="btn primary"
            onClick={() => {
              close();
              resizeImage(w, h);
            }}
          >
            Resize
          </button>
        </>
      }
    >
      <p className="hint">Resamples all layers to the new pixel dimensions.</p>
      <div className="row" style={{ gap: 8, alignItems: 'center' }}>
        <NumberField label="W" value={w} min={1} max={12000} unit="px" onChange={(v) => { setW(Math.round(v)); if (lock) setH(Math.max(1, Math.round(v / ratio))); }} />
        <button className={'icon-btn' + (lock ? ' active' : '')} title="Constrain proportions" onClick={() => setLock(!lock)}>
          {lock ? <Link2 size={16} /> : <Link2Off size={16} />}
        </button>
        <NumberField label="H" value={h} min={1} max={12000} unit="px" onChange={(v) => { setH(Math.round(v)); if (lock) setW(Math.max(1, Math.round(v * ratio))); }} />
      </div>
      <div className="btn-row">
        {[25, 50, 75, 150, 200].map((p) => (
          <button key={p} className="btn small ghost" onClick={() => { setW(Math.round((doc.width * p) / 100)); setH(Math.round((doc.height * p) / 100)); }}>
            {p}%
          </button>
        ))}
      </div>
    </Modal>
  );
}

/* -------------------------------- Canvas size -------------------------------- */

function CanvasSizeDialog() {
  const doc = useEditor((s) => s.doc)!;
  const [w, setW] = useState(doc.width);
  const [h, setH] = useState(doc.height);
  const [anchor, setAnchor] = useState<[number, number]>([0.5, 0.5]);
  return (
    <Modal
      title="Canvas Size"
      onClose={close}
      width={380}
      footer={
        <>
          <span style={{ flex: 1 }} />
          <button className="btn ghost" onClick={close}>
            Cancel
          </button>
          <button
            className="btn primary"
            onClick={() => {
              close();
              resizeCanvas(w, h, anchor[0], anchor[1]);
            }}
          >
            Apply
          </button>
        </>
      }
    >
      <p className="hint">Adds or removes space around the image without resampling.</p>
      <div className="grid2">
        <NumberField label="W" value={w} min={1} max={12000} unit="px" onChange={(v) => setW(Math.round(v))} />
        <NumberField label="H" value={h} min={1} max={12000} unit="px" onChange={(v) => setH(Math.round(v))} />
      </div>
      <div className="field">
        <span>Anchor</span>
        <div className="anchor-grid">
          {[0, 0.5, 1].map((ay) =>
            [0, 0.5, 1].map((ax) => (
              <button key={ax + '-' + ay} className={anchor[0] === ax && anchor[1] === ay ? 'active' : ''} onClick={() => setAnchor([ax, ay])} />
            )),
          )}
        </div>
      </div>
    </Modal>
  );
}

/* -------------------------------- Magic resize -------------------------------- */

function ResizeDialog() {
  const doc = useEditor((s) => s.doc)!;
  const [w, setW] = useState(doc.width);
  const [h, setH] = useState(doc.height);
  return (
    <Modal
      title="Resize design"
      onClose={close}
      width={560}
      footer={
        <>
          <span className="muted">
            {w} × {h} px
          </span>
          <span style={{ flex: 1 }} />
          <button className="btn ghost" onClick={close}>
            Cancel
          </button>
          <button
            className="btn primary"
            onClick={() => {
              close();
              magicResize(w, h);
              requestAnimationFrame(fitToScreen);
            }}
          >
            Resize
          </button>
        </>
      }
    >
      <p className="hint">Scales and centers your design for a new format. Fine-tune positions afterwards.</p>
      <div className="preset-list compact">
        {SIZE_PRESETS.map((p) => (
          <button key={p.id} className={'size-preset' + (w === p.width && h === p.height ? ' active' : '')} onClick={() => { setW(p.width); setH(p.height); }}>
            <PresetIcon name={p.icon} size={16} />
            <span>{p.name}</span>
            <small>
              {p.width}×{p.height}
            </small>
          </button>
        ))}
      </div>
      <div className="grid2" style={{ marginTop: 12 }}>
        <NumberField label="W" value={w} min={1} max={12000} unit="px" onChange={(v) => setW(Math.round(v))} />
        <NumberField label="H" value={h} min={1} max={12000} unit="px" onChange={(v) => setH(Math.round(v))} />
      </div>
    </Modal>
  );
}

/* ------------------------------- Shortcuts / about ------------------------------- */

const SHORTCUTS: [string, string][] = [
  ['Move / select', 'V'],
  ['Marquee selection', 'M'],
  ['Lasso', 'L'],
  ['Magic wand / AI select', 'W'],
  ['Crop', 'C'],
  ['Eyedropper', 'I'],
  ['Healing / remove', 'J'],
  ['Brush / pencil', 'B'],
  ['Clone stamp', 'S'],
  ['Eraser', 'E'],
  ['Gradient / bucket', 'G'],
  ['Blur / sharpen / smudge', 'R'],
  ['Dodge / burn / sponge', 'O'],
  ['Text', 'T'],
  ['Shapes', 'U'],
  ['Hand (or hold Space)', 'H'],
  ['Zoom', 'Z'],
  ['Brush size smaller / bigger', '[ / ]'],
  ['Default / swap colors', 'D / X'],
  ['Undo / redo', kb('Mod+Z') + ' / ' + kb('Mod+Shift+Z')],
  ['Copy / paste / cut', kb('Mod+C') + ' / ' + kb('Mod+V') + ' / ' + kb('Mod+X')],
  ['Duplicate layer', kb('Mod+J')],
  ['Deselect (or duplicate if nothing selected)', kb('Mod+D')],
  ['Select all / inverse', kb('Mod+A') + ' / ' + kb('Mod+Shift+I')],
  ['Delete selection or layer', 'Delete'],
  ['Nudge layer (×10 with Shift)', 'Arrow keys'],
  ['New layer', kb('Mod+Shift+N')],
  ['Merge down / visible', kb('Mod+E') + ' / ' + kb('Mod+Shift+E')],
  ['Group / ungroup layers', kb('Mod+G') + ' / ' + kb('Mod+Shift+G')],
  ['Free transform', kb('Mod+T')],
  ['Zoom in / out / fit / 100%', kb('Mod+=') + ' / ' + kb('Mod+-') + ' / ' + kb('Mod+0') + ' / ' + kb('Mod+1')],
  ['Save / download', kb('Mod+S') + ' / ' + kb('Mod+Shift+S')],
  ['Fill with foreground / background', kb('Alt+Backspace') + ' / ' + kb('Mod+Backspace')],
  ['Content-aware fill selection', kb('Shift+Backspace')],
  ['Apply crop / finish polygon', 'Enter'],
  ['Cancel current action', 'Esc'],
];

function ShortcutsDialog() {
  return (
    <Modal title="Keyboard shortcuts" onClose={close} width={560}>
      <div className="shortcut-list">
        {SHORTCUTS.map(([a, k]) => (
          <div key={a} className="shortcut">
            <span>{a}</span>
            <kbd>{k}</kbd>
          </div>
        ))}
      </div>
    </Modal>
  );
}

function AboutDialog() {
  return (
    <Modal title="About Photie" onClose={close} width={440}>
      <p>
        <strong>Photie</strong> is a free, open-source photo editor and design tool that runs entirely in your browser — layers, masks, selections, retouching,
        filters and AI tools like Photoshop, with templates, elements and one-click editing like Canva.
      </p>
      <p className="hint">Your images never leave your device. Designs are saved privately in this browser.</p>
      <p className="hint">Stock photos: Unsplash via Picsum and Openverse (CC licensed). Icons: Lucide. AI: MediaPipe.</p>
    </Modal>
  );
}

/* ------------------------------ Confirm / prompt ------------------------------ */

function ConfirmDialog({ title, message, onOk, okLabel }: { title: string; message: string; onOk: () => void; okLabel?: string }) {
  return (
    <Modal
      title={title}
      onClose={close}
      width={400}
      footer={
        <>
          <span style={{ flex: 1 }} />
          <button className="btn ghost" onClick={close}>
            Cancel
          </button>
          <button
            className="btn primary"
            autoFocus
            onClick={() => {
              close();
              onOk();
            }}
          >
            {okLabel || 'OK'}
          </button>
        </>
      }
    >
      <p>{message}</p>
    </Modal>
  );
}

function PromptDialog({ title, label, value, onOk }: { title: string; label: string; value: string; onOk: (v: string) => void }) {
  const [v, setV] = useState(value);
  const ok = () => {
    close();
    onOk(v);
  };
  return (
    <Modal
      title={title}
      onClose={close}
      width={360}
      footer={
        <>
          <span style={{ flex: 1 }} />
          <button className="btn ghost" onClick={close}>
            Cancel
          </button>
          <button className="btn primary" onClick={ok}>
            OK
          </button>
        </>
      }
    >
      <label className="field">
        <span>{label}</span>
        <input autoFocus value={v} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && ok()} />
      </label>
    </Modal>
  );
}

export function Dialogs() {
  const d = useEditor((s) => s.dialog);
  if (!d) return null;
  if (d.type !== 'new' && d.type !== 'shortcuts' && d.type !== 'about' && d.type !== 'confirm' && d.type !== 'prompt' && !S().doc) return null;
  switch (d.type) {
    case 'new':
      return <NewDialog />;
    case 'export':
      return <ExportDialog />;
    case 'imageSize':
      return <ImageSizeDialog />;
    case 'canvasSize':
      return <CanvasSizeDialog />;
    case 'resize':
      return <ResizeDialog />;
    case 'filter':
      return <FilterDialog key={d.id} id={d.id} />;
    case 'shortcuts':
      return <ShortcutsDialog />;
    case 'about':
      return <AboutDialog />;
    case 'confirm':
      return <ConfirmDialog {...d} />;
    case 'prompt':
      return <PromptDialog {...d} />;
  }
}
