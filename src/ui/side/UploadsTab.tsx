import { useEffect, useMemo, useState } from 'react';
import { CloudUpload, Trash2 } from 'lucide-react';
import { deleteUpload, listUploads, type UploadItem } from '../../engine/storage';
import { pickFiles } from '../../engine/util';
import { activeLayer } from '../../store/editor';
import { fillFrameWithImage } from '../../store/elements';
import { placeImageFiles, placeImageUrl } from '../../store/files';
import { dragData } from './SidePanel';

export function UploadsTab() {
  const [items, setItems] = useState<UploadItem[]>([]);
  const [drag, setDrag] = useState(false);
  const refresh = () => listUploads().then(setItems);
  useEffect(() => {
    refresh();
    const h = () => refresh();
    window.addEventListener('photie:uploads', h);
    return () => window.removeEventListener('photie:uploads', h);
  }, []);
  const urls = useMemo(() => new Map(items.map((i) => [i.id, URL.createObjectURL(i.blob)])), [items]);
  useEffect(() => () => urls.forEach((u) => URL.revokeObjectURL(u)), [urls]);

  const use = (it: UploadItem) => {
    const url = urls.get(it.id)!;
    const l = activeLayer();
    if (l && l.type === 'raster' && l.clip) fillFrameWithImage(l.id, url);
    else placeImageUrl(url, it.name.replace(/\.[^.]+$/, ''));
  };

  return (
    <div className="tab-uploads">
      <div
        className={'dropzone' + (drag ? ' over' : '')}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          const files = Array.from(e.dataTransfer.files);
          if (files.length) placeImageFiles(files);
        }}
        onClick={async () => {
          const files = await pickFiles('image/*,.psd', true);
          if (files.length) placeImageFiles(files);
        }}
      >
        <CloudUpload size={26} />
        <strong>Upload files</strong>
        <span>Click or drop images here (JPG, PNG, WebP, GIF, SVG, PSD)</span>
      </div>
      <p className="hint">Uploads are stored privately in this browser.</p>
      <div className="upload-grid">
        {items.map((it) => (
          <div key={it.id} className="upload" title={it.name}>
            <img
              src={urls.get(it.id)}
              alt={it.name}
              draggable
              onDragStart={(e) => dragData(e, { type: 'image', url: urls.get(it.id), name: it.name })}
              onClick={() => use(it)}
            />
            <button
              className="upload-del"
              title="Remove upload"
              onClick={async () => {
                await deleteUpload(it.id);
                refresh();
              }}
            >
              <Trash2 size={13} />
            </button>
          </div>
        ))}
      </div>
      {!items.length && <div className="empty-hint">No uploads yet.</div>}
    </div>
  );
}
