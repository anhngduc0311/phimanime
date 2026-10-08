import { AniDokiAPI } from '../api.js';
import { state } from '../store/state.js';
import { router } from '../router.js';
import { showToast } from '../utils/ui.js';
import { renderCard } from '../components/MovieCard.js';
import { refreshWatchlistCount } from '../components/Header.js';
import { openPlayerByRoute } from './PlayerView.js';
import { seasonNumber } from '../../../../shared/series.js';
import { setAnimeDetailSEO } from '../utils/seo.js';
import { providerLabel } from '../utils/providers.js';

// ANIME DETAIL VIEW (1:1 VỚI BẢN ONE PIECE TRONG ẢNH)
// ==========================================
let detailRequest = 0;
export async function openAnimeDetail(animeId, pushRoute = true) {
  if (pushRoute) {
    router.navigate(`/anime/${animeId}`);
    return;
  }
  const request = ++detailRequest;
  let anime = await AniDokiAPI.getAnimeDetail(animeId);
  if (request !== detailRequest || router.currentRoute?.pathname !== `/anime/${animeId}`) return;
  if (!anime) {
    showToast('Không tìm thấy thông tin phim.');
    router.navigate('/');
    return;
  }

  state.currentDetailAnime = anime;
  setAnimeDetailSEO(anime);
  void loadSeasonSelector(anime, request);
  const view = document.getElementById('detail-view');

  // Fill in Header & Posters
  document.getElementById('detail-bg-img').src = anime.bannerImage || anime.coverImage;
  document.getElementById('detail-poster-img').src = anime.coverImage;

  // Eyebrow
  document.getElementById('detail-score-val').textContent = anime.score;
  document.getElementById('detail-studio-badge').textContent = providerLabel(anime.studio);

  const genreContainer = document.getElementById('detail-genres-list');
  genreContainer.innerHTML = '';
  anime.genres.forEach(g => {
    const pill = document.createElement('span');
    pill.className = 'detail-genre-tag';
    pill.textContent = g;
    genreContainer.appendChild(pill);
  });

  // Show a readable title until a valid logo has loaded.
  const logoImg = document.getElementById('detail-logo-img');
  const titleLabel = document.getElementById('detail-sub-title');
  titleLabel.textContent = anime.title.vietnamese || anime.title.english;
  titleLabel.classList.add('title-fallback');
  logoImg.style.display = 'none';
  logoImg.onload = () => {
    logoImg.style.display = 'block';
    titleLabel.classList.remove('title-fallback');
  };
  logoImg.onerror = () => {
    logoImg.style.display = 'none';
    titleLabel.classList.add('title-fallback');
  };
  if (anime.logo) {
    logoImg.alt = titleLabel.textContent;
    logoImg.src = anime.logo;
  } else {
    logoImg.removeAttribute('src');
  }

  // Stats bar
  document.getElementById('stat-format').textContent = anime.format;
  document.getElementById('stat-duration').textContent = anime.duration;
  document.getElementById('stat-status').textContent = anime.status;

  // Quick metadata
  document.getElementById('meta-start').textContent = anime.startDate || `${anime.year}`;
  document.getElementById('meta-status').textContent = anime.status;
  document.getElementById('meta-format').textContent = anime.format;
  document.getElementById('meta-duration').textContent = anime.duration;
  document.getElementById('meta-studio').textContent = providerLabel(anime.studio);
  document.getElementById('meta-season').textContent = anime.season || `${anime.year}`;

  // Bookmark status
  updateDetailBookmarkBtn(anime.id);

  // Synopsis
  document.getElementById('detail-synopsis-text').textContent = anime.description;

  // Countdown timer card setup (Tập X sẽ phát hành sau)
  setupCountdown(anime);

  // Episodes List from API
  try {
    const epData = await AniDokiAPI.getEpisodes(anime.id);
    if (request !== detailRequest || router.currentRoute?.pathname !== `/anime/${animeId}`) return;
    state.currentEpisodes = epData.length ? epData : (anime.episodes || []);
  } catch {
    state.currentEpisodes = anime.episodes || [];
  }
  if (request !== detailRequest || router.currentRoute?.pathname !== `/anime/${animeId}`) return;
  renderDetailEpisodes(state.currentEpisodes);

  // Show View
  view.classList.add('active');
  document.body.style.overflow = 'hidden';
}

