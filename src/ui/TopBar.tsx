import { useRef, useState } from 'react';
import { Check, Cloud, CloudOff, Download, Home, Loader2, Maximize, Moon, Redo2, Sun, Undo2, Expand } from 'lucide-react';
import { redo, setS, undo, useEditor } from '../store/editor';
import { goHome } from '../store/files';
import { setDocName } from '../store/image';
import { fitToScreen, setZoom, actualSize } from '../store/view';
import { buildMenus, getTheme, setTheme } from './actions';
import { MenuList } from './ContextMenu';
import { useOutside } from './controls';
import { Logo } from './Logo';

export function TopBar() {
  const [open, setOpen] = useState<string | null>(null);
  const barRef = useRef<HTMLDivElement>(null);
  useOutside(barRef, () => setOpen(null), !!open);
  const name = useEditor((s) => s.doc?.name || '');
  const canUndo = useEditor((s) => s.past.length > 0);
  const canRedo = useEditor((s) => s.future.length > 0);
  const save = useEditor((s) => s.saveState);
  const zoom = useEditor((s) => s.zoom);
  const size = useEditor((s) => (s.doc ? `${s.doc.width} × ${s.doc.height}` : ''));
  // Re-render menus with fresh state while open.
  useEditor((s) => (open ? s : null));
  const [themeDark, setThemeDark] = useState(() => getTheme() === 'dark' || (getTheme() === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches));
  const menus = open ? buildMenus() : buildMenus().map((m) => ({ ...m, items: [] }));

  return (
    <header className="topbar">
      <button className="brand" title="Home / My designs" onClick={() => goHome()}>
        <Logo size={26} />
        <span>Photie</span>
      </button>
      <nav className="menubar" ref={barRef}>
        {menus.map((m) => (
          <div key={m.id} className={'menubar-item' + (open === m.id ? ' open' : '')}>
            <button
              onClick={() => setOpen(open === m.id ? null : m.id)}
              onPointerEnter={() => open && open !== m.id && setOpen(m.id)}
            >
              {m.label}
            </button>
            {open === m.id && (
              <div className="menu-dropdown">
                <MenuList items={m.items} onClose={() => setOpen(null)} />
              </div>
            )}
          </div>
        ))}
      </nav>
      <div className="topbar-center">
        <input
          className="docname"
          value={name}
          spellCheck={false}
          onChange={(e) => setDocName(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          }}
          title="Rename design"
        />
        <span className="docsize">{size}</span>
        <span className={'savestate ' + save} title={save === 'saved' ? 'All changes saved in this browser' : save === 'saving' ? 'Saving…' : 'Unsaved changes'}>
          {save === 'saving' ? <Loader2 size={15} className="spin" /> : save === 'saved' ? <Cloud size={15} /> : save === 'unsaved' ? <CloudOff size={15} /> : <Check size={15} />}
        </span>
      </div>
      <div className="topbar-right">
        <button className="icon-btn" title="Undo (Ctrl+Z)" disabled={!canUndo} onClick={undo}>
          <Undo2 size={18} />
        </button>
        <button className="icon-btn" title="Redo (Ctrl+Shift+Z)" disabled={!canRedo} onClick={redo}>
          <Redo2 size={18} />
        </button>
        <div className="zoombox">
          <button className="icon-btn" title="Fit on screen (Ctrl+0)" onClick={fitToScreen}>
            <Maximize size={16} />
          </button>
          <select
            value=""
            onChange={(e) => {
              const v = e.target.value;
              if (v === 'fit') fitToScreen();
              else if (v === '1') actualSize();
              else if (v) setZoom(parseFloat(v));
            }}
            title="Zoom"
          >
            <option value="">{Math.round(zoom * 100)}%</option>
            <option value="fit">Fit</option>
            {[0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4, 8].map((z) => (
              <option key={z} value={z}>
                {z * 100}%
              </option>
            ))}
          </select>
        </div>
        <button
          className="icon-btn"
          title="Toggle theme"
          onClick={() => {
            setTheme(themeDark ? 'light' : 'dark');
            setThemeDark(!themeDark);
          }}
        >
          {themeDark ? <Sun size={17} /> : <Moon size={17} />}
        </button>
        <button className="btn ghost hide-sm" onClick={() => setS({ dialog: { type: 'resize' } })} title="Resize design">
          <Expand size={16} /> Resize
        </button>
        <button className="btn primary" onClick={() => setS({ dialog: { type: 'export' } })}>
          <Download size={16} /> <span className="hide-xs">Download</span>
        </button>
        <button className="icon-btn show-sm" title="Home" onClick={() => goHome()}>
          <Home size={18} />
        </button>
      </div>
    </header>
  );
}
