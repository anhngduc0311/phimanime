import { AniDokiAPI } from '../api.js';
import { state } from '../store/state.js';
import { router } from '../router.js';
import { showToast, formatTime } from '../utils/ui.js';
import { renderCard } from '../components/MovieCard.js';
import { refreshWatchlistCount } from '../components/Header.js';
import { groupSeries, seriesKey, seasonNumber } from '../../../../shared/series.js';
import { openAnimeDetail } from './DetailView.js';
import { openPlayerByRoute } from './PlayerView.js';
import { POSTER_PLACEHOLDER } from '../utils/assets.js';
import { providerLabel } from '../utils/providers.js';

// SPOTLIGHT HERO CAROUSEL
// ==========================================
let homeReady;
export function ensureHomeLoaded() {
  if (!homeReady) {
    initMovies();
    homeReady = Promise.all([loadSpotlight(), loadCatalogs()]);
  }
  return homeReady;
}

export async function loadSpotlight() {
  try {
    const spotlights = await AniDokiAPI.getSpotlight();
    state.spotlights = groupSeries(spotlights || []);
  } catch {
    state.spotlights = [];
  }

  const navContainer = document.getElementById('spotlight-nav');
  navContainer.innerHTML = '';

  state.spotlights.forEach((_, idx) => {
    const dot = document.createElement('button');
    dot.setAttribute('aria-label', `Hiển thị phim nổi bật ${idx + 1}`);
    dot.className = `spotlight-dot ${idx === 0 ? 'active' : ''}`;
    dot.addEventListener('click', () => {
      setSpotlightSlide(idx);
      resetSpotlightTimer();
    });
    navContainer.appendChild(dot);
  });

  if (!state.spotlights.length) {
    document.getElementById('spotlight-title').textContent = 'Chưa tải được phim từ AniDoki';
    document.getElementById('spotlight-desc').textContent = 'Vui lòng tải lại trang để thử kết nối lại.';
    document.querySelectorAll('.spotlight-actions button').forEach(button => { button.disabled = true; });
  }
  setSpotlightSlide(0);
  startSpotlightTimer();

  const pause = document.getElementById('spotlight-pause');
  if (pause && !pause.dataset.bound) {
    pause.dataset.bound = 'true';
    pause.addEventListener('click', () => {
      const paused = pause.getAttribute('aria-pressed') !== 'true';
      pause.setAttribute('aria-pressed', String(paused));
      pause.setAttribute('aria-label', paused ? 'Tiếp tục chuyển phim' : 'Tạm dừng chuyển phim');
      pause.textContent = paused ? '▷' : 'Ⅱ';
      clearInterval(state.spotlightTimer);
      if (!paused) startSpotlightTimer();
    });
  }

  // Button actions
  document.getElementById('spotlight-watch-btn')?.addEventListener('click', () => {
    const anime = state.spotlights[state.spotlightIndex];
    if (anime) router.navigate(`/watch/${anime.id}/1`);
  });

  document.getElementById('spotlight-detail-btn')?.addEventListener('click', () => {
    const anime = state.spotlights[state.spotlightIndex];
    if (anime) router.navigate(`/anime/${anime.id}`);
  });

  document.getElementById('spotlight-bookmark-btn')?.addEventListener('click', async () => {
    const anime = state.spotlights[state.spotlightIndex];
    if (!anime) return;
    if (!AniDokiAPI.getToken()) {
      showToast('Vui lòng đăng nhập để lưu phim vào danh sách yêu thích');
      document.getElementById('login-modal')?.classList.add('active');
      return;
    }
    const res = await AniDokiAPI.toggleWatchlist(anime.id);
    if (res.code === 'UNAUTHORIZED' || res.code === 'SESSION_EXPIRED') {
      showToast('Phiên làm việc đã hết hạn. Vui lòng đăng nhập lại.');
      document.getElementById('login-modal')?.classList.add('active');
      return;
    }
    await refreshWatchlistCount();
    showToast(res.message || 'Cập nhật danh sách yêu thích');
  });
}


