import { defineConfig, fontProviders } from 'astro/config';

import node from '@astrojs/node';

import tailwindcss from '@tailwindcss/vite';

import react from '@astrojs/react';

// https://astro.build/config
export default defineConfig({
  output: 'server',

  adapter: node({
    mode: 'standalone',
  }),

  experimental: {
    fonts: [
      {
        name: 'Inter Tight',
        cssVariable: '--font-inter',
        provider: fontProviders.fontsource(),
        weights: [400, 500, 600, 900],
        styles: ['normal'],
        subsets: ['latin'],
        optimizedFallbacks: false,
      },
    ],
  },

  vite: {
    plugins: [tailwindcss()],
  },

  integrations: [react()],
  server: {
    host: '0.0.0.0',
  },
});