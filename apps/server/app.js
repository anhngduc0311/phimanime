import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { apiRouter } from './routes/index.js';
import { seoRouter } from './routes/seo.routes.js';
import { renderHtmlWithSeo } from './services/seoRenderer.service.js';
import { publicAnimeUrl } from '../../shared/animeUrls.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export const app = express();

app.use(cors());
app.use(express.json());
app.use((req, res, next) => {
  const canonical = publicAnimeUrl(req.originalUrl);
  if (req.method === 'GET' && canonical !== req.originalUrl) return res.redirect(301, canonical);
  next();
});

// Dynamic Sitemap & Robots.txt
app.use(seoRouter);

// Gắn toàn bộ API routes theo cấu trúc MVC
app.use('/api', apiRouter);
app.use('/api', seoRouter);

// Cấu hình phục vụ frontend SPA và các trang con với Server-Side Meta Injection (Direct URLs, Refresh, Bots)
const webDistPath = path.resolve(__dirname, '../web/dist');
const webSrcPath = path.resolve(__dirname, '../web');
const webStaticPath = fs.existsSync(webDistPath) ? webDistPath : webSrcPath;

if (fs.existsSync(webStaticPath)) {
  app.use(express.static(webStaticPath));
  app.use(async (req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api')) return next();
    try {
      const html = await renderHtmlWithSeo(req);
      if (html) {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        return res.send(html);
      }
    } catch (err) {
      console.warn('SSR SEO render warning:', err);
    }
    res.sendFile(path.join(webStaticPath, 'index.html'));
  });
}
