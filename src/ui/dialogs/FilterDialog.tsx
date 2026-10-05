import { useEffect, useMemo, useRef, useState } from 'react';
import { defaultParams, filterById, type Params } from '../../data/filters';
import { curves as applyCurves, histogram } from '../../engine/filters';
import { createCanvas, ctx2d } from '../../engine/util';
import { activeLayer, S, setS } from '../../store/editor';
import { applyPixelOp, cancelPreview, commitPreview, previewPixelOp } from '../../store/image';
import { ColorButton } from '../ColorPicker';
import { Check, Select, Slider } from '../controls';
import { Modal } from './Modal';

type Pt = { x: number; y: number };
type Channel = 'rgb' | 'r' | 'g' | 'b';
const LINE: Pt[] = [
  { x: 0, y: 0 },
  { x: 255, y: 255 },
];

function useHistogram() {
  return useMemo(() => {
    const l = activeLayer();
    if (!l || l.type !== 'raster') return null;
    const src = S().editMask && l.mask ? l.mask : l.canvas;
    const k = Math.min(1, 400 / Math.max(src.width, src.height));
    const c = createCanvas(src.width * k, src.height * k);
    const ctx = ctx2d(c, true);
    ctx.drawImage(src, 0, 0, c.width, c.height);
    return histogram(ctx.getImageData(0, 0, c.width, c.height));
  }, []);
}

function HistogramView({ data, color = 'var(--text-dim)' }: { data: Uint32Array; color?: string }) {
  const max = Math.max(1, ...Array.from(data).slice(2, 254));
  let d = 'M0 100';
  for (let i = 0; i < 256; i++) d += ` L${i} ${100 - Math.min(100, (data[i] / max) * 100)}`;
  d += ' L255 100 Z';
  return (
    <svg viewBox="0 0 255 100" preserveAspectRatio="none" className="histogram">
      <path d={d} fill={color} opacity={0.5} />
    </svg>
  );
}

