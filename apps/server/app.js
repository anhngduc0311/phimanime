import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { apiRouter } from './routes/index.js';
import { seoRouter } from './routes/seo.routes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export const app = express();

app.use(cors());
app.use(express.json());

// Dynamic Sitemap & Robots.txt
app.use(seoRouter);

// Gắn toàn bộ API routes theo cấu trúc MVC
app.use('/api', apiRouter);
app.use('/api', seoRouter);

// Cấu hình phục vụ frontend SPA và các trang con (Direct URLs, Refresh)
const webDistPath = path.resolve(__dirname, '../web/dist');
if (fs.existsSync(webDistPath)) {
  app.use(express.static(webDistPath));
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api')) return next();
    res.sendFile(path.join(webDistPath, 'index.html'));
  });
}
