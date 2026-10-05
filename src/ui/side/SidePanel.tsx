import type { ComponentType } from 'react';
import { CloudUpload, Image as ImageIcon, LayoutTemplate, PaintRoller, Shapes, SlidersHorizontal, Sparkles, Type, X } from 'lucide-react';
import { setS, useEditor, type SidePanel as Tab } from '../../store/editor';
import { TemplatesTab } from './TemplatesTab';
import { ElementsTab } from './ElementsTab';
import { TextTab } from './TextTab';
import { PhotosTab } from './PhotosTab';
import { UploadsTab } from './UploadsTab';
import { BackgroundTab } from './BackgroundTab';
import { EditPhotoTab, AITab } from './EditTabs';

const TABS: { id: Exclude<Tab, null>; label: string; icon: ComponentType<{ size?: number }> }[] = [
  { id: 'templates', label: 'Templates', icon: LayoutTemplate },
  { id: 'elements', label: 'Elements', icon: Shapes },
  { id: 'text', label: 'Text', icon: Type },
  { id: 'photos', label: 'Photos', icon: ImageIcon },
  { id: 'uploads', label: 'Uploads', icon: CloudUpload },
  { id: 'background', label: 'Background', icon: PaintRoller },
  { id: 'adjust', label: 'Edit Photo', icon: SlidersHorizontal },
  { id: 'ai', label: 'AI Magic', icon: Sparkles },
];

export function SideNav() {
  const tab = useEditor((s) => s.sidePanel);
  return (
    <nav className="sidenav" aria-label="Design panels">
      {TABS.map((t) => (
        <button key={t.id} className={'sidenav-btn' + (tab === t.id ? ' active' : '')} onClick={() => setS({ sidePanel: tab === t.id ? null : t.id })} title={t.label}>
          <t.icon size={20} />
          <span>{t.label}</span>
        </button>
      ))}
    </nav>
  );
}

export function SidePanel() {
  const tab = useEditor((s) => s.sidePanel);
  if (!tab) return null;
  const label = TABS.find((t) => t.id === tab)?.label;
  return (
    <aside className="sidepanel">
      <div className="sidepanel-head">
        <h3>{label}</h3>
        <button className="icon-btn" title="Close panel" onClick={() => setS({ sidePanel: null })}>
          <X size={16} />
        </button>
      </div>
      <div className="sidepanel-body">
        {tab === 'templates' && <TemplatesTab />}
        {tab === 'elements' && <ElementsTab />}
        {tab === 'text' && <TextTab />}
        {tab === 'photos' && <PhotosTab />}
        {tab === 'uploads' && <UploadsTab />}
        {tab === 'background' && <BackgroundTab />}
        {tab === 'adjust' && <EditPhotoTab />}
        {tab === 'ai' && <AITab />}
      </div>
    </aside>
  );
}

/** Starts a drag carrying a Photie item that the canvas understands. */
export function dragData(e: React.DragEvent, data: Record<string, unknown>) {
  e.dataTransfer.setData('application/x-photie', JSON.stringify(data));
  e.dataTransfer.effectAllowed = 'copy';
}