async function loadSeasonSelector(anime, request) {
  const section = document.getElementById('detail-seasons');
  const list = document.getElementById('detail-season-list');
  const status = document.getElementById('detail-season-status');
  section.hidden = anime.isMovie;
  list.replaceChildren();
  if (anime.isMovie) return;
  status.textContent = 'Đang tìm các mùa của phim…';
  try {
    const response = await fetch(`/api/anime/${encodeURIComponent(anime.id)}/seasons`);
    const result = await response.json();
    if (request !== detailRequest) return;
    if (!response.ok || !result.success || !Array.isArray(result.data)) throw new Error();
    status.textContent = result.data.length > 1 ? `${result.data.length} mùa · Chọn mùa để xem danh sách tập` : 'Hiện có 1 mùa';
    for (const season of result.data) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'season-option';
      button.dataset.animeId = season.id;
      button.textContent = `Mùa ${seasonNumber(season)}${season.year ? ` · ${season.year}` : ''}`;
      button.title = `${season.title.vietnamese || season.title.english} · ${(season.sources || [{ source: season.source }]).map(s => providerLabel(s.source)).join(', ')}`;
      button.setAttribute('aria-pressed', String(season.id === anime.id));
      button.addEventListener('click', () => {
        if (season.id === state.currentDetailAnime?.id) return;
        router.navigate(`/anime/${season.id}`);
      });
      list.appendChild(button);
    }
  } catch {
    if (request !== detailRequest) return;
    status.textContent = 'Không tải được các mùa phim.';
  }
}

function updateDetailBookmarkBtn(animeId, knownStatus = null) {
  const isSaved = state.watchlistIds.includes(animeId);
  const text = document.getElementById('detail-bookmark-text');
  if (!text) return;
  const statusLabels = {
    plan_to_watch: '📌 Muốn xem',
    watching: '▶ Đang xem',
    completed: '✔ Đã hoàn thành'
  };
  if (knownStatus) {
    text.textContent = statusLabels[knownStatus] || 'Đã lưu thư viện';
  } else {
    text.textContent = isSaved ? 'Đã lưu thư viện' : 'Lưu vào thư viện';
  }
}

function setupCountdown(anime) {
  const countdownCard = document.getElementById('detail-countdown-card');
  const title = document.getElementById('countdown-title');
  const daysEl = document.getElementById('cd-days');
  const hoursEl = document.getElementById('cd-hours');
  const minsEl = document.getElementById('cd-mins');
  const secsEl = document.getElementById('cd-secs');

  if (state.countdownInterval) {
    clearInterval(state.countdownInterval);
    state.countdownInterval = null;
  }

  // CHỈ HIỂN THỊ KHI có dữ liệu nextAiring hợp lệ VÀ thời gian còn trong tương lai
  const targetTime = anime?.nextAiring?.airingAt;
  const now = Date.now();
  if (!targetTime || targetTime <= now) {
    if (countdownCard) countdownCard.style.display = 'none';
    return;
  }

  if (countdownCard) countdownCard.style.display = 'flex';
  if (title) title.textContent = `Tập ${anime.nextAiring.episode || ''} sẽ phát hành sau`;

  function update() {
    const current = Date.now();
    const diff = Math.max(0, targetTime - current);
    if (diff <= 0) {
      if (countdownCard) countdownCard.style.display = 'none';
      if (state.countdownInterval) clearInterval(state.countdownInterval);
      return;
    }

    const totalSecs = Math.floor(diff / 1000);
    const days = Math.floor(totalSecs / 86400);
    const hours = Math.floor((totalSecs % 86400) / 3600);
    const mins = Math.floor((totalSecs % 3600) / 60);
    const secs = totalSecs % 60;

    if (daysEl) daysEl.textContent = String(days).padStart(2, '0');
    if (hoursEl) hoursEl.textContent = String(hours).padStart(2, '0');
    if (minsEl) minsEl.textContent = String(mins).padStart(2, '0');
    if (secsEl) secsEl.textContent = String(secs).padStart(2, '0');
  }

  update();
  state.countdownInterval = setInterval(update, 1000);
}

function renderDetailEpisodes(episodes, filterQuery = '') {
  const grid = document.getElementById('detail-episodes-grid');
  const title = document.getElementById('episodes-count-title');
  grid.innerHTML = '';

  title.textContent = `Danh sách tập (${episodes.length} tập)`;

  const filtered = episodes.filter(ep => 
    String(ep.number).includes(filterQuery) || ep.title.toLowerCase().includes(filterQuery.toLowerCase())
  );

  if (filtered.length === 0) {
    const message = document.createElement('div');
    message.style.cssText = 'grid-column: 1/-1; padding: 20px; color: var(--text-muted); text-align: center;';
    message.textContent = episodes.length ? 'Không tìm thấy tập phù hợp.' :
      (state.currentDetailAnime?.playbackUnavailable?.message || 'Hiện chưa có tập Vietsub có thể phát.');
    grid.appendChild(message);
    return;
  }

  filtered.forEach((ep) => {
    const item = document.createElement('div');
    item.className = 'episode-item';
    item.innerHTML = `
      <span class="ep-num">${ep.number}</span>
      <span class="ep-title">${ep.title}</span>
      <span class="ep-play-icon">▶</span>
    `;

    item.addEventListener('click', () => {
      if (state.currentDetailAnime) {
        router.navigate(`/watch/${state.currentDetailAnime.id}/${ep.number}`);
      }
    });

    grid.appendChild(item);
  });
}

