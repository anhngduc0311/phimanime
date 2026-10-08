import { defineConfig } from 'vite';
import { encodeHtmlBody } from './plugins/encode-html.js';

export default defineConfig(({ command }) => ({
  // Enable the asset host only after its DNS and HTTPS are ready.
  base: command === 'build' ? (process.env.WEB_ASSET_BASE || '/') : '/',
  plugins: [encodeHtmlBody()],
  build: {
    // Publish compiled assets without mappings back to the original source.
    sourcemap: false,
    minify: true,
    cssMinify: true
  },
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true
      },
      '/robots.txt': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true
      },
      '^/sitemap.*\\.xml$': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true
      }
    }
  }
}));