function setSpotlightSlide(index) {
  if (!state.spotlights.length) return;
  state.spotlightIndex = index % state.spotlights.length;
  const anime = state.spotlights[state.spotlightIndex];

  const bg = document.getElementById('spotlight-bg');
  const status = document.getElementById('spotlight-status');
  const score = document.getElementById('spotlight-score');
  const format = document.getElementById('spotlight-format');
  const studio = document.getElementById('spotlight-studio');
  const logo = document.getElementById('spotlight-logo');
  const title = document.getElementById('spotlight-title');
  const desc = document.getElementById('spotlight-desc');

  bg.onerror = () => { bg.onerror = null; bg.src = anime.coverImage || POSTER_PLACEHOLDER; };
  bg.src = anime.bannerImage || anime.coverImage;
  status.textContent = anime.status === 'Currently Airing' ? 'ĐANG PHÁT SÓNG' : 'TRỌN BỘ';
  score.textContent = `★ ${anime.score}`;
  format.textContent = anime.format;
  studio.textContent = providerLabel(anime.studio);

  title.textContent = anime.title.english || anime.title.vietnamese;
  if (anime.logo) {
    logo.onerror = () => { logo.style.display = 'none'; title.style.display = 'block'; };
    logo.src = anime.logo;
    logo.style.display = 'block';
    title.style.display = 'none';
  } else {
    logo.style.display = 'none';
    title.style.display = 'block';
    title.textContent = anime.title.english || anime.title.vietnamese;
  }

  desc.textContent = anime.description;

  document.querySelectorAll('.spotlight-dot').forEach((dot, idx) => {
    dot.classList.toggle('active', idx === state.spotlightIndex);
    dot.setAttribute('aria-pressed', String(idx === state.spotlightIndex));
  });
}

let isSpotlightHovered = false;
let spotlightEventsBound = false;

function bindSpotlightHover() {
  if (spotlightEventsBound) return;
  const section = document.getElementById('spotlight-section');
  if (!section) return;
  spotlightEventsBound = true;

  section.addEventListener('mouseenter', () => {
    isSpotlightHovered = true;
  });
  section.addEventListener('mouseleave', () => {
    isSpotlightHovered = false;
  });
}

export function startSpotlightTimer() {
  clearInterval(state.spotlightTimer);
  bindSpotlightHover();

  if (document.getElementById('spotlight-pause')?.getAttribute('aria-pressed') === 'true') {
    return;
  }

  state.spotlightTimer = setInterval(() => {
    const homeView = document.getElementById('view-home');
    const isHomeActive = !homeView || homeView.classList.contains('active') || homeView.style.display !== 'none';
    const isPaused = document.getElementById('spotlight-pause')?.getAttribute('aria-pressed') === 'true';

    if (
      state.spotlights &&
      state.spotlights.length > 1 &&
      !document.hidden &&
      isHomeActive &&
      !isPaused &&
      !isSpotlightHovered
    ) {
      setSpotlightSlide((state.spotlightIndex + 1) % state.spotlights.length);
    }
  }, 2000);
}

export function resetSpotlightTimer() {
  clearInterval(state.spotlightTimer);
  startSpotlightTimer();
}

// ==========================================


