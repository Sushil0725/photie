import { useEffect } from 'react';
import { Loader2, CheckCircle2, AlertCircle, Info } from 'lucide-react';
import { onFontsChanged } from './engine/fonts';
import { invalidate, useEditor } from './store/editor';
import { handlePasteEvent, markClipboardStale, saveNow, startAutosave } from './store/files';
import { applyTheme } from './ui/actions';
import { refreshThemeColors } from './ui/canvas/CanvasView';
import { Dialogs } from './ui/dialogs/Dialogs';
import { Editor } from './ui/Editor';
import { Home } from './ui/Home';
import { onBlur, onKeyDown, onKeyUp } from './ui/shortcuts';

function Toasts() {
  const toasts = useEditor((s) => s.toasts);
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={'toast ' + t.kind}>
          {t.kind === 'success' ? <CheckCircle2 size={16} /> : t.kind === 'error' ? <AlertCircle size={16} /> : <Info size={16} />}
          <span>{t.text}</span>
        </div>
      ))}
    </div>
  );
}

function Busy() {
  const busy = useEditor((s) => s.busy);
  if (!busy) return null;
  return (
    <div className="busy">
      <div className="busy-card">
        <Loader2 size={20} className="spin" />
        <span>{busy}</span>
      </div>
    </div>
  );
}

export default function App() {
  const screen = useEditor((s) => s.screen);

  useEffect(() => {
    applyTheme();
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const themeChanged = () => setTimeout(refreshThemeColors, 0);
    mq.addEventListener('change', themeChanged);
    window.addEventListener('photie:theme', themeChanged);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    window.addEventListener('blur', markClipboardStale);
    window.addEventListener('paste', handlePasteEvent);
    const offFonts = onFontsChanged(invalidate);
    const autosave = startAutosave();
    const unsub = useEditor.subscribe(autosave);
    const beforeUnload = (e: BeforeUnloadEvent) => {
      if (useEditor.getState().saveState === 'unsaved') {
        saveNow();
        e.preventDefault();
      }
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => {
      mq.removeEventListener('change', themeChanged);
      window.removeEventListener('photie:theme', themeChanged);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('blur', markClipboardStale);
      window.removeEventListener('paste', handlePasteEvent);
      window.removeEventListener('beforeunload', beforeUnload);
      offFonts();
      unsub();
    };
  }, []);

  return (
    <>
      {screen === 'home' ? <Home /> : <Editor />}
      <Dialogs />
      <Toasts />
      <Busy />
    </>
  );
}
