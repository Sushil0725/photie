import { useEffect, useMemo, useState } from 'react';
import { FolderOpen, ImagePlus, MoreHorizontal, Plus, Trash2, Pencil, Sparkles, Layers, Wand2, LayoutTemplate, Moon, Sun, Code } from 'lucide-react';
import { SIZE_PRESETS } from '../data/presets';
import { TEMPLATES, TEMPLATE_CATEGORIES } from '../data/templates';
import { deleteProject, listProjects, renameProject, type ProjectMeta } from '../engine/storage';
import { pickFiles } from '../engine/util';
import { setS } from '../store/editor';
import { IMAGE_ACCEPT, newDocument, openFile, openSavedProject } from '../store/files';
import { getTheme, setTheme } from './actions';
import { ContextMenu } from './ContextMenu';
import { PresetIcon } from './dialogs/Dialogs';
import { Logo } from './Logo';
import { TemplateCard, openTemplateAsNew } from './side/TemplatesTab';

function ProjectCard({ p, onChange }: { p: ProjectMeta; onChange: () => void }) {
  const url = useMemo(() => (p.thumb ? URL.createObjectURL(p.thumb) : ''), [p.thumb]);
  useEffect(() => () => {
    if (url) URL.revokeObjectURL(url);
  }, [url]);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const when = new Date(p.updatedAt);
  return (
    <div className="project-card">
      <button className="project-thumb" onClick={() => openSavedProject(p.id)} style={{ aspectRatio: `${p.width} / ${p.height}` }}>
        {url ? <img src={url} alt={p.name} /> : <div className="skeleton" />}
      </button>
      <div className="project-meta">
        <div>
          <strong title={p.name}>{p.name}</strong>
          <small>
            {p.width}×{p.height} · {when.toLocaleDateString()}
          </small>
        </div>
        <button className="icon-btn" title="More" onClick={(e) => setMenu({ x: e.clientX, y: e.clientY })}>
          <MoreHorizontal size={16} />
        </button>
      </div>
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          items={[
            { label: 'Open', action: () => openSavedProject(p.id) },
            {
              label: 'Rename',
              icon: <Pencil size={13} />,
              action: () =>
                setS({
                  dialog: {
                    type: 'prompt',
                    title: 'Rename design',
                    label: 'Name',
                    value: p.name,
                    onOk: async (v) => {
                      if (v.trim()) await renameProject(p.id, v.trim());
                      onChange();
                    },
                  },
                }),
            },
            {
              label: 'Delete',
              icon: <Trash2 size={13} />,
              action: () =>
                setS({
                  dialog: {
                    type: 'confirm',
                    title: 'Delete design?',
                    message: `"${p.name}" will be permanently removed from this browser.`,
                    okLabel: 'Delete',
                    onOk: async () => {
                      await deleteProject(p.id);
                      onChange();
                    },
                  },
                }),
            },
          ]}
        />
      )}
    </div>
  );
}

export function Home() {
  const [projects, setProjects] = useState<ProjectMeta[]>([]);
  const [drag, setDrag] = useState(false);
  const [cat, setCat] = useState('All');
  const [dark, setDark] = useState(() => getTheme() === 'dark' || (getTheme() === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches));
  const refresh = () => listProjects().then(setProjects);
  useEffect(() => {
    refresh();
  }, []);

  const open = async () => {
    const [f] = await pickFiles(IMAGE_ACCEPT);
    if (f) openFile(f);
  };
  const templates = TEMPLATES.filter((t) => cat === 'All' || t.category === cat);

  return (
    <div
      className={'home' + (drag ? ' dragging' : '')}
      onDragOver={(e) => {
        e.preventDefault();
        setDrag(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDrag(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        const f = e.dataTransfer.files[0];
        if (f) openFile(f);
      }}
    >
      <header className="home-head">
        <div className="brand">
          <Logo size={32} />
          <span>Photie</span>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <button
            className="icon-btn"
            title="Toggle theme"
            onClick={() => {
              setTheme(dark ? 'light' : 'dark');
              setDark(!dark);
            }}
          >
            {dark ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <button className="btn ghost" onClick={open}>
            <FolderOpen size={16} /> <span className="hide-xs">Open</span>
          </button>
          <button className="btn primary" onClick={() => setS({ dialog: { type: 'new' } })}>
            <Plus size={16} /> Create a design
          </button>
        </div>
      </header>

      <main className="home-main">
        <section className="hero">
          <div className="hero-text">
            <h1>
              Edit photos like a pro.
              <br />
              <span className="grad-text">Design like it’s easy.</span>
            </h1>
            <p>Layers, masks, retouching, filters and AI background removal — plus templates, fonts, photos and elements. Free, private, right in your browser.</p>
            <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
              <button className="btn primary big" onClick={open}>
                <ImagePlus size={18} /> Edit a photo
              </button>
              <button className="btn big" onClick={() => setS({ dialog: { type: 'new' } })}>
                <LayoutTemplate size={18} /> Start a design
              </button>
            </div>
            <div className="hero-features">
              <span>
                <Layers size={15} /> Layers & masks
              </span>
              <span>
                <Wand2 size={15} /> 40+ filters
              </span>
              <span>
                <Sparkles size={15} /> AI remove background
              </span>
            </div>
          </div>
          <button className="dropzone hero-drop" onClick={open}>
            <ImagePlus size={34} />
            <strong>Drop an image here</strong>
            <span>or click to browse · JPG, PNG, WebP, PSD, .photie</span>
          </button>
        </section>

        <section>
          <h2>Create a design</h2>
          <div className="preset-row">
            <button className="preset-card custom" onClick={() => setS({ dialog: { type: 'new' } })}>
              <div className="preset-shape" style={{ aspectRatio: '1' }}>
                <Plus size={22} />
              </div>
              <strong>Custom size</strong>
              <small>Any dimensions</small>
            </button>
            {SIZE_PRESETS.slice(0, 12).map((p) => (
              <button key={p.id} className="preset-card" onClick={() => newDocument(p.width, p.height, p.name)}>
                <div className="preset-shape" style={{ aspectRatio: `${p.width} / ${p.height}` }}>
                  <PresetIcon name={p.icon} size={18} />
                </div>
                <strong>{p.name}</strong>
                <small>
                  {p.width} × {p.height}
                </small>
              </button>
            ))}
          </div>
        </section>

        {projects.length > 0 && (
          <section>
            <h2>Your designs</h2>
            <div className="project-grid">
              {projects.map((p) => (
                <ProjectCard key={p.id} p={p} onChange={refresh} />
              ))}
            </div>
          </section>
        )}

        <section>
          <div className="section-title-row">
            <h2>Start from a template</h2>
            <div className="chips">
              {['All', ...TEMPLATE_CATEGORIES].map((c) => (
                <button key={c} className={'chip' + (cat === c ? ' active' : '')} onClick={() => setCat(c)}>
                  {c}
                </button>
              ))}
            </div>
          </div>
          <div className="template-grid">
            {templates.map((t) => (
              <TemplateCard key={t.id} t={t} width={320} onClick={() => openTemplateAsNew(t)} />
            ))}
          </div>
        </section>
      </main>
      <footer className="home-foot">
        <span>Photie — your photos never leave your device.</span>
        <a href="https://github.com/Sushil0725/photie" target="_blank" rel="noreferrer">
          <Code size={14} /> Source on GitHub
        </a>
      </footer>
      {drag && <div className="drop-overlay">Drop to open</div>}
    </div>
  );
}
