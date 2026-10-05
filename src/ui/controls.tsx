import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

export function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  onCommit,
  unit = '',
  format,
  centered,
}: {
  label?: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  onCommit?: (v: number) => void;
  unit?: string;
  format?: (v: number) => string;
  centered?: boolean;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  const zero = centered ? ((0 - min) / (max - min)) * 100 : 0;
  const lo = Math.min(pct, zero),
    hi = Math.max(pct, zero);
  return (
    <div className="slider">
      {label && (
        <div className="slider-head">
          <span>{label}</span>
          <NumberField
            value={value}
            min={min}
            max={max}
            step={step}
            onChange={(v) => {
              onChange(v);
              onCommit?.(v);
            }}
            display={format}
            unit={unit}
          />
        </div>
      )}
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        style={{ background: `linear-gradient(90deg, var(--track) ${lo}%, var(--accent) ${lo}%, var(--accent) ${hi}%, var(--track) ${hi}%)` }}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        onPointerUp={(e) => onCommit?.(parseFloat((e.target as HTMLInputElement).value))}
        onKeyUp={(e) => onCommit?.(parseFloat((e.target as HTMLInputElement).value))}
        onDoubleClick={() => {
          if (centered) {
            onChange(0);
            onCommit?.(0);
          }
        }}
      />
    </div>
  );
}

export function NumberField({
  value,
  onChange,
  min = -Infinity,
  max = Infinity,
  step = 1,
  unit = '',
  display,
  label,
  width,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  display?: (v: number) => string;
  label?: string;
  width?: number;
}) {
  const fmt = (v: number) => (display ? display(v) : String(Math.round(v * 100) / 100));
  const [text, setText] = useState(fmt(value));
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setText(fmt(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  const commit = () => {
    const v = parseFloat(text);
    if (!isNaN(v)) {
      const c = Math.min(max, Math.max(min, v));
      onChange(c);
      setText(fmt(c));
    } else setText(fmt(value));
  };
  // Drag-to-scrub on the label, like Photoshop.
  const scrub = (e: React.PointerEvent) => {
    const startX = e.clientX;
    const start = value;
    const move = (ev: PointerEvent) => {
      const dv = Math.round((ev.clientX - startX) / 2) * step;
      onChange(Math.min(max, Math.max(min, +(start + dv).toFixed(4))));
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  return (
    <label className="numfield" style={width ? { width } : undefined}>
      {label && (
        <span className="numfield-label" onPointerDown={scrub}>
          {label}
        </span>
      )}
      <input
        value={text}
        inputMode="decimal"
        onFocus={(e) => {
          focused.current = true;
          e.target.select();
        }}
        onBlur={() => {
          focused.current = false;
          commit();
        }}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault();
            const d = (e.key === 'ArrowUp' ? 1 : -1) * step * (e.shiftKey ? 10 : 1);
            const v = Math.min(max, Math.max(min, value + d));
            onChange(v);
            setText(fmt(v));
          }
        }}
      />
      {unit && <span className="numfield-unit">{unit}</span>}
    </label>
  );
}

export function Select<T extends string | number>({
  value,
  options,
  onChange,
  className,
  title,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  className?: string;
  title?: string;
}) {
  return (
    <div className={'select ' + (className || '')} title={title}>
      <select
        value={String(value)}
        onChange={(e) => {
          const o = options.find((x) => String(x.value) === e.target.value);
          if (o) onChange(o.value);
        }}
      >
        {options.map((o) => (
          <option key={String(o.value)} value={String(o.value)}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown size={14} />
    </div>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label?: string; icon?: ReactNode; title?: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="segmented">
      {options.map((o) => (
        <button key={o.value} className={value === o.value ? 'active' : ''} title={o.title || o.label} onClick={() => onChange(o.value)}>
          {o.icon}
          {o.label && <span>{o.label}</span>}
        </button>
      ))}
    </div>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="toggle-track">
        <span className="toggle-thumb" />
      </span>
      {label && <span className="toggle-label">{label}</span>}
    </label>
  );
}

export function Check({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="check">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

export function IconButton({
  icon,
  title,
  onClick,
  active,
  disabled,
  className,
  children,
}: {
  icon?: ReactNode;
  title: string;
  onClick?: (e: React.MouseEvent) => void;
  active?: boolean;
  disabled?: boolean;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <button
      className={'icon-btn ' + (active ? 'active ' : '') + (className || '')}
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
    >
      {icon}
      {children}
    </button>
  );
}

export function Section({ title, children, right, collapsible = false, defaultOpen = true }: { title: string; children: ReactNode; right?: ReactNode; collapsible?: boolean; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="section">
      <header className={collapsible ? 'collapsible' : ''} onClick={() => collapsible && setOpen(!open)}>
        <h4>{title}</h4>
        {right}
        {collapsible && <ChevronDown size={14} className={open ? '' : 'rot'} />}
      </header>
      {open && <div className="section-body">{children}</div>}
    </section>
  );
}

export function Row({ children, gap = 8 }: { children: ReactNode; gap?: number }) {
  return (
    <div className="row" style={{ gap }}>
      {children}
    </div>
  );
}

/** Closes a popover when clicking outside of it. */
export function useOutside(ref: React.RefObject<HTMLElement | null>, onClose: () => void, active = true) {
  useEffect(() => {
    if (!active) return;
    const h = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    setTimeout(() => window.addEventListener('pointerdown', h, true));
    window.addEventListener('keydown', k);
    return () => {
      window.removeEventListener('pointerdown', h, true);
      window.removeEventListener('keydown', k);
    };
  }, [ref, onClose, active]);
}
