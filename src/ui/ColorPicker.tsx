import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Pipette, Plus, Trash2 } from 'lucide-react';
import { fillToCss } from '../engine/fill';
import type { Fill, GradientStop } from '../engine/types';
import { hsvToRgb, parseColor, rgbToHsv, rgbaToCss, rgbaToHex } from '../engine/util';
import { pushRecentColor, useEditor } from '../store/editor';
import { Segmented, useOutside } from './controls';

export const PALETTE = [
  '#000000', '#3f3f46', '#71717a', '#a1a1aa', '#e4e4e7', '#ffffff',
  '#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16', '#22c55e',
  '#10b981', '#14b8a6', '#06b6d4', '#0ea5e9', '#3b82f6', '#6366f1',
  '#8b5cf6', '#a855f7', '#d946ef', '#ec4899', '#f43f5e', '#7c5cff',
];

export const GRADIENT_PRESETS: Fill[] = [
  { type: 'linear', angle: 135, stops: [{ offset: 0, color: '#667eea' }, { offset: 1, color: '#764ba2' }] },
  { type: 'linear', angle: 135, stops: [{ offset: 0, color: '#f093fb' }, { offset: 1, color: '#f5576c' }] },
  { type: 'linear', angle: 135, stops: [{ offset: 0, color: '#4facfe' }, { offset: 1, color: '#00f2fe' }] },
  { type: 'linear', angle: 135, stops: [{ offset: 0, color: '#43e97b' }, { offset: 1, color: '#38f9d7' }] },
  { type: 'linear', angle: 135, stops: [{ offset: 0, color: '#fa709a' }, { offset: 1, color: '#fee140' }] },
  { type: 'linear', angle: 135, stops: [{ offset: 0, color: '#30cfd0' }, { offset: 1, color: '#330867' }] },
  { type: 'linear', angle: 180, stops: [{ offset: 0, color: '#ff9a9e' }, { offset: 1, color: '#fecfef' }] },
  { type: 'linear', angle: 180, stops: [{ offset: 0, color: '#0f2027' }, { offset: 0.5, color: '#203a43' }, { offset: 1, color: '#2c5364' }] },
  { type: 'linear', angle: 90, stops: [{ offset: 0, color: '#ff512f' }, { offset: 1, color: '#dd2476' }] },
  { type: 'linear', angle: 90, stops: [{ offset: 0, color: '#f7971e' }, { offset: 1, color: '#ffd200' }] },
  { type: 'radial', stops: [{ offset: 0, color: '#fdfbfb' }, { offset: 1, color: '#ebedee' }] },
  { type: 'radial', stops: [{ offset: 0, color: '#ffecd2' }, { offset: 1, color: '#fcb69f' }] },
];

/* --------------------------------- Popover --------------------------------- */

export function Popover({ anchor, onClose, children, width = 260 }: { anchor: HTMLElement | null; onClose: () => void; children: ReactNode; width?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number }>({ left: -9999, top: -9999 });
  useOutside(ref, onClose);
  useLayoutEffect(() => {
    if (!anchor || !ref.current) return;
    const a = anchor.getBoundingClientRect();
    const h = ref.current.offsetHeight;
    let left = a.left;
    let top = a.bottom + 6;
    if (left + width > window.innerWidth - 8) left = window.innerWidth - width - 8;
    if (top + h > window.innerHeight - 8) top = Math.max(8, a.top - h - 6);
    if (top + h > window.innerHeight - 8) top = Math.max(8, window.innerHeight - h - 8);
    setPos({ left: Math.max(8, left), top });
  }, [anchor, width]);
  return createPortal(
    <div ref={ref} className="popover" style={{ left: pos.left, top: pos.top, width }} onKeyDown={(e) => e.stopPropagation()}>
      {children}
    </div>,
    document.body,
  );
}

/* ------------------------------- Color picker ------------------------------- */

