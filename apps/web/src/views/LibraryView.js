import { AniDokiAPI } from '../api.js';
import { renderCard } from '../components/MovieCard.js';
import { POSTER_PLACEHOLDER } from '../utils/assets.js';

let currentLibTab = 'all';
let currentLibQuery = '';

export function initLibraryView() {
  const tabs = document.querySelectorAll('.lib-tab-btn');
  tabs.forEach(btn => {
    btn.addEventListener('click', () => {
      tabs.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentLibTab = btn.dataset.tab || 'all';
      loadLibraryView(currentLibTab, currentLibQuery);
    });
  });

  let searchTimeout = null;
  const searchInput = document.getElementById('library-search-input');
  searchInput?.addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      currentLibQuery = e.target.value.trim();
      loadLibraryView(currentLibTab, currentLibQuery);
    }, 300);
  });

  document.getElementById('library-login-btn')?.addEventListener('click', () => {
    document.getElementById('login-modal')?.classList.add('active');
  });
}

export async function loadLibraryView(tab = currentLibTab, query = currentLibQuery) {
  const unauthEl = document.getElementById('library-unauth-state');
  const emptyEl = document.getElementById('library-empty-state');
  const grid = document.getElementById('library-grid');
  const countAll = document.getElementById('lib-count-all');
  const countWatching = document.getElementById('lib-count-watching');
  const countPlan = document.getElementById('lib-count-plan');
  const countCompleted = document.getElementById('lib-count-completed');

  if (!AniDokiAPI.getToken()) {
    if (unauthEl) unauthEl.style.display = 'flex';
    if (emptyEl) emptyEl.style.display = 'none';
    if (grid) grid.innerHTML = '';
    if (countAll) countAll.textContent = '0';
    if (countWatching) countWatching.textContent = '0';
    if (countPlan) countPlan.textContent = '0';
    if (countCompleted) countCompleted.textContent = '0';
    return;
  }

  if (unauthEl) unauthEl.style.display = 'none';
  if (grid) grid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--text-muted);">Đang tải thư viện...</div>`;

  try {
    const params = {};
    if (tab && tab !== 'all') params.status = tab;
    if (query) params.q = query;

    const res = await AniDokiAPI.getLibrary(params);
    const items = res.data || [];
    const counts = res.counts || { all: 0, plan_to_watch: 0, watching: 0, completed: 0 };

    if (countAll) countAll.textContent = counts.all;
    if (countWatching) countWatching.textContent = counts.watching;
    if (countPlan) countPlan.textContent = counts.plan_to_watch;
    if (countCompleted) countCompleted.textContent = counts.completed;

    if (!items.length) {
      if (emptyEl) {
        emptyEl.style.display = 'flex';
        const emptyTitle = document.getElementById('library-empty-title');
        const emptyDesc = document.getElementById('library-empty-desc');
        if (query) {
          if (emptyTitle) emptyTitle.textContent = `Không tìm thấy anime khớp với "${query}"`;
          if (emptyDesc) emptyDesc.textContent = 'Hãy thử tìm kiếm với từ khóa khác.';
        } else {
          const tabNames = {
            all: 'Thư viện chưa có phim',
            watching: 'Chưa có phim đang xem',
            plan_to_watch: 'Chưa có phim muốn xem sau',
            completed: 'Chưa có phim đã hoàn thành'
          };
          if (emptyTitle) emptyTitle.textContent = tabNames[tab] || 'Thư viện trống';
          if (emptyDesc) emptyDesc.textContent = 'Khám phá ngay kho anime phong phú của anidoki để lưu phim yêu thích nhé!';
        }
      }
      if (grid) grid.innerHTML = '';
      return;
    }

    if (emptyEl) emptyEl.style.display = 'none';
    if (grid) {
      grid.innerHTML = '';
      items.forEach(item => {
        let anime = item.anime;
        if (!anime || typeof anime !== 'object' || !anime.title) {
          if (item.title || item.coverImage || item.id) {
            anime = { ...item };
          } else {
            anime = {
              id: item.animeId || item.id || item.slug,
              title: { english: item.animeId || item.id || 'Anime' },
              coverImage: POSTER_PLACEHOLDER
            };
          }
        }

        if (typeof anime.title === 'string') {
          anime.title = { english: anime.title, vietnamese: anime.title };
        } else if (!anime.title) {
          const fallbackTitle = item.animeId || item.id || item.slug || 'Anime';
          anime.title = { english: fallbackTitle, vietnamese: fallbackTitle };
        }

        anime.id = anime.id || item.animeId || item.id || item.slug;
        anime.coverImage = anime.coverImage || anime.posterUrl || anime.poster_url || POSTER_PLACEHOLDER;

        const card = renderCard(anime);

        const statusMap = {
          plan_to_watch: { label: 'Muốn xem', bg: '#4a90e2' },
          watching: { label: 'Đang xem', bg: '#50e3c2' },
          completed: { label: 'Hoàn thành', bg: '#b8e986' }
        };
        const currentStatus = item.libraryStatus || (statusMap[item.status] ? item.status : 'plan_to_watch');
        const info = statusMap[currentStatus] || { label: 'Muốn xem', bg: '#4a90e2' };
        const badge = document.createElement('div');
        badge.style.cssText = `position: absolute; top: 8px; left: 8px; background: ${info.bg}; color: #fff; font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 4px; z-index: 3;`;
        badge.textContent = info.label;
        card.querySelector('.anime-card-poster')?.appendChild(badge);

        grid.appendChild(card);
      });
    }
  } catch {
    if (grid) grid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: #ff5252;">Lỗi tải dữ liệu thư viện. Vui lòng thử lại.</div>`;
  }
}
