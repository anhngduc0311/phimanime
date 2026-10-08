import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { app } from './app.js';
import { initKKUserData } from './kkphim.js';
import { loadBrowseEntries } from './services/kkphim.service.js';
import { syncPrimarySearch } from './services/meilisearch.service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const PORT = process.env.PORT || 3000;

// Khởi tạo migrations & dữ liệu
await initKKUserData();

// Khởi chạy server khi chạy trực tiếp
const isDirectRun = process.argv[1] && (
  path.resolve(process.argv[1]) === path.resolve(__filename) ||
  process.argv[1].endsWith('server.js')
);

if (isDirectRun) {
  let refreshingSearch = false;
  const refreshSearch = async () => {
    if (refreshingSearch) return;
    refreshingSearch = true;
    try {
      const items = await loadBrowseEntries('/v1/api/danh-sach/hoat-hinh', { country: 'nhat-ban' });
      if (process.env.MEILI_MASTER_KEY) {
        const count = await syncPrimarySearch(items);
        console.log(`Meilisearch: indexed ${count} anime entries`);
      }
    } catch (error) { console.warn('Catalog refresh unavailable:', error.message); }
    finally { refreshingSearch = false; }
  };
  void refreshSearch();
  setInterval(refreshSearch, 5 * 60 * 1000).unref();
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 AniDoki API Server is running on http://127.0.0.1:${PORT}`);
    console.log(`🐘 Connected to PostgreSQL (Docker container on port ${process.env.PGPORT || 5438})`);
  });
}

export { app };