export function initDetailEvents() {
  document.getElementById('close-detail-btn')?.addEventListener('click', () => {
    detailRequest++;
    document.getElementById('detail-view')?.classList.remove('active');
    document.body.style.overflow = '';
    if (state.countdownInterval) clearInterval(state.countdownInterval);
    router.returnFromDetail();
  });

  document.getElementById('copy-title-btn')?.addEventListener('click', () => {
    if (state.currentDetailAnime) {
      const name = state.currentDetailAnime.title.vietnamese || state.currentDetailAnime.title.english;
      navigator.clipboard.writeText(name);
      showToast(`Đã sao chép: "${name}"`);
    }
  });

  document.getElementById('detail-play-btn')?.addEventListener('click', async () => {
    if (!state.currentDetailAnime) return;
    const anime = state.currentDetailAnime;
    if (!state.currentEpisodes.length) {
      showToast(anime.playbackUnavailable?.message || 'Hiện chưa có tập Vietsub có thể phát.');
      return;
    }
    let targetEp = 1;
    if (AniDokiAPI.getToken()) {
      try {
        const hist = await AniDokiAPI.getHistory();
        const items = Array.isArray(hist) ? hist : (Array.isArray(hist?.data) ? hist.data : []);
        const found = items.find(h => h.animeId === anime.id);
        if (found && found.episodeNumber) {
          targetEp = found.episodeNumber;
        }
      } catch {}
    }
    router.navigate(`/watch/${anime.id}/${targetEp}`);
  });

  const bookmarkBtn = document.getElementById('detail-bookmark-btn');
  const statusMenu = document.getElementById('detail-status-menu');

  bookmarkBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!AniDokiAPI.getToken()) {
      showToast('Vui lòng đăng nhập để lưu phim vào thư viện');
      document.getElementById('login-modal')?.classList.add('active');
      return;
    }
    if (statusMenu) statusMenu.hidden = !statusMenu.hidden;
  });

  document.addEventListener('click', (e) => {
    if (statusMenu && !statusMenu.hidden && !statusMenu.contains(e.target) && e.target !== bookmarkBtn) {
      statusMenu.hidden = true;
    }
  });

  statusMenu?.querySelectorAll('button[data-status]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (statusMenu) statusMenu.hidden = true;
      if (!state.currentDetailAnime) return;

      const targetStatus = btn.dataset.status;
      if (targetStatus === 'remove') {
        await AniDokiAPI.deleteLibraryItem(state.currentDetailAnime.id);
        state.watchlistIds = state.watchlistIds.filter(id => id !== state.currentDetailAnime.id);
        updateDetailBookmarkBtn(state.currentDetailAnime.id, null);
        await refreshWatchlistCount();
        showToast(`Đã xóa khỏi thư viện`);
      } else {
        const res = await AniDokiAPI.updateLibraryStatus(state.currentDetailAnime.id, targetStatus);
        if (res.success) {
          if (!state.watchlistIds.includes(state.currentDetailAnime.id)) {
            state.watchlistIds.push(state.currentDetailAnime.id);
          }
          updateDetailBookmarkBtn(state.currentDetailAnime.id, targetStatus);
          await refreshWatchlistCount();
          const labels = {
            plan_to_watch: 'Muốn xem (Xem sau)',
            watching: 'Đang xem',
            completed: 'Đã hoàn thành'
          };
          showToast(`Đã chuyển trạng thái: ${labels[targetStatus] || targetStatus}`);
        } else {
          showToast(res.message || 'Lỗi cập nhật trạng thái');
        }
      }
    });
  });

  document.getElementById('detail-share-btn')?.addEventListener('click', () => {
    if (state.currentDetailAnime) {
      const shareUrl = `${window.location.origin}/anime/${state.currentDetailAnime.id}`;
      navigator.clipboard.writeText(shareUrl).then(() => {
        showToast('Đã sao chép liên kết chia sẻ!');
      }).catch(() => {
        showToast(`Liên kết: ${shareUrl}`);
      });
    }
  });

  document.querySelectorAll('.detail-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.detail-tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const target = btn.dataset.tab;
      document.getElementById('tab-episodes').style.display = target === 'episodes' ? 'block' : 'none';
      document.getElementById('tab-synopsis').style.display = target === 'synopsis' ? 'block' : 'none';
      document.getElementById('tab-related').style.display = target === 'related' ? 'block' : 'none';
    });
  });

  document.getElementById('episode-search-input')?.addEventListener('input', (e) => {
    renderDetailEpisodes(state.currentEpisodes, e.target.value.trim());
  });
}

// ==========================================
