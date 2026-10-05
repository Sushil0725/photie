import { useEffect } from 'react';
import { Type } from 'lucide-react';
import { loadFonts } from '../../engine/fonts';
import { TEXT_COMBOS, TEXT_PRESETS, addCombo, addTextPreset } from '../../store/elements';
import { setTool } from '../../store/editor';
import { dragData } from './SidePanel';

export function TextTab() {
  useEffect(() => {
    loadFonts(TEXT_COMBOS.flatMap((c) => c.preview.map((p) => p.font)));
  }, []);
  return (
    <div className="tab-text">
      <button className="btn primary wide" onClick={() => setTool('text')}>
        <Type size={16} /> Text tool — click on canvas
      </button>
      <h5>Default text styles</h5>
      {TEXT_PRESETS.map((p, i) => (
        <button
          key={p.id}
          className={'text-preset level-' + i}
          draggable
          onDragStart={(e) => dragData(e, { type: 'text', id: p.id })}
          onClick={() => addTextPreset(p)}
        >
          {p.label}
        </button>
      ))}
      <h5>Font combinations</h5>
      <div className="combo-grid">
        {TEXT_COMBOS.map((c) => (
          <button
            key={c.id}
            className="combo"
            style={{ background: c.bg || 'var(--card)' }}
            draggable
            onDragStart={(e) => dragData(e, { type: 'text', id: c.id })}
            onClick={() => addCombo(c)}
          >
            {c.preview.map((p, i) => (
              <span
                key={i}
                style={{
                  fontFamily: `"${p.font}"`,
                  fontWeight: p.weight,
                  color: c.bg && p.color === '#111' ? '#fff' : p.color,
                  fontSize: Math.round(12 + p.size * 12),
                  letterSpacing: p.spacing ? p.spacing / 2 : undefined,
                  textTransform: p.upper ? 'uppercase' : undefined,
                  fontStyle: p.italic ? 'italic' : undefined,
                }}
              >
                {p.text}
              </span>
            ))}
          </button>
        ))}
      </div>
    </div>
  );
}
