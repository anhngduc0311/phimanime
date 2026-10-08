import { AniDokiAPI } from '../api.js';
import { showToast, showConfirmModal, formatTime } from '../utils/ui.js';
import { router } from '../router.js';
import { POSTER_PLACEHOLDER } from '../utils/assets.js';

let currentHistoryPage = 1;
let onHistoryChangedCallback = () => {};

export function setHistoryChangedCallback(cb) {
  onHistoryChangedCallback = cb;
}

export function initHistoryView(callbacks = {}) {
  if (callbacks.onHistoryChanged) {
    onHistoryChangedCallback = callbacks.onHistoryChanged;
  }

  document.getElementById('history-login-btn')?.addEventListener('click', () => {
    document.getElementById('login-modal')?.classList.add('active');
  });

  document.getElementById('clear-all-history-btn')?.addEventListener('click', () => {
    showConfirmModal({
      title: 'Xóa toàn bộ lịch sử',
      message: 'Bạn có chắc chắn muốn xóa tất cả lịch sử xem phim trên tài khoản này? Hành động này không thể hoàn tác.',
      onConfirm: async () => {
        await AniDokiAPI.clearAllHistory();
        showToast('Đã xóa toàn bộ lịch sử xem phim');
        await loadHistoryView(1);
        if (onHistoryChangedCallback) await onHistoryChangedCallback();
      }
    });
  });

  document.getElementById('history-load-more-btn')?.addEventListener('click', () => {
    loadHistoryView(currentHistoryPage + 1, true);
  });
}

export async function loadHistoryView(page = 1, append = false) {
  currentHistoryPage = page;
  const unauthEl = document.getElementById('history-unauth-state');
  const emptyEl = document.getElementById('history-empty-state');
  const grid = document.getElementById('history-items-grid');
  const clearBtn = document.getElementById('clear-all-history-btn');
  const loadMoreBtn = document.getElementById('history-load-more-btn');

  if (!AniDokiAPI.getToken()) {
    if (unauthEl) unauthEl.style.display = 'flex';
    if (emptyEl) emptyEl.style.display = 'none';
    if (grid) grid.innerHTML = '';
    if (clearBtn) clearBtn.style.display = 'none';
    if (loadMoreBtn) loadMoreBtn.style.display = 'none';
    return;
  }

  if (unauthEl) unauthEl.style.display = 'none';
  if (!append && grid) {
    grid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--text-muted);">Đang tải lịch sử...</div>`;
  }

  try {
    const res = await AniDokiAPI.getHistory(page, 20);
    const items = res.data || [];
    const pagination = res.pagination || { hasMore: false };

    if (!items.length && !append) {
      if (emptyEl) emptyEl.style.display = 'flex';
      if (grid) grid.innerHTML = '';
      if (clearBtn) clearBtn.style.display = 'none';
      if (loadMoreBtn) loadMoreBtn.style.display = 'none';
      return;
    }

    if (emptyEl) emptyEl.style.display = 'none';
    if (clearBtn) clearBtn.style.display = 'inline-flex';
    if (loadMoreBtn) loadMoreBtn.style.display = pagination.hasMore ? 'inline-block' : 'none';

    if (!append && grid) grid.innerHTML = '';

    items.forEach(item => {
      const anime = item.anime || { id: item.animeId, title: { english: item.animeId }, coverImage: POSTER_PLACEHOLDER };
      const hasProgress = Number(item.currentTime) > 0 && Number(item.duration) > 0;
      const progressPercent = hasProgress ? Math.min(100, Math.floor((item.currentTime / item.duration) * 100)) : 0;
      const timeStr = hasProgress ? `${formatTime(item.currentTime)} / ${formatTime(item.duration)}` : 'Tiếp tục xem';

      const card = document.createElement('div');
      card.className = 'history-card-item';
      card.innerHTML = `
        <img class="history-card-thumb" src="${anime.coverImage}" alt="${anime.title?.english || anime.title?.vietnamese || 'Anime'}">
        <div class="history-card-content">
          <div class="history-card-title">${anime.title?.english || anime.title?.vietnamese || 'Anime'}</div>
          <div class="history-card-ep">Tập ${item.episodeNumber || 1} · ${timeStr}</div>
          ${hasProgress ? `
            <div class="cw-progress-bar" style="margin-top: 6px;">
              <div class="cw-progress-fill" style="width: ${progressPercent}%;"></div>
            </div>
          ` : ''}
        </div>
        <button type="button" class="history-del-btn" title="Xóa khỏi lịch sử">✕</button>
      `;

      card.querySelector('.history-del-btn')?.addEventListener('click', async (e) => {
        e.stopPropagation();
        await AniDokiAPI.deleteHistory(item.animeId);
        showToast('Đã xóa tập khỏi lịch sử');
        await loadHistoryView(1);
        if (onHistoryChangedCallback) await onHistoryChangedCallback();
      });

      card.addEventListener('click', () => {
        router.navigate(`/watch/${item.animeId}/${item.episodeNumber || 1}`);
      });

      grid.appendChild(card);
    });
  } catch {
    if (!append && grid) grid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: #ff5252;">Lỗi tải lịch sử xem phim.</div>`;
  }
}
