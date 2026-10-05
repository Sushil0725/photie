import type { ReactNode } from 'react';
import { Bandage, Crop, Eraser, MousePointerClick, ScanEye, Sparkles, Wand2, ImageOff, Paintbrush, Droplets, SunMedium, Contrast } from 'lucide-react';
import { activeLayer, setOpts, setS, setTool, toast, useEditor } from '../../store/editor';
import { contentAwareFill } from '../../store/image';
import { cmd } from '../actions';
import { AdjustSection, FilterPresets } from '../panels/PropertiesPanel';

function ActionCard({ icon, title, text, onClick }: { icon: ReactNode; title: string; text: string; onClick: () => void }) {
  return (
    <button className="action-card" onClick={onClick}>
      <span className="action-icon">{icon}</span>
      <span>
        <strong>{title}</strong>
        <small>{text}</small>
      </span>
    </button>
  );
}

export function EditPhotoTab() {
  useEditor((s) => s.doc);
  useEditor((s) => s.selectedIds);
  const l = activeLayer();
  if (!l) return <div className="empty-hint">Select a photo or layer on the canvas to edit it.</div>;
  return (
    <div className="tab-edit">
      <div className="btn-grid">
        <button className="btn small" onClick={() => cmd.filter('auto-tone')}>
          <Wand2 size={14} /> Auto enhance
        </button>
        <button className="btn small" onClick={() => import('../../engine/ai').then((m) => m.removeBackground())}>
          <ImageOff size={14} /> Remove BG
        </button>
        <button className="btn small" onClick={() => setTool('crop')}>
          <Crop size={14} /> Crop
        </button>
        <button className="btn small" onClick={() => cmd.filter('unsharp-mask')}>
          <ScanEye size={14} /> Sharpen
        </button>
        <button className="btn small" onClick={() => cmd.filter('levels')}>
          <SunMedium size={14} /> Levels
        </button>
        <button className="btn small" onClick={() => cmd.filter('curves')}>
          <Contrast size={14} /> Curves
        </button>
      </div>
      {l.type === 'raster' && <FilterPresets layer={l} />}
      <AdjustSection layer={l} />
      <p className="hint">These adjustments are non-destructive — change or reset them any time. For pixel-level tools see Image → Adjustments and the Filter menu.</p>
    </div>
  );
}

export function AITab() {
  const need = (fn: () => void) => () => {
    if (!activeLayer()) return toast('Select a photo layer first', 'error');
    fn();
  };
  return (
    <div className="tab-ai">
      <p className="hint">AI features run privately on your device. The first use downloads a small model.</p>
      <ActionCard icon={<ImageOff size={20} />} title="Background remover" text="Cut out the subject in one click (as an editable mask)." onClick={need(() => import('../../engine/ai').then((m) => m.removeBackground()))} />
      <ActionCard icon={<Sparkles size={20} />} title="Select subject" text="Automatically select the main subject." onClick={need(() => import('../../engine/ai').then((m) => m.selectSubject()))} />
      <ActionCard
        icon={<MousePointerClick size={20} />}
        title="Object select"
        text="Click any object in your photo to select it."
        onClick={() => {
          setTool('wand');
          setOpts({ wandVariant: 'object' });
          toast('Click on an object in your photo');
        }}
      />
      <ActionCard
        icon={<Bandage size={20} />}
        title="Magic eraser"
        text="Brush over unwanted objects or blemishes to remove them."
        onClick={() => {
          setTool('heal');
          toast('Paint over what you want to remove');
        }}
      />
      <ActionCard icon={<Eraser size={20} />} title="Remove selected area" text="Content-aware fill for the current selection." onClick={need(contentAwareFill)} />
      <ActionCard icon={<Wand2 size={20} />} title="Auto enhance" text="Fix tones and contrast automatically." onClick={need(() => cmd.filter('auto-tone'))} />
      <ActionCard
        icon={<Paintbrush size={20} />}
        title="Quick select brush"
        text="Paint over an area to select it."
        onClick={() => {
          setTool('wand');
          setOpts({ wandVariant: 'selectBrush' });
        }}
      />
      <ActionCard icon={<Droplets size={20} />} title="Portrait blur" text="Select subject, then blur the background with Filter → Blur." onClick={need(() => setS({ dialog: { type: 'filter', id: 'tilt-shift' } }))} />
    </div>
  );
}
