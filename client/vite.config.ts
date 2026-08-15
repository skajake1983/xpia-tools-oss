import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Public site origin used in index.html SEO tags; deployers set VITE_PUBLIC_SITE_URL.
const siteUrl = process.env.VITE_PUBLIC_SITE_URL || 'https://your-domain.example';

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'html-site-url',
      transformIndexHtml(html) {
        return html.replace(/__SITE_URL__/g, siteUrl);
      },
    },
  ],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
