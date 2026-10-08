import { router } from '../router.js';
import { switchView } from '../utils/ui.js';
import { loadBrowseView } from '../views/BrowseView.js';
import { openAnimeDetail } from '../views/DetailView.js';
import { openPlayerByRoute } from '../views/PlayerView.js';
import { loadLibraryView } from '../views/LibraryView.js';
import { loadHistoryView } from '../views/HistoryView.js';
import { loadAccountView } from '../views/AccountView.js';
import { loadHelpView } from '../views/HelpView.js';
import { loadAdminView } from '../views/AdminView.js';

import { setHomeSEO, updateSEO } from '../utils/seo.js';
import { startSpotlightTimer, ensureHomeLoaded } from '../views/HomeView.js';

// SPA ROUTE REGISTRATION
// ==========================================
export function registerRoutes() {
  router
    .addRoute('/', async () => {
      switchView('view-home');
      setHomeSEO();
      await ensureHomeLoaded();
      startSpotlightTimer();
    })
    .addRoute('/browse', (route) => {
      switchView('view-browse');
      return loadBrowseView(route);
    })
    .addRoute('/anime/:slug', (route) => {
      return openAnimeDetail(route.params.slug, false);
    })
    .addRoute('/watch/:slug/:episode', (route) => {
      return openPlayerByRoute(route.params.slug, route.params.episode);
    })
    .addRoute('/library', () => {
      switchView('view-library');
      updateSEO({
        title: 'Thư Viện Anime Của Tôi | AniDoki',
        description: 'Quản lý danh sách anime yêu thích, đang xem và xem sau của bạn tại AniDoki.'
      });
      return loadLibraryView();
    })
    .addRoute('/history', () => {
      switchView('view-history');
      updateSEO({
        title: 'Lịch Sử Xem Phim Hoạt Hình | AniDoki',
        description: 'Xem lại các tập anime bạn đã xem gần đây tại AniDoki.'
      });
      return loadHistoryView();
    })
    .addRoute('/account', () => {
      switchView('view-account');
      updateSEO({
        title: 'Tài Khoản & Thiết Lập | AniDoki',
        description: 'Thiết lập thông tin tài khoản và tùy chọn giao diện AniDoki.'
      });
      loadAccountView();
    })
    .addRoute('/help', () => {
      switchView('view-help');
      updateSEO({
        title: 'Trung Tâm Trợ Giúp & Góp Ý | AniDoki',
        description: 'Hướng dẫn sử dụng, giải đáp thắc mắc và đóng góp ý kiến xây dựng AniDoki.'
      });
      loadHelpView();
    })
    .addRoute('/admin', () => {
      loadAdminView('dashboard');
    })
    .addRoute('/admin/dashboard', () => {
      loadAdminView('dashboard');
    })
    .addRoute('/admin/anime', () => {
      loadAdminView('anime');
    })
    .addRoute('/admin/anime/:slug/episodes', (route) => {
      loadAdminView('episodes', route.params.slug);
    })
    .addRoute('/admin/homepage', () => {
      loadAdminView('homepage');
    })
    .addRoute('/admin/sync', () => {
      loadAdminView('sync');
    })
    .addRoute('/admin/reports', () => {
      loadAdminView('reports');
    })
    .addRoute('/admin/feedback', () => {
      loadAdminView('feedback');
    })
    .addRoute('/admin/users', () => {
      loadAdminView('users');
    })
    .addRoute('/admin/audit-logs', () => {
      loadAdminView('audit-logs');
    })
    .addRoute('/admin/settings', () => {
      loadAdminView('settings');
    })
    .setNotFound(() => {
      switchView('view-404');
      document.title = '404 - Không Tìm Thấy Trang | anidoki';
    });
}
