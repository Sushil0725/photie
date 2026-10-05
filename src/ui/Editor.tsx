import { useEffect, useState } from 'react';
import { PanelRight, PanelLeft } from 'lucide-react';
import { useEditor } from '../store/editor';
import { CanvasView } from './canvas/CanvasView';
import { OptionsBar } from './OptionsBar';
import { RightPanel } from './panels/RightPanel';
import { SideNav, SidePanel } from './side/SidePanel';
import { Toolbar } from './Toolbar';
import { TopBar } from './TopBar';
import { setS } from '../store/editor';

function StatusBar() {
  const zoom = useEditor((s) => s.zoom);
  const doc = useEditor((s) => s.doc);
  const sel = useEditor((s) => s.selection);
  const label = useEditor((s) => s.presentLabel);
  return (
    <footer className="statusbar">
      <span>{Math.round(zoom * 100)}%</span>
      {doc && (
        <span>
          {doc.width} × {doc.height} px
        </span>
      )}
      {sel && (
        <span>
          Selection {sel.bounds.w} × {sel.bounds.h}
        </span>
      )}
      <span className="status-last">{label}</span>
    </footer>
  );
}

export function Editor() {
  const [showRight, setShowRight] = useState(() => window.innerWidth > 900);
  const sidePanel = useEditor((s) => s.sidePanel);
  useEffect(() => {
    if (window.innerWidth < 900) setS({ sidePanel: null });
  }, []);
  return (
    <div className={'editor' + (showRight ? '' : ' no-right') + (sidePanel ? ' has-side' : '')}>
      <TopBar />
      <OptionsBar />
      <div className="workspace">
        <SideNav />
        <SidePanel />
        <Toolbar />
        <div className="stage">
          <CanvasView />
          <div className="stage-toggles">
            <button className="icon-btn floating show-sm" title="Toggle design panel" onClick={() => setS({ sidePanel: sidePanel ? null : 'templates' })}>
              <PanelLeft size={18} />
            </button>
            <button className="icon-btn floating" title={showRight ? 'Hide panels' : 'Show panels'} onClick={() => setShowRight(!showRight)}>
              <PanelRight size={18} />
            </button>
          </div>
        </div>
        {showRight && <RightPanel />}
      </div>
      <StatusBar />
    </div>
  );
}
