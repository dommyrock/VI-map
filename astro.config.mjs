// @ts-check
import { defineConfig } from 'astro/config';
import preact from '@astrojs/preact';

export default defineConfig({
  integrations: [preact()],
  devToolbar: { enabled: false },
  vite: {
    // MapLibre spawns its own worker from a URL we hand it (see src/views/maplibre/index.ts).
    optimizeDeps: { exclude: ['maplibre-gl'] },
  },
});