export async function loadCatalogs() {
  try {
    const [trending, recent, seasonal, genres] = await Promise.all([
      AniDokiAPI.getTrendingCatalog().catch(() => null),
      AniDokiAPI.getRecentlyUpdated(24),
      AniDokiAPI.getSeasonal(),
      AniDokiAPI.getGenres()
    ]);

    state.trending = trending?.data || [];
    state.trendingPagination = trending?.pagination || { page: 0, hasMore: true };
    state.recent = recent || [];
    state.seasonal = seasonal || [];
    state.genres = genres || {};
  } catch (err) {
    console.error('Error loading catalogs from API:', err);
    state.trending = [];
    state.recent = [];
    state.seasonal = [];
  }

  // Trending Grid (2 hàng x 6 ô = 12 ô)
  const trendingGrid = document.getElementById('trending-grid');
  trendingGrid.innerHTML = '';
  groupSeries(state.trending).slice(0, 12).forEach(anime => trendingGrid.appendChild(renderCard(anime)));

  // Recent Grid (Hiển thị đầy đủ phim mới cập nhật từ Anime47)
  const recentGrid = document.getElementById('recent-grid');
  recentGrid.innerHTML = '';
  groupSeries(state.recent).forEach(anime => recentGrid.appendChild(renderCard(anime)));

  // Seasonal Grid (Anime Tâm lý & Tình cảm: sắp xếp năm mới nhất trước, 2 hàng x 6 ô = 12 ô)
  const seasonalGrid = document.getElementById('seasonal-grid');
  const renderSortedSeasonalGrid = (all = false) => {
    seasonalGrid.innerHTML = '';
    const sorted = groupSeries(state.seasonal).sort((a, b) => (Number(b.year) || 0) - (Number(a.year) || 0));
    (all ? sorted : sorted.slice(0, 12)).forEach(anime => seasonalGrid.appendChild(renderCard(anime)));
  };
  renderSortedSeasonalGrid(false);

  for (const id of ['trending-grid', 'recent-grid', 'seasonal-grid']) {
    const grid = document.getElementById(id);
    if (!grid.children.length) grid.textContent = 'Chưa có dữ liệu phù hợp từ AniDoki.';
  }
  // 1. Trending controls
  const viewAllTrending = document.getElementById('view-all-trending');
  const moreTrending = document.getElementById('load-more-trending');
  let trendingLoading = false;
  const updateTrendingControls = () => {
    const hasMore = state.trendingPagination?.hasMore ?? true;
    moreTrending.hidden = !hasMore;
    viewAllTrending.hidden = !hasMore;
  };
  updateTrendingControls();
  const loadMoreTrending = async () => {
    if (trendingLoading || state.trendingPagination?.hasMore === false) return;
    trendingLoading = true;
    moreTrending.disabled = viewAllTrending.disabled = true;
    moreTrending.textContent = 'Đang tải…';
    trendingGrid.setAttribute('aria-busy', 'true');
    try {
      const result = await AniDokiAPI.getTrendingCatalog((state.trendingPagination?.page || 0) + 1);
      const existing = new Set(state.trending.map(seriesKey));
      const added = result.data.filter(item => !existing.has(seriesKey(item)));
      if (!state.trending.length && added.length) trendingGrid.replaceChildren();
      added.forEach(item => trendingGrid.appendChild(renderCard(item)));
      state.trending.push(...added);
      state.trendingPagination = result.pagination;
      updateTrendingControls();
      showToast(added.length ? `Đã tải thêm ${added.length} anime từ 7 sao trở lên.` : 'Đã hiển thị hết phim thịnh hành.');
    } catch {
      showToast('Không tải được thêm phim thịnh hành. Hãy thử lại.');
    } finally {
      trendingLoading = false;
      moreTrending.disabled = viewAllTrending.disabled = false;
      moreTrending.textContent = 'Xem thêm anime';
      trendingGrid.setAttribute('aria-busy', 'false');
    }
  };
  moreTrending.addEventListener('click', loadMoreTrending);
  viewAllTrending.addEventListener('click', () => {
    router.navigate('/browse?sort=score');
  });

  // 2. Recent controls
  const viewAllRecent = document.getElementById('view-all-recent');
  const more = document.getElementById('load-more-anime');
  let recentPage = 1;
  const loadMoreRecent = async () => {
    if (!more) return;
    more.disabled = true;
    more.textContent = 'Đang tải...';
    try {
      const response = await fetch('/api/anime/recently-updated?page=' + (recentPage + 1) + '&limit=24');
      const data = await response.json();
      if (!response.ok || !data.success || !data.data?.length) throw new Error();
      recentPage++;
      state.recent.push(...data.data);
      const groups = groupSeries(state.recent);
      const existing = new Map([...recentGrid.children].map(card => [card.dataset.seriesKey, card]));
      for (const anime of groups) {
        const card = existing.get(seriesKey(anime));
        if (!card) recentGrid.appendChild(renderCard(anime));
        else card.querySelector('.anime-card-sub').textContent = `${providerLabel(anime.studio)} · ${anime.year}${anime.seasons.length > 1 ? ` · ${anime.seasons.length} mùa` : ''}`;
      }
      more.hidden = Boolean(data.pagination && recentPage >= data.pagination.totalPages);
    } catch { showToast('Không tải được thêm phim. Hãy thử lại.'); }
    more.disabled = false;
    more.textContent = 'Xem thêm anime';
  };
  more?.addEventListener('click', loadMoreRecent);
  viewAllRecent?.addEventListener('click', () => {
    router.navigate('/browse?sort=updated');
  });

  // 3. Seasonal (Tâm lý & Tình cảm) controls - Luôn ưu tiên năm mới nhất trước
  const viewAllSeasonal = document.getElementById('view-all-seasonal');
  const loadMoreSeasonal = document.getElementById('load-more-seasonal');
  let seasonalPage = 1;
  const loadMoreSeasonalFn = async () => {
    if (!loadMoreSeasonal) return;
    loadMoreSeasonal.disabled = true;
    loadMoreSeasonal.textContent = 'Đang tải phim...';
    try {
      const moreItems = await AniDokiAPI.getSeasonal(seasonalPage + 1);
      if (!moreItems.length) {
        loadMoreSeasonal.hidden = true;
        showToast('Đã tải hết phim tâm lý & tình cảm.');
        return;
      }
      seasonalPage++;
      state.seasonal.push(...moreItems);
      renderSortedSeasonalGrid(true);
      showToast(`Đã tải thêm phim. Tổng cộng: ${seasonalGrid.children.length} anime.`);
    } catch {
      showToast('Không tải được thêm phim tâm lý & tình cảm.');
    } finally {
      loadMoreSeasonal.disabled = false;
      loadMoreSeasonal.textContent = 'Xem thêm anime tâm lý & tình cảm';
    }
  };
  loadMoreSeasonal?.addEventListener('click', loadMoreSeasonalFn);
  viewAllSeasonal?.addEventListener('click', () => {
    router.navigate('/browse?category=tam-ly,tinh-cam');
  });
  renderGenreRails();
  await loadContinueWatching();
}

