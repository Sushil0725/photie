import { useEffect, useRef } from 'react';
import { History, Layers, SlidersHorizontal } from 'lucide-react';
import { jumpHistory, setS, useEditor } from '../../store/editor';
import { LayersPanel } from './LayersPanel';
import { PropertiesPanel } from './PropertiesPanel';

export function HistoryPanel() {
  const past = useEditor((s) => s.past);
  const future = useEditor((s) => s.future);
  const present = useEditor((s) => s.presentLabel);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.querySelector('.current')?.scrollIntoView({ block: 'nearest' });
  }, [past.length, future.length]);
  const items = [...past.map((e) => e.label), present, ...future.map((e) => e.label)];
  return (
    <div className="history" ref={ref}>
      {items.map((label, i) => (
        <button key={i} className={'history-item' + (i === past.length ? ' current' : i > past.length ? ' future' : '')} onClick={() => jumpHistory(i)}>
          <span className="history-dot" />
          {label}
        </button>
      ))}
    </div>
  );
}

export function RightPanel() {
  const tab = useEditor((s) => s.rightTab);
  const nLayers = useEditor((s) => s.doc?.layers.length || 0);
  return (
    <aside className="rightpanel">
      <div className="tabs">
        <button className={tab === 'design' ? 'active' : ''} onClick={() => setS({ rightTab: 'design' })}>
          <SlidersHorizontal size={15} /> Properties
        </button>
        <button className={tab === 'layers' ? 'active' : ''} onClick={() => setS({ rightTab: 'layers' })}>
          <Layers size={15} /> Layers <span className="count">{nLayers}</span>
        </button>
        <button className={tab === 'history' ? 'active' : ''} onClick={() => setS({ rightTab: 'history' })} title="History">
          <History size={15} />
        </button>
      </div>
      <div className="rightpanel-body">
        {tab === 'design' && <PropertiesPanel />}
        {tab === 'layers' && <LayersPanel />}
        {tab === 'history' && <HistoryPanel />}
      </div>
      {tab === 'design' && (
        <div className="mini-layers">
          <div className="mini-layers-head">
            <Layers size={14} /> Layers
          </div>
          <LayersPanel />
        </div>
      )}
    </aside>
  );
}
