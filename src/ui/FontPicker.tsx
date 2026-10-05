import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Search } from 'lucide-react';
import { FONTS, FONT_CATEGORIES, loadFont } from '../engine/fonts';
import { Popover } from './ColorPicker';

function FontRow({ name, active, onPick }: { name: string; active: boolean; onPick: () => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        loadFont(name);
        io.disconnect();
      }
    });
    io.observe(el);
    return () => io.disconnect();
  }, [name]);
  return (
    <button ref={ref} className={'font-row' + (active ? ' active' : '')} style={{ fontFamily: `"${name}", system-ui` }} onClick={onPick}>
      {name}
    </button>
  );
}

export function FontPicker({ value, onChange }: { value: string; onChange: (font: string) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    loadFont(value);
  }, [value]);
  const groups = useMemo(() => {
    const ql = q.toLowerCase();
    return FONT_CATEGORIES.map((c) => ({ ...c, fonts: FONTS.filter((f) => f.category === c.id && f.name.toLowerCase().includes(ql)) })).filter((g) => g.fonts.length);
  }, [q]);
  return (
    <>
      <button ref={ref} className="font-picker-btn" onClick={() => setOpen(!open)} style={{ fontFamily: `"${value}", system-ui` }} title="Font">
        <span>{value}</span>
        <ChevronDown size={14} />
      </button>
      {open && (
        <Popover anchor={ref.current} onClose={() => setOpen(false)} width={270}>
          <div className="font-search">
            <Search size={14} />
            <input autoFocus placeholder="Search fonts" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.stopPropagation()} />
          </div>
          <div className="font-list">
            {groups.map((g) => (
              <div key={g.id}>
                <div className="font-group">{g.label}</div>
                {g.fonts.map((f) => (
                  <FontRow
                    key={f.name}
                    name={f.name}
                    active={f.name === value}
                    onPick={() => {
                      loadFont(f.name).then(() => onChange(f.name));
                      setOpen(false);
                    }}
                  />
                ))}
              </div>
            ))}
          </div>
        </Popover>
      )}
    </>
  );
}