export function initMovies() {
  const grid = document.getElementById('movies-grid');
  const button = document.getElementById('load-more-movies');
  const status = document.getElementById('movies-status');
  let page = 0, loading = false;
  async function load() {
    if (loading) return;
    loading = true;
    button.disabled = true;
    grid.setAttribute('aria-busy', 'true');
    status.textContent = 'Đang tải phim lẻ…';
    try {
      const result = await AniDokiAPI.getMovies(page + 1);
      const existing = new Set(state.movies.map(movie => movie.id));
      const movies = result.data.filter(movie => !existing.has(movie.id));
      movies.forEach(movie => grid.appendChild(renderCard(movie)));
      state.movies.push(...movies);
      page++;
      status.textContent = state.movies.length ? `Đã hiển thị ${state.movies.length} phim lẻ.` : 'Chưa có phim lẻ. Hãy quay lại sau.';
      button.hidden = !result.pagination?.hasMore;
      button.textContent = 'Xem thêm phim lẻ';
    } catch {
      status.textContent = 'Không tải được phim lẻ. Vui lòng thử lại.';
      button.hidden = false;
      button.textContent = 'Thử lại';
    } finally {
      loading = false;
      button.disabled = false;
      grid.setAttribute('aria-busy', 'false');
    }
  }
  button.addEventListener('click', load);
  void load();
}

function renderGenreRails() {
  const actionRail = document.getElementById('genre-action-rail');
  const romanceRail = document.getElementById('genre-romance-rail');

  const actionAnimes = state.genres?.['Action'] || [];
  const romanceAnimes = state.genres?.['Romance'] || [];

  actionRail.innerHTML = '';
  groupSeries(actionAnimes).forEach(anime => {
    const card = document.createElement('div');
    card.className = 'genre-card';
    card.innerHTML = `
      <img class="genre-card-backdrop" src="${anime.bannerImage || anime.coverImage}" alt="${anime.title.english}">
      <div class="genre-card-shade"></div>
      ${anime.logo ? `<img class="genre-card-logo" src="${anime.logo}" alt="Logo">` : ''}
      <h4 class="genre-card-title">${anime.title.english}</h4>
    `;
    const cardLogo = card.querySelector('.genre-card-logo');
    if (cardLogo) {
      cardLogo.style.visibility = 'hidden';
      cardLogo.onload = () => { cardLogo.style.visibility = 'visible'; };
      cardLogo.onerror = () => { cardLogo.style.display = 'none'; };
      if (cardLogo.complete && cardLogo.naturalWidth) cardLogo.style.visibility = 'visible';
    }
    card.addEventListener('click', () => openAnimeDetail(anime.id));
    actionRail.appendChild(card);
  });

  romanceRail.innerHTML = '';
  groupSeries(romanceAnimes).forEach(anime => {
    const card = document.createElement('div');
    card.className = 'genre-card';
    card.innerHTML = `
      <img class="genre-card-backdrop" src="${anime.bannerImage || anime.coverImage}" alt="${anime.title.english}">
      <div class="genre-card-shade"></div>
      ${anime.logo ? `<img class="genre-card-logo" src="${anime.logo}" alt="Logo">` : ''}
      <h4 class="genre-card-title">${anime.title.english}</h4>
    `;
    card.addEventListener('click', () => openAnimeDetail(anime.id));
    romanceRail.appendChild(card);
  });

  // Rail scroll buttons
  document.getElementById('rail-action-prev')?.addEventListener('click', () => actionRail.scrollBy({ left: -320, behavior: 'smooth' }));
  document.getElementById('rail-action-next')?.addEventListener('click', () => actionRail.scrollBy({ left: 320, behavior: 'smooth' }));
  document.getElementById('rail-romance-prev')?.addEventListener('click', () => romanceRail.scrollBy({ left: -320, behavior: 'smooth' }));
  document.getElementById('rail-romance-next')?.addEventListener('click', () => romanceRail.scrollBy({ left: 320, behavior: 'smooth' }));
}

