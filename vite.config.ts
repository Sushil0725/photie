import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages serves the app from /<repo>/ (build with `--mode pages`), Vercel serves it from the root.
export default defineConfig(({ mode }) => ({
  base: mode === 'pages' || process.env.GITHUB_PAGES ? '/photie/' : '/',
  plugins: [react()],
  server: { watch: { ignored: ['**/dist-pages/**'] } },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1500,
  },
}));
