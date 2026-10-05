import { useEffect, useMemo, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { TEMPLATES, TEMPLATE_CATEGORIES, buildTemplate, templateThumb, type Template } from '../../data/templates';
import { S, commit, invalidate, setS, toast, withBusy } from '../../store/editor';
import { touchCanvas } from '../../engine/version';
import { openDoc } from '../../store/files';
import { fitToScreen } from '../../store/view';

/** Photos keep streaming in after the template opens; repaint when each arrives. */
const photoArrived = (c: HTMLCanvasElement) => {
  touchCanvas(c);
  invalidate();
  S().doc && setS({ doc: { ...S().doc! } });
};

export async function applyTemplate(t: Template) {
  const run = async () => {
    try {
      await withBusy('Loading template…', async () => {
        const doc = await buildTemplate(t, 1, { maxWait: 1500, onImage: photoArrived });
        const cur = S().doc;
        if (!cur) {
          openDoc(doc, 'New from template');
          return;
        }
        commit('Apply template', { ...doc, id: cur.id, name: /^Untitled/.test(cur.name) ? t.name : cur.name }, { selectedIds: [], selection: null });
        requestAnimationFrame(fitToScreen);
      });
    } catch (e) {
      toast('Could not load template: ' + (e as Error).message, 'error');
    }
  };
  const cur = S().doc;
  if (cur && cur.layers.length) {
    setS({
      dialog: {
        type: 'confirm',
        title: 'Use this template?',
        message: 'Your current design will be replaced with the template. You can undo this.',
        okLabel: 'Use template',
        onOk: run,
      },
    });
  } else run();
}

export async function openTemplateAsNew(t: Template) {
  try {
    await withBusy('Loading template…', async () => openDoc(await buildTemplate(t, 1, { maxWait: 1500, onImage: photoArrived }), 'New from template'));
  } catch (e) {
    toast('Could not load template: ' + (e as Error).message, 'error');
  }
}

export function TemplateCard({ t, onClick, width = 280 }: { t: Template; onClick: () => void; width?: number }) {
  const [src, setSrc] = useState<string | null>(null);
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    let alive = true;
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        io.disconnect();
        templateThumb(t, width).then((u) => alive && setSrc(u));
      }
    });
    io.observe(el);
    return () => {
      alive = false;
      io.disconnect();
    };
  }, [t, width]);
  return (
    <button ref={ref} className="template-card" onClick={onClick} title={`${t.name} · ${t.width}×${t.height}`}>
      <div className="template-thumb" style={{ aspectRatio: `${t.width} / ${t.height}` }}>
        {src ? <img src={src} alt={t.name} /> : <div className="skeleton" />}
      </div>
      <span>{t.name}</span>
    </button>
  );
}

export function TemplatesTab() {
  const [cat, setCat] = useState('All');
  const [q, setQ] = useState('');
  const list = useMemo(
    () => TEMPLATES.filter((t) => (cat === 'All' || t.category === cat) && (t.name + ' ' + t.category).toLowerCase().includes(q.toLowerCase())),
    [cat, q],
  );
  return (
    <div className="tab-templates">
      <div className="search">
        <Search size={15} />
        <input placeholder="Search templates" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.stopPropagation()} />
      </div>
      <div className="chips">
        {['All', ...TEMPLATE_CATEGORIES].map((c) => (
          <button key={c} className={'chip' + (cat === c ? ' active' : '')} onClick={() => setCat(c)}>
            {c}
          </button>
        ))}
      </div>
      <div className="masonry">
        {list.map((t) => (
          <TemplateCard key={t.id} t={t} onClick={() => applyTemplate(t)} />
        ))}
      </div>
      {!list.length && <div className="empty-hint">No templates match “{q}”.</div>}
    </div>
  );
}