export async function loadContinueWatching() {
  const section = document.getElementById('section-continue-watching');
  const grid = document.getElementById('continue-watching-grid');

  if (!AniDokiAPI.getToken()) {
    if (section) section.style.display = 'none';
    if (grid) grid.innerHTML = '';
    return;
  }

  let history = [];
  try {
    const res = await AniDokiAPI.getHistory();
    history = Array.isArray(res) ? res : (Array.isArray(res?.data) ? res.data : []);
  } catch {
    history = [];
  }

  if (!Array.isArray(history) || history.length === 0) {
    if (section) section.style.display = 'none';
    if (grid) grid.innerHTML = '';
    return;
  }

  if (section) section.style.display = 'block';
  if (grid) grid.innerHTML = '';

  // Giới hạn tối đa 3 hàng (15 phim cho 5 cột)
  history.slice(0, 15).forEach(item => {
    let anime = item.anime;
    if (typeof anime === 'string') {
      try {
        anime = JSON.parse(anime);
      } catch {
        anime = null;
      }
    }
    anime = anime || {
      id: item.animeId,
      title: { english: item.animeId, vietnamese: item.animeId },
      coverImage: POSTER_PLACEHOLDER
    };

    const hasProgress = Number(item.currentTime) > 0 && Number(item.duration) > 0;
    const progressPercent = hasProgress
      ? Math.min(100, Math.floor((item.currentTime / item.duration) * 100))
      : 0;
    const epLabel = hasProgress
      ? `Tập ${item.episodeNumber} · ${formatTime(item.currentTime)}`
      : `Tập ${item.episodeNumber} · Tiếp tục xem`;

    const titleText = anime.title?.english || anime.title?.vietnamese || (typeof anime.title === 'string' ? anime.title : 'Anime');
    const coverSrc = anime.coverImage || anime.posterUrl || anime.poster_url || POSTER_PLACEHOLDER;

    const card = document.createElement('div');
    card.className = 'cw-card';
    card.innerHTML = `
      <img class="cw-thumbnail" src="${coverSrc}" alt="${titleText}">
      <div class="cw-info">
        <h4 class="cw-title">${titleText}</h4>
        <span class="cw-ep">${epLabel}</span>
        ${hasProgress ? `
          <div class="cw-progress-bar">
            <div class="cw-progress-fill" style="width: ${progressPercent}%;"></div>
          </div>
        ` : ''}
      </div>
      <button class="cw-delete-item-btn icon-btn" style="width: 28px; height: 28px; margin-left: auto; background: rgba(255,255,255,0.08); border-radius: 50%; font-size: 11px;" title="Xóa">✕</button>
    `;

    card.querySelector('.cw-delete-item-btn')?.addEventListener('click', async (e) => {
      e.stopPropagation();
      await AniDokiAPI.deleteHistory(item.animeId);
      await loadContinueWatching();
      showToast('Đã xóa khỏi tiếp tục xem');
    });

    card.addEventListener('click', () => {
      router.navigate(`/watch/${item.animeId}/${item.episodeNumber || 1}`);
    });

    grid.appendChild(card);
  });
}


// ==========================================
