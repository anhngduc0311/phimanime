import { router } from './router.js';
import { registerRoutes } from './router/routes.js';
import { restoreUserSession, initLoginModal } from './components/AuthModal.js';
import {
  initHeader,
  initGenreDropdown,
  initSearchModal,
  initWatchlistDrawer,
  refreshWatchlistCount
} from './components/Header.js';
import {
  loadContinueWatching
} from './views/HomeView.js';
import { initDetailEvents } from './views/DetailView.js';
import { initPlayerControls, initReportModal } from './views/PlayerView.js';
import { initBrowseView } from './views/BrowseView.js';
import { initLibraryView } from './views/LibraryView.js';
import { initHistoryView } from './views/HistoryView.js';
import { initAdminView } from './views/AdminView.js';
import { waitForStartupAssets } from './utils/startup.js';

// ==========================================
// STARTUP BOOTSTRAP
// ==========================================
document.addEventListener('DOMContentLoaded', async () => {
  try {
    registerRoutes();
    initHeader();
    initGenreDropdown();
    await restoreUserSession();
    await refreshWatchlistCount();
    initDetailEvents();
    initPlayerControls();
    initReportModal();
    await initBrowseView();
    initLibraryView();
    initHistoryView({
      onHistoryChanged: async () => {
        await loadContinueWatching();
      }
    });
    initSearchModal();
    initWatchlistDrawer();
    initLoginModal({
      onLoginSuccess: async () => {
        await refreshWatchlistCount();
        await loadContinueWatching();
      },
      onLogout: async () => {
        await refreshWatchlistCount();
        await loadContinueWatching();
      }
    });
    initAdminView();

    // Kích hoạt route hiện tại trên URL
    await router.handleRoute();
    await waitForStartupAssets();
  } catch (error) {
    console.error('Không thể hoàn tất khởi tạo AniDoki:', error);
  } finally {
    window.finishStartupLoading?.();
  }
});
