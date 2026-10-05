# Photie — Photo Editor & Design Studio

**Powerful like Photoshop. Easy like Canva. Free, private, and 100% in your browser.**

Photie is a full-featured image editor and graphic design tool that runs entirely client-side. Your photos never leave your device. Designs are autosaved privately in your browser (IndexedDB).

- **Live (Vercel):** https://photie.vercel.app
- **Live (GitHub Pages):** https://sushil0725.github.io/photie/

## Features

### Photoshop-style editing
- **Layers**: pixel, text and shape layers, opacity, 16 blend modes, lock / hide, reorder (drag & drop), rename, duplicate, merge down / merge visible / flatten, rasterize
- **Layer masks**: add from selection, paint to hide/reveal, invert, apply, disable
- **Selections**: rectangular & elliptical marquee, freehand & polygonal lasso, magic wand (tolerance, contiguous, sample all layers), selection brush, **AI object select** (click an object), **AI select subject**, add / subtract / intersect modes, feather, expand, contract, border, inverse, select layer pixels
- **Retouching tools**: brush & pencil (pen pressure), eraser & magic eraser, clone stamp, **healing brush / magic eraser** (content-aware), blur / sharpen / smudge, dodge / burn / sponge, paint bucket, gradient tool (linear, radial, angle, reflected)
- **Content-aware fill**: remove the selected area and fill it from the surroundings
- **AI background removal** (on-device, MediaPipe) as an editable mask
- **Adjustments**: Brightness/Contrast, Levels (with histogram), Curves (per channel), Exposure, Vibrance, Hue/Saturation (colorize), Color Balance, Black & White (with tint), Photo Filter, Shadows/Highlights, Gradient Map, Posterize, Threshold, Invert, Desaturate, Sepia, Auto Tone / Contrast / Color
- **Filters**: Gaussian, Motion, Radial & Tilt-Shift blur, Unsharp Mask, Sharpen, Add Noise, Reduce Noise (median), Oil Paint, Pixelate, Emboss, Find Edges, Solarize, Soft Glow, RGB Split, Halftone, Vignette, Twirl, Pinch, Spherize, Wave, Ripple, Clouds — all with live preview and selection-aware
- **Image**: image size (resample), canvas size (anchor), rotate / flip canvas, crop tool with ratios, crop to selection, trim
- **Transform**: move, scale, rotate with handles, smart guides & snapping, align & distribute, flip, nudge
- **History** panel with unlimited-feel undo/redo (memory aware)
- **Open & export**: PNG, JPG, WebP, PDF, **PSD (layers, import & export)**, and `.photie` project files

### Canva-style design
- **Templates** for Instagram posts & stories, YouTube thumbnails, posters, presentations, logos, business cards, invitations, Facebook covers and Nepali greetings (शुभ दीपावली)
- **Size presets** and **Magic Resize** for every major platform
- **Elements**: shapes, lines & arrows, photo frames (drag a photo onto a frame), 150+ icons, emoji stickers
- **Text**: 60+ Google Fonts (including Devanagari fonts for Nepali/Hindi), font combinations, curved text, outline, highlight background, shadow & glow, letter spacing, line height
- **Photos**: millions of free photos (Unsplash via Picsum, Openverse search), drag & drop onto the canvas
- **One-click photo filters** (Vivid, Noir, Vintage, Cinematic…) and non-destructive adjust sliders
- **Backgrounds**: colors, gradients, photo backgrounds, transparent
- **Uploads** library stored in your browser, paste images straight from the clipboard
- **My designs**: autosave, reopen, rename, delete

## Keyboard shortcuts

Photoshop-compatible: `V M L W C I J B S E G R O T U H Z` for tools, `Shift+letter` cycles tool variants, `[ ]` brush size, `D` / `X` colors, `Ctrl+Z` / `Ctrl+Shift+Z`, `Ctrl+J`, `Ctrl+E`, `Ctrl+A`, `Ctrl+D`, `Ctrl+Shift+I`, `Ctrl+T`, `Ctrl+0`, `Ctrl+1`, `Space` to pan, `Alt+Backspace` fill… Press `?` in the app for the full list.

## Development

```bash
npm install
npm run dev      # start the dev server
npm run build    # type-check and build to dist/
npm run preview  # preview the production build
npm run deploy:pages  # publish to GitHub Pages (gh-pages branch)
```

Tech: React 19, TypeScript, Vite, Zustand, Canvas 2D, MediaPipe Tasks (AI), ag-psd (PSD), Lucide icons.

```
src/
  engine/   rendering, filters, brushes, selections, inpainting, AI, export, storage
  store/    editor state, history (undo/redo), document operations
  ui/       React components: canvas, toolbars, panels, side panels, dialogs
  data/     templates, presets, filter definitions
```

## Deployment

- **Vercel** (auto-deploys every push to `main`): the repo includes `vercel.json` (Vite, output `dist/`). Import the repo at vercel.com/new or run `npx vercel --prod`.
- **GitHub Pages**: run `npm run deploy:pages`. It builds with base path `/photie/` and pushes the result to the `gh-pages` branch, which Pages serves.

## Credits

Stock photos from [Unsplash](https://unsplash.com) via [Picsum](https://picsum.photos) and [Openverse](https://openverse.org) (credit creators as their licenses require). Icons by [Lucide](https://lucide.dev). Fonts from [Google Fonts](https://fonts.google.com). On-device AI by [MediaPipe](https://ai.google.dev/edge/mediapipe).

## License

MIT