function CurvesEditor({ value, onChange, hist }: { value: Record<Channel, Pt[]>; onChange: (v: Record<Channel, Pt[]>) => void; hist: ReturnType<typeof histogram> | null }) {
  const [ch, setCh] = useState<Channel>('rgb');
  const svgRef = useRef<SVGSVGElement>(null);
  const pts = value[ch];
  const lutPath = useMemo(() => {
    // Draw the interpolated curve through a sampled LUT.
    const img = new ImageData(256, 1);
    for (let i = 0; i < 256; i++) {
      img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = i;
      img.data[i * 4 + 3] = 255;
    }
    if (ch === 'rgb') applyCurves(img, pts);
    else applyCurves(img, LINE, ch === 'r' ? pts : undefined, ch === 'g' ? pts : undefined, ch === 'b' ? pts : undefined);
    const off = ch === 'g' ? 1 : ch === 'b' ? 2 : 0;
    let d = '';
    for (let i = 0; i < 256; i++) d += (i ? ' L' : 'M') + i + ' ' + (255 - img.data[i * 4 + off]);
    return d;
  }, [pts, ch]);

  const toLocal = (e: { clientX: number; clientY: number }) => {
    const r = svgRef.current!.getBoundingClientRect();
    return { x: Math.round(((e.clientX - r.left) / r.width) * 255), y: Math.round(255 - ((e.clientY - r.top) / r.height) * 255) };
  };
  const update = (next: Pt[]) => onChange({ ...value, [ch]: next });

  const startDrag = (idx: number) => (e: React.PointerEvent) => {
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      const p = toLocal(ev);
      const list = [...value[ch]];
      const prev = list[idx - 1],
        next = list[idx + 1];
      const outside = p.y < -40 || p.y > 295;
      if (outside && list.length > 2 && idx !== 0 && idx !== list.length - 1) {
        list.splice(idx, 1);
        update(list);
        window.removeEventListener('pointermove', move);
        return;
      }
      list[idx] = {
        x: Math.max(prev ? prev.x + 1 : 0, Math.min(next ? next.x - 1 : 255, p.x)),
        y: Math.max(0, Math.min(255, p.y)),
      };
      update(list);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const colors: Record<Channel, string> = { rgb: 'var(--text)', r: '#ef4444', g: '#22c55e', b: '#3b82f6' };
  const histData = hist ? (ch === 'rgb' ? hist.l : hist[ch]) : null;

  return (
    <div className="curves">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <Select
          value={ch}
          options={[
            { value: 'rgb', label: 'RGB' },
            { value: 'r', label: 'Red' },
            { value: 'g', label: 'Green' },
            { value: 'b', label: 'Blue' },
          ]}
          onChange={setCh}
        />
        <button className="link-btn" onClick={() => update(LINE)}>
          Reset channel
        </button>
      </div>
      <div className="curves-box">
        {histData && <HistogramView data={histData} color={ch === 'rgb' ? 'var(--text-dim)' : colors[ch]} />}
        <svg
          ref={svgRef}
          viewBox="-4 -4 263 263"
          className="curves-svg"
          onPointerDown={(e) => {
            const p = toLocal(e);
            if (p.x <= 0 || p.x >= 255) return;
            const list = [...pts, { x: p.x, y: Math.max(0, Math.min(255, p.y)) }].sort((a, b) => a.x - b.x);
            update(list);
            const idx = list.findIndex((q) => q.x === p.x);
            startDrag(idx)(e);
          }}
        >
          {[64, 128, 192].map((v) => (
            <g key={v} stroke="var(--border)" strokeWidth="0.6">
              <line x1={v} y1={0} x2={v} y2={255} />
              <line x1={0} y1={v} x2={255} y2={v} />
            </g>
          ))}
          <line x1={0} y1={255} x2={255} y2={0} stroke="var(--border)" strokeDasharray="3 3" />
          <path d={lutPath} fill="none" stroke={colors[ch]} strokeWidth="2" />
          {pts.map((p, i) => (
            <circle key={i} cx={p.x} cy={255 - p.y} r={5} fill="var(--panel)" stroke={colors[ch]} strokeWidth="2" onPointerDown={startDrag(i)} style={{ cursor: 'grab' }} />
          ))}
        </svg>
      </div>
      <p className="hint">Click to add points · drag to adjust · drag a point off the graph to remove it.</p>
      <div className="btn-row">
        {[
          { name: 'Contrast', p: [{ x: 0, y: 0 }, { x: 64, y: 48 }, { x: 192, y: 208 }, { x: 255, y: 255 }] },
          { name: 'Brighten', p: [{ x: 0, y: 0 }, { x: 128, y: 160 }, { x: 255, y: 255 }] },
          { name: 'Darken', p: [{ x: 0, y: 0 }, { x: 128, y: 96 }, { x: 255, y: 255 }] },
          { name: 'Fade', p: [{ x: 0, y: 40 }, { x: 128, y: 132 }, { x: 255, y: 230 }] },
        ].map((pre) => (
          <button key={pre.name} className="btn small ghost" onClick={() => onChange({ ...value, rgb: pre.p })}>
            {pre.name}
          </button>
        ))}
      </div>
    </div>
  );
}

export function FilterDialog({ id }: { id: string }) {
  const f = filterById(id)!;
  const [params, setParams] = useState<Params>(() => defaultParams(f));
  const [curveState, setCurveState] = useState<Record<Channel, Pt[]>>({ rgb: LINE, r: LINE, g: LINE, b: LINE });
  const [previewOn, setPreviewOn] = useState(true);
  const [busy, setBusy] = useState(false);
  const previewKey = useRef('');
  const hist = useHistogram();
  const key = JSON.stringify([params, curveState]);

  const fn = useMemo(() => {
    if (id === 'curves') return (img: ImageData) => applyCurves(img, curveState.rgb, curveState.r, curveState.g, curveState.b);
    return (img: ImageData) => f.apply(img, params);
  }, [id, f, params, curveState]);

  useEffect(() => {
    if (!previewOn) {
      cancelPreview();
      previewKey.current = '';
      return;
    }
    setBusy(true);
    const t = setTimeout(() => {
      previewPixelOp(fn);
      previewKey.current = key;
      setBusy(false);
    }, 140);
    return () => clearTimeout(t);
  }, [fn, previewOn, key]);

  const close = () => {
    cancelPreview();
    setS({ dialog: null });
  };
  const ok = () => {
    setS({ dialog: null });
    if (previewOn && previewKey.current === key && S().preview) commitPreview(f.name);
    else {
      cancelPreview();
      applyPixelOp(f.name, fn);
    }
  };

  const setP = (k: string, v: number | boolean | string) => setParams((p) => ({ ...p, [k]: v }));

  return (
    <Modal
      title={f.name}
      onClose={close}
      width={id === 'curves' ? 360 : 340}
      className="filter-dialog"
      draggableBackdrop
      footer={
        <>
          <Check checked={previewOn} onChange={setPreviewOn} label={busy ? 'Preview…' : 'Preview'} />
          <span style={{ flex: 1 }} />
          <button className="btn ghost" onClick={() => setParams(defaultParams(f))}>
            Reset
          </button>
          <button className="btn ghost" onClick={close}>
            Cancel
          </button>
          <button className="btn primary" onClick={ok}>
            Apply
          </button>
        </>
      }
    >
      {id === 'levels' && hist && <HistogramView data={hist.l} />}
      {id === 'curves' && <CurvesEditor value={curveState} onChange={setCurveState} hist={hist} />}
      {(f.params || []).map((p) => {
        switch (p.type) {
          case 'heading':
            return (
              <h5 key={p.key} className="param-heading">
                {p.label}
              </h5>
            );
          case 'range':
            return <Slider key={p.key} label={p.label} value={Number(params[p.key])} min={p.min} max={p.max} step={p.step || 1} unit={p.unit} centered={p.centered} onChange={(v) => setP(p.key, v)} />;
          case 'check':
            return <Check key={p.key} checked={!!params[p.key]} onChange={(v) => setP(p.key, v)} label={p.label} />;
          case 'color':
            return (
              <div key={p.key} className="prop-row">
                <span>{p.label}</span>
                <ColorButton color={String(params[p.key])} onChange={(c) => setP(p.key, c)} alpha={false} />
              </div>
            );
          case 'select':
            return (
              <div key={p.key} className="prop-row">
                <span>{p.label}</span>
                <Select value={String(params[p.key])} options={p.options} onChange={(v) => setP(p.key, v)} />
              </div>
            );
        }
      })}
      {S().selection && <p className="hint">Applies only inside the current selection.</p>}
    </Modal>
  );
}
