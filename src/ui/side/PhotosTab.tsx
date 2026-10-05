import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Search, ImageUp } from 'lucide-react';
import { activeLayer } from '../../store/editor';
import { fillFrameWithImage } from '../../store/elements';
import { placeImageUrl } from '../../store/files';
import { dragData } from './SidePanel';

interface Photo {
  id: string;
  thumb: string;
  full: string;
  fallback?: string;
  author: string;
  w: number;
  h: number;
  credit: string;
}

const SUGGESTIONS = ['nature', 'city', 'food', 'people', 'abstract', 'flowers', 'mountains', 'beach', 'business', 'animals', 'texture', 'nepal'];

async function fetchPicsum(page: number): Promise<Photo[]> {
  const r = await fetch(`https://picsum.photos/v2/list?page=${page}&limit=30`);
  if (!r.ok) throw new Error('Photo service unavailable');
  const list: { id: string; author: string; width: number; height: number }[] = await r.json();
  return list.map((p) => {
    const k = Math.min(1, 2400 / Math.max(p.width, p.height));
    const fw = Math.round(p.width * k),
      fh = Math.round(p.height * k);
    return {
      id: 'p' + p.id,
      thumb: `https://picsum.photos/id/${p.id}/300/${Math.round((300 * p.height) / p.width)}`,
      full: `https://picsum.photos/id/${p.id}/${fw}/${fh}`,
      author: p.author,
      w: p.width,
      h: p.height,
      credit: `Photo by ${p.author} (Unsplash via Picsum)`,
    };
  });
}

async function fetchOpenverse(q: string, page: number): Promise<Photo[]> {
  const r = await fetch(`https://api.openverse.org/v1/images/?q=${encodeURIComponent(q)}&page_size=20&page=${page}&mature=false`);
  if (!r.ok) throw new Error('Search is busy, try again shortly');
  const json: { results: { id: string; thumbnail: string; url: string; width: number | null; height: number | null; creator: string | null; license: string; title: string }[] } = await r.json();
  return json.results.map((p) => ({
    id: 'o' + p.id,
    thumb: p.thumbnail,
    full: p.url,
    fallback: p.thumbnail,
    author: p.creator || 'Unknown',
    w: p.width || 4,
    h: p.height || 3,
    credit: `"${p.title}" by ${p.creator || 'unknown'} (CC ${p.license.toUpperCase()}, via Openverse)`,
  }));
}

export function PhotosTab() {
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const sentinel = useRef<HTMLDivElement>(null);
  const reqId = useRef(0);

  const load = useCallback(
    async (p: number, qq: string) => {
      const id = ++reqId.current;
      setLoading(true);
      setError('');
      try {
        const res = qq ? await fetchOpenverse(qq, p) : await fetchPicsum(p + 2);
        if (id !== reqId.current) return;
        setPhotos((prev) => (p === 1 ? res : [...prev, ...res.filter((x) => !prev.some((y) => y.id === x.id))]));
        setDone(res.length < 10);
      } catch (e) {
        if (id === reqId.current) setError((e as Error).message);
      } finally {
        if (id === reqId.current) setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    setPhotos([]);
    setPage(1);
    setDone(false);
    load(1, query);
  }, [query, load]);

  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting) && !loading && !done && photos.length) {
        const next = page + 1;
        setPage(next);
        load(next, query);
      }
    });
    io.observe(el);
    return () => io.disconnect();
  }, [loading, done, page, query, load, photos.length]);

  const use = (p: Photo, background = false) => {
    const l = activeLayer();
    if (!background && l && l.type === 'raster' && l.clip) {
      fillFrameWithImage(l.id, p.full, p.fallback);
      return;
    }
    placeImageUrl(p.full, p.credit.slice(0, 60), { fill: background, fallbackUrl: p.fallback });
  };

  const cols: Photo[][] = [[], []];
  const heights = [0, 0];
  for (const p of photos) {
    const i = heights[0] <= heights[1] ? 0 : 1;
    cols[i].push(p);
    heights[i] += p.h / p.w;
  }

  return (
    <div className="tab-photos">
      <form
        className="search"
        onSubmit={(e) => {
          e.preventDefault();
          setQuery(q.trim());
        }}
      >
        <Search size={15} />
        <input placeholder="Search millions of free photos" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.stopPropagation()} />
      </form>
      <div className="chips">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            className={'chip' + (query === s ? ' active' : '')}
            onClick={() => {
              setQ(s);
              setQuery(s);
            }}
          >
            {s}
          </button>
        ))}
      </div>
      <p className="hint">{query ? 'Openly licensed results from Openverse. Credit the creator when required.' : 'Free photos from Unsplash (via Picsum). Click to add, or drag onto the canvas or a frame.'}</p>
      <div className="photo-cols">
        {cols.map((col, ci) => (
          <div key={ci} className="photo-col">
            {col.map((p) => (
              <div key={p.id} className="photo" style={{ aspectRatio: `${p.w} / ${p.h}` }} title={p.credit}>
                <img
                  src={p.thumb}
                  alt={p.credit}
                  loading="lazy"
                  crossOrigin="anonymous"
                  draggable
                  onDragStart={(e) => dragData(e, { type: 'image', url: p.full, fallback: p.fallback, name: p.credit.slice(0, 60) })}
                  onClick={() => use(p)}
                  onError={(e) => ((e.target as HTMLImageElement).parentElement!.style.display = 'none')}
                />
                <button className="photo-bg-btn" title="Set as background" onClick={() => use(p, true)}>
                  <ImageUp size={14} />
                </button>
                <span className="photo-author">{p.author}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
      {error && <div className="empty-hint error">{error}</div>}
      {!loading && !error && !photos.length && <div className="empty-hint">No photos found.</div>}
      <div ref={sentinel} className="sentinel">
        {loading && <Loader2 size={18} className="spin" />}
      </div>
    </div>
  );
}
