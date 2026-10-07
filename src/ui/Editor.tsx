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

/** Below this width the side and right panels float over the canvas (see app.css). */
const NARROW = '(max-width: 1000px)';
const isNarrow = () => window.matchMedia(NARROW).matches;

export function Editor() {
  const [showRight, setShowRight] = useState(() => !isNarrow());
  const sidePanel = useEditor((s) => s.sidePanel);
  useEffect(() => {
    if (isNarrow()) setS({ sidePanel: null });
    // Shrinking the window: keep at most one floating panel so the canvas stays visible.
    const mq = window.matchMedia(NARROW);
    const onChange = () => {
      if (mq.matches && useEditor.getState().sidePanel) setShowRight(false);
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  // On narrow screens the panels overlay the canvas, so opening one closes the other.
  useEffect(() => {
    if (sidePanel && isNarrow()) setShowRight(false);
  }, [sidePanel]);
  const toggleRight = () => {
    if (!showRight && isNarrow()) setS({ sidePanel: null });
    setShowRight(!showRight);
  };
  return (
    <div className={'editor' + (showRight ? '' : ' no-right') + (sidePanel ? ' has-side' : '')}>
      <TopBar />
      <OptionsBar />
      <div className="workspace">
        <SideNav />
        <SidePanel />
        <Toolbar />
        <div
          className="stage"
          onPointerDownCapture={() => {
            // Working on the canvas tucks the floating design panel away (Canva-style on tablets/phones).
            if (isNarrow() && useEditor.getState().sidePanel) setS({ sidePanel: null });
          }}
        >
          <CanvasView />
          <div className="stage-toggles">
            <button className="icon-btn floating show-sm" title="Toggle design panel" onClick={() => setS({ sidePanel: sidePanel ? null : 'templates' })}>
              <PanelLeft size={18} />
            </button>
            <button className="icon-btn floating" title={showRight ? 'Hide panels' : 'Show panels'} onClick={toggleRight}>
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
