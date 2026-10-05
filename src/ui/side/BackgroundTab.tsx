import { picsum } from '../../data/templates';
import { fillToCss } from '../../engine/fill';
import type { Fill } from '../../engine/types';
import { S, endLive, live, useEditor } from '../../store/editor';
import { placeImageUrl } from '../../store/files';
import { setDocBackground } from '../../store/image';
import { FillPicker, GRADIENT_PRESETS, PALETTE } from '../ColorPicker';

const PHOTO_BGS = [1015, 1018, 1043, 10, 16, 29, 1036, 1039, 106, 152, 1067, 870];

export function BackgroundTab() {
  const bg = useEditor((s) => s.doc?.background ?? null);
  const set = (f: Fill | null) => setDocBackground(f);
  return (
    <div className="tab-bg">
      <h5>Colors</h5>
      <div className="swatches big">
        <button className={'swatch transparent' + (!bg ? ' active' : '')} title="Transparent" onClick={() => set(null)} />
        {PALETTE.map((c) => (
          <button key={c} className={'swatch' + (bg?.type === 'solid' && bg.color === c ? ' active' : '')} style={{ background: c }} onClick={() => set({ type: 'solid', color: c })} />
        ))}
      </div>
      <h5>Gradients</h5>
      <div className="swatches big">
        {GRADIENT_PRESETS.map((g, i) => (
          <button key={i} className="swatch" style={{ background: fillToCss(g) }} onClick={() => set(g)} />
        ))}
      </div>
      <h5>Custom</h5>
      <FillPicker fill={bg || { type: 'solid', color: '#ffffff' }} onChange={(f) => S().doc && live({ ...S().doc!, background: f })} onCommit={() => endLive('Background')} />
      <h5>Photo backgrounds</h5>
      <div className="bg-photos">
        {PHOTO_BGS.map((id) => (
          <button
            key={id}
            className="bg-photo"
            onClick={() => {
              const d = S().doc;
              if (!d) return;
              const k = Math.min(1, 2400 / Math.max(d.width, d.height));
              placeImageUrl(picsum(id, d.width * k, d.height * k), 'Background photo', { fill: true });
            }}
          >
            <img src={picsum(id, 200, 140)} alt="" loading="lazy" />
          </button>
        ))}
      </div>
    </div>
  );
}