export function ColorPicker({ color, onChange, onCommit, alpha = true }: { color: string; onChange: (c: string) => void; onCommit?: (c: string) => void; alpha?: boolean }) {
  const rgba = useMemo(() => parseColor(color), [color]);
  const [hsv, setHsv] = useState(() => rgbToHsv(rgba.r, rgba.g, rgba.b));
  const [a, setA] = useState(rgba.a);
  const [hex, setHex] = useState(rgbaToHex(rgba, false));
  const recent = useEditor((s) => s.recentColors);
  const last = useRef(color);

  // Sync when the color changes from outside.
  useEffect(() => {
    if (color === last.current) return;
    last.current = color;
    const c = parseColor(color);
    const h = rgbToHsv(c.r, c.g, c.b);
    setHsv((prev) => (h.s === 0 || h.v === 0 ? { ...h, h: prev.h } : h));
    setA(c.a);
    setHex(rgbaToHex(c, false));
  }, [color]);

  const emit = useCallback(
    (h: { h: number; s: number; v: number }, alphaV: number, commit = false) => {
      const rgb = hsvToRgb(h.h, h.s, h.v);
      const css = rgbaToCss({ ...rgb, a: alphaV });
      last.current = css;
      setHex(rgbaToHex({ ...rgb, a: 1 }, false));
      onChange(css);
      if (commit) onCommit?.(css);
    },
    [onChange, onCommit],
  );

  const drag = (el: HTMLElement, fn: (x: number, y: number) => void, end: () => void) => (e: React.PointerEvent) => {
    const r = el.getBoundingClientRect();
    const run = (ev: PointerEvent | React.PointerEvent) => fn(Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (ev.clientY - r.top) / r.height)));
    run(e);
    const move = (ev: PointerEvent) => run(ev);
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      end();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const svRef = useRef<HTMLDivElement>(null);
  const hueRef = useRef<HTMLDivElement>(null);
  const alphaRef = useRef<HTMLDivElement>(null);
  const hsvRef = useRef(hsv);
  hsvRef.current = hsv;
  const aRef = useRef(a);
  aRef.current = a;

  const pureHue = rgbaToCss({ ...hsvToRgb(hsv.h, 1, 1), a: 1 });
  const solidCss = rgbaToCss({ ...hsvToRgb(hsv.h, hsv.s, hsv.v), a: 1 });

  const pick = async () => {
    const ED = (window as unknown as { EyeDropper?: new () => { open: () => Promise<{ sRGBHex: string }> } }).EyeDropper;
    if (!ED) return;
    try {
      const res = await new ED().open();
      const c = parseColor(res.sRGBHex);
      const h = rgbToHsv(c.r, c.g, c.b);
      setHsv(h);
      emit(h, aRef.current, true);
      pushRecentColor(res.sRGBHex);
    } catch {
      /* cancelled */
    }
  };

  return (
    <div className="colorpicker">
      <div
        ref={svRef}
        className="cp-sv"
        style={{ background: pureHue }}
        onPointerDown={(e) =>
          drag(
            svRef.current!,
            (x, y) => {
              const h = { h: hsvRef.current.h, s: x, v: 1 - y };
              setHsv(h);
              emit(h, aRef.current);
            },
            () => emit(hsvRef.current, aRef.current, true),
          )(e)
        }
      >
        <div className="cp-sv-white" />
        <div className="cp-sv-black" />
        <div className="cp-sv-thumb" style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`, background: solidCss }} />
      </div>
      <div
        ref={hueRef}
        className="cp-hue"
        onPointerDown={(e) =>
          drag(
            hueRef.current!,
            (x) => {
              const h = { ...hsvRef.current, h: Math.min(359.9, x * 360) };
              setHsv(h);
              emit(h, aRef.current);
            },
            () => emit(hsvRef.current, aRef.current, true),
          )(e)
        }
      >
        <div className="cp-bar-thumb" style={{ left: `${(hsv.h / 360) * 100}%`, background: pureHue }} />
      </div>
      {alpha && (
        <div
          ref={alphaRef}
          className="cp-alpha"
          onPointerDown={(e) =>
            drag(
              alphaRef.current!,
              (x) => {
                const v = Math.round(x * 100) / 100;
                setA(v);
                emit(hsvRef.current, v);
              },
              () => emit(hsvRef.current, aRef.current, true),
            )(e)
          }
        >
          <div className="cp-alpha-fill" style={{ background: `linear-gradient(90deg, transparent, ${solidCss})` }} />
          <div className="cp-bar-thumb" style={{ left: `${a * 100}%`, background: rgbaToCss({ ...hsvToRgb(hsv.h, hsv.s, hsv.v), a }) }} />
        </div>
      )}
      <div className="cp-row">
        <span className="cp-preview" style={{ background: color }} />
        <input
          className="cp-hex"
          value={hex}
          onChange={(e) => setHex(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          }}
          onBlur={() => {
            const v = hex.startsWith('#') ? hex : '#' + hex;
            if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v)) {
              const c = parseColor(v);
              const h = rgbToHsv(c.r, c.g, c.b);
              setHsv(h);
              emit(h, aRef.current, true);
            } else setHex(rgbaToHex(parseColor(color), false));
          }}
        />
        {alpha && <span className="cp-alpha-num">{Math.round(a * 100)}%</span>}
        {'EyeDropper' in window && (
          <button className="icon-btn" title="Pick color from screen" onClick={pick}>
            <Pipette size={16} />
          </button>
        )}
      </div>
      {recent.length > 0 && (
        <>
          <div className="cp-label">Recent</div>
          <div className="swatches">
            {recent.map((c, i) => (
              <button
                key={c + i}
                className="swatch"
                style={{ background: c }}
                title={c}
                onClick={() => {
                  const p = parseColor(c);
                  const h = rgbToHsv(p.r, p.g, p.b);
                  setHsv(h);
                  setA(p.a);
                  emit(h, p.a, true);
                }}
              />
            ))}
          </div>
        </>
      )}
      <div className="cp-label">Palette</div>
      <div className="swatches">
        {PALETTE.map((c) => (
          <button
            key={c}
            className="swatch"
            style={{ background: c }}
            title={c}
            onClick={() => {
              const p = parseColor(c);
              const h = rgbToHsv(p.r, p.g, p.b);
              setHsv(h);
              setA(1);
              emit(h, 1, true);
            }}
          />
        ))}
      </div>
    </div>
  );
}

/** Swatch button that opens a color picker popover. */
export function ColorButton({
  color,
  onChange,
  onCommit,
  title = 'Color',
  alpha = true,
  size = 28,
  className,
}: {
  color: string;
  onChange: (c: string) => void;
  onCommit?: (c: string) => void;
  title?: string;
  alpha?: boolean;
  size?: number;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button
        ref={ref}
        className={'color-btn ' + (className || '')}
        title={title}
        style={{ width: size, height: size }}
        onClick={() => setOpen(!open)}
      >
        <span style={{ background: color }} />
      </button>
      {open && (
        <Popover
          anchor={ref.current}
          onClose={() => {
            setOpen(false);
            pushRecentColor(color);
          }}
        >
          <ColorPicker color={color} onChange={onChange} onCommit={onCommit} alpha={alpha} />
        </Popover>
      )}
    </>
  );
}

/* -------------------------------- Fill picker -------------------------------- */

export function FillPicker({ fill, onChange, onCommit, allowNone = false }: { fill: Fill | null; onChange: (f: Fill | null) => void; onCommit?: (f: Fill | null) => void; allowNone?: boolean }) {
  const [stop, setStop] = useState(0);
  const mode = fill ? fill.type : 'none';
  const toMode = (m: string) => {
    let next: Fill | null = null;
    const first = fill ? (fill.type === 'solid' ? fill.color : fill.stops[0].color) : '#7c5cff';
    const stops: GradientStop[] =
      fill && fill.type !== 'solid' ? fill.stops : [{ offset: 0, color: first }, { offset: 1, color: '#ffffff' }];
    if (m === 'solid') next = { type: 'solid', color: first };
    else if (m === 'linear') next = { type: 'linear', angle: fill?.type === 'linear' ? fill.angle : 90, stops };
    else if (m === 'radial') next = { type: 'radial', stops };
    onChange(next);
    onCommit?.(next);
    setStop(0);
  };
  const modes = [
    ...(allowNone ? [{ value: 'none', label: 'None' }] : []),
    { value: 'solid', label: 'Solid' },
    { value: 'linear', label: 'Linear' },
    { value: 'radial', label: 'Radial' },
  ];
  const setStopColor = (c: string, commit: boolean) => {
    if (!fill || fill.type === 'solid') return;
    const stops = fill.stops.map((s, i) => (i === stop ? { ...s, color: c } : s));
    const next = { ...fill, stops } as Fill;
    onChange(next);
    if (commit) onCommit?.(next);
  };
  return (
    <div className="fillpicker">
      <Segmented value={mode} options={modes as { value: string; label: string }[]} onChange={toMode} />
      {fill && fill.type === 'solid' && <ColorPicker color={fill.color} onChange={(c) => onChange({ type: 'solid', color: c })} onCommit={(c) => onCommit?.({ type: 'solid', color: c })} />}
      {fill && fill.type !== 'solid' && (
        <>
          <div className="grad-bar" style={{ background: fillToCss({ type: 'linear', angle: 90, stops: fill.stops }) }}>
            {fill.stops.map((s, i) => (
              <button
                key={i}
                className={'grad-stop ' + (i === stop ? 'active' : '')}
                style={{ left: `${s.offset * 100}%`, background: s.color }}
                onPointerDown={(e) => {
                  setStop(i);
                  const bar = (e.currentTarget.parentElement as HTMLElement).getBoundingClientRect();
                  const move = (ev: PointerEvent) => {
                    const off = Math.min(1, Math.max(0, (ev.clientX - bar.left) / bar.width));
                    const stops = fill.stops.map((st, j) => (j === i ? { ...st, offset: off } : st));
                    onChange({ ...fill, stops } as Fill);
                  };
                  const up = () => {
                    window.removeEventListener('pointermove', move);
                    window.removeEventListener('pointerup', up);
                    onCommit?.(fill);
                  };
                  window.addEventListener('pointermove', move);
                  window.addEventListener('pointerup', up);
                }}
              />
            ))}
          </div>
          <div className="row" style={{ gap: 6, justifyContent: 'space-between' }}>
            {fill.type === 'linear' ? (
              <label className="numfield" style={{ width: 110 }}>
                <span className="numfield-label">Angle</span>
                <input
                  type="number"
                  value={fill.angle}
                  onChange={(e) => {
                    const next = { ...fill, angle: parseFloat(e.target.value) || 0 };
                    onChange(next);
                    onCommit?.(next);
                  }}
                />
              </label>
            ) : (
              <span />
            )}
            <div className="row" style={{ gap: 4 }}>
              <button
                className="icon-btn"
                title="Add color stop"
                onClick={() => {
                  const stops = [...fill.stops, { offset: 0.5, color: fill.stops[stop]?.color || '#ffffff' }].sort((x, y) => x.offset - y.offset);
                  const next = { ...fill, stops } as Fill;
                  onChange(next);
                  onCommit?.(next);
                }}
              >
                <Plus size={15} />
              </button>
              <button
                className="icon-btn"
                title="Remove color stop"
                disabled={fill.stops.length <= 2}
                onClick={() => {
                  const stops = fill.stops.filter((_, i) => i !== stop);
                  const next = { ...fill, stops } as Fill;
                  setStop(0);
                  onChange(next);
                  onCommit?.(next);
                }}
              >
                <Trash2 size={15} />
              </button>
            </div>
          </div>
          <ColorPicker color={fill.stops[stop]?.color || '#000'} onChange={(c) => setStopColor(c, false)} onCommit={(c) => setStopColor(c, true)} />
        </>
      )}
      <div className="cp-label">Gradients</div>
      <div className="swatches">
        {GRADIENT_PRESETS.map((g, i) => (
          <button
            key={i}
            className="swatch"
            style={{ background: fillToCss(g) }}
            onClick={() => {
              onChange(g);
              onCommit?.(g);
            }}
          />
        ))}
      </div>
    </div>
  );
}

export function FillButton({ fill, onChange, onCommit, allowNone, title = 'Fill', size = 28 }: { fill: Fill | null; onChange: (f: Fill | null) => void; onCommit?: (f: Fill | null) => void; allowNone?: boolean; title?: string; size?: number }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button ref={ref} className="color-btn" title={title} style={{ width: size, height: size }} onClick={() => setOpen(!open)}>
        <span style={{ background: fill ? fillToCss(fill) : 'repeating-conic-gradient(#ccc 0 25%, #fff 0 50%) 0 0/8px 8px' }} />
      </button>
      {open && (
        <Popover anchor={ref.current} onClose={() => setOpen(false)} width={272}>
          <FillPicker fill={fill} onChange={onChange} onCommit={onCommit} allowNone={allowNone} />
        </Popover>
      )}
    </>
  );
}
