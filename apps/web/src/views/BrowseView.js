import { AniDokiAPI } from '../api.js';
import { router } from '../router.js';
import { renderCard } from '../components/MovieCard.js';
import { initBrowseFilters, syncBrowseFilters } from '../components/BrowseFilters.js';
import { setBrowseSEO } from '../utils/seo.js';
import { DEFAULT_GENRES } from '../components/Header.js';

let browseGenreOptions = [...DEFAULT_GENRES];
let browseRequestId = 0;
let browseController;

export function initBrowseView() {
  const genreSelect = document.getElementById('browse-genre-select');
  const form = document.getElementById('browse-filter-form');
  const resetBtn = document.getElementById('browse-reset-btn');
  const emptyResetBtn = document.getElementById('browse-empty-reset-btn');

  const renderSelectOptions = (list) => {
    if (!genreSelect) return;
    const currentVal = genreSelect.value;
    genreSelect.innerHTML = '<option value="">Tất cả thể loại</option>';
    list.forEach(g => {
      const opt = document.createElement('option');
      opt.value = g.slug;
      opt.textContent = g.name;
      genreSelect.appendChild(opt);
    });
    if (currentVal) genreSelect.value = currentVal;
  };

  // Render ngay danh sách mặc định
  renderSelectOptions(browseGenreOptions);

  // Default options and controls work immediately while fresh genres load.
  void fetch('/api/genre-options', { signal: AbortSignal.timeout(8000) }).then(res => res.json()).then(json => {
    if (json.success && Array.isArray(json.data)) {
      browseGenreOptions = json.data;
      renderSelectOptions(browseGenreOptions);
    }
  }).catch(err => {
    console.warn('Error loading browse genre options:', err);
  });

  const applyFilters = () => {
    clearTimeout(searchDebounce);
    const q = document.getElementById('browse-search-input')?.value?.trim() || '';
    const category = document.getElementById('browse-genre-select')?.value || '';
    const year = document.getElementById('browse-year-select')?.value || '';
    const status = document.getElementById('browse-status-select')?.value || '';
    const sort = document.getElementById('browse-sort-select')?.value || 'year';

    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (category) params.set('category', category);
    if (year) params.set('year', year);
    if (status) params.set('status', status);
    if (sort && sort !== 'year') params.set('sort', sort);

    const queryStr = params.toString();
    router.navigate(`/browse${queryStr ? '?' + queryStr : ''}`);
  };

  form?.addEventListener('submit', (e) => {
    e.preventDefault();
    applyFilters();
  });

  ['browse-genre-select', 'browse-year-select', 'browse-status-select', 'browse-sort-select'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', applyFilters);
  });

  let searchDebounce = null;
  document.getElementById('browse-search-input')?.addEventListener('input', () => {
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(applyFilters, 400);
  });

  const resetFilters = () => {
    router.navigate('/browse');
  };

  resetBtn?.addEventListener('click', resetFilters);
  emptyResetBtn?.addEventListener('click', resetFilters);
  initBrowseFilters();
}

export async function loadBrowseView(route) {
  const requestId = ++browseRequestId;
  browseController?.abort();
  browseController = new AbortController();
  const query = route?.query || {};
  const q = query.q || '';
  const category = query.category || '';
  const year = query.year || '';
  const status = query.status || '';
  const sort = query.sort || 'year';
  const page = parseInt(query.page, 10) || 1;

  const searchInput = document.getElementById('browse-search-input');
  const genreSelect = document.getElementById('browse-genre-select');
  const yearSelect = document.getElementById('browse-year-select');
  const statusSelect = document.getElementById('browse-status-select');
  const sortSelect = document.getElementById('browse-sort-select');

  if (searchInput) searchInput.value = q;
  if (genreSelect) genreSelect.value = category;
  if (yearSelect) yearSelect.value = year;
  if (statusSelect) statusSelect.value = status;
  if (sortSelect) sortSelect.value = sort;
  syncBrowseFilters();

  const matchedGenre = browseGenreOptions.find(g => g.slug === category);
  setBrowseSEO({
    categoryName: matchedGenre ? matchedGenre.name : '',
    queryText: q,
    year
  });

  renderBrowseChips(query);

  const grid = document.getElementById('browse-grid');
  const countEl = document.getElementById('browse-results-count');
  const pageIndicator = document.getElementById('browse-results-page-indicator');
  const emptyEl = document.getElementById('browse-empty');
  const paginationWrap = document.getElementById('browse-pagination');

  if (countEl) countEl.textContent = 'Đang tìm kiếm anime...';
  if (pageIndicator) pageIndicator.textContent = '';
  if (grid) grid.innerHTML = '';
  if (emptyEl) emptyEl.style.display = 'none';
  if (paginationWrap) paginationWrap.style.display = 'none';

  try {
    const res = await AniDokiAPI.getBrowse({ q, category, year, status, sort, page, limit: 24 }, { signal: browseController.signal });
    if (requestId !== browseRequestId) return;
    const items = res.data || [];
    const pagination = res.pagination || { page: 1, totalPages: 1, totalItems: items.length, hasMore: false };

    if (!items.length) {
      if (countEl) countEl.textContent = '0 anime phù hợp';
      if (pageIndicator) pageIndicator.textContent = '';
      if (emptyEl) emptyEl.style.display = 'flex';
      if (grid) grid.innerHTML = '';
      return;
    }

    if (countEl) {
      const totalStr = pagination.totalItems ? `${pagination.totalItems} kết quả` : `${items.length} phim`;
      countEl.textContent = `Tìm thấy ${totalStr}`;
    }
    if (pageIndicator) {
      pageIndicator.textContent = pagination.totalPages > 1 ? `Trang ${pagination.page} / ${pagination.totalPages}` : '';
    }

    if (grid) {
      grid.innerHTML = '';
      items.forEach(anime => {
        grid.appendChild(renderCard(anime));
      });
    }

    if (pagination.totalPages > 1 && paginationWrap) {
      paginationWrap.style.display = 'flex';
      setupBrowsePagination(query, pagination);
    }
  } catch (error) {
    if (requestId !== browseRequestId || error.name === 'AbortError') return;
    if (countEl) countEl.textContent = 'Lỗi tải danh sách phim';
    if (emptyEl) emptyEl.style.display = 'flex';
  }
}

export function renderBrowseChips(query) {
  const chipsWrap = document.getElementById('browse-active-chips');
  if (!chipsWrap) return;
  chipsWrap.innerHTML = '';

  const activeFilters = [];
  if (query.q) activeFilters.push({ key: 'q', label: `Từ khóa: "${query.q}"` });
  if (query.category) {
    const found = browseGenreOptions.find(g => g.slug === query.category);
    activeFilters.push({ key: 'category', label: `Thể loại: ${found ? found.name : query.category}` });
  }
  if (query.year) activeFilters.push({ key: 'year', label: `Năm: ${query.year}` });
  if (query.status) {
    const statusLabels = { ongoing: 'Đang phát sóng', completed: 'Trọn bộ' };
    activeFilters.push({ key: 'status', label: `Trạng thái: ${statusLabels[query.status] || query.status}` });
  }
  if (query.sort && query.sort !== 'year') {
    const sortLabels = { updated: 'Mới cập nhật', year: 'Năm mới nhất', score: 'Điểm đánh giá cao nhất', title: 'Tên A-Z' };
    activeFilters.push({ key: 'sort', label: `Sắp xếp: ${sortLabels[query.sort] || query.sort}` });
  }

  if (!activeFilters.length) return;

  activeFilters.forEach(item => {
    const chip = document.createElement('span');
    chip.className = 'filter-chip';
    chip.innerHTML = `<span>${item.label}</span><button type="button" aria-label="Xóa bộ lọc ${item.label}">✕</button>`;
    chip.querySelector('button').addEventListener('click', () => {
      const nextQuery = { ...query };
      delete nextQuery[item.key];
      delete nextQuery.page;
      const params = new URLSearchParams(nextQuery);
      router.navigate(`/browse${params.toString() ? '?' + params.toString() : ''}`);
    });
    chipsWrap.appendChild(chip);
  });

  const clearAllBtn = document.createElement('span');
  clearAllBtn.className = 'filter-chip-clear';
  clearAllBtn.textContent = 'Xóa tất cả';
  clearAllBtn.addEventListener('click', () => router.navigate('/browse'));
  chipsWrap.appendChild(clearAllBtn);
}

export function setupBrowsePagination(query, pagination) {
  const prevBtn = document.getElementById('browse-prev-page');
  const nextBtn = document.getElementById('browse-next-page');
  const pagesContainer = document.getElementById('browse-page-numbers');

  const currentPage = pagination.page;
  const totalPages = pagination.totalPages;

  const navigateToPage = (p) => {
    const nextQuery = { ...query, page: p };
    const params = new URLSearchParams(nextQuery);
    router.navigate(`/browse?${params.toString()}`);
  };

  if (prevBtn) {
    prevBtn.disabled = currentPage <= 1;
    prevBtn.onclick = () => navigateToPage(currentPage - 1);
  }

  if (nextBtn) {
    nextBtn.disabled = currentPage >= totalPages;
    nextBtn.onclick = () => navigateToPage(currentPage + 1);
  }

  if (pagesContainer) {
    pagesContainer.innerHTML = '';
    const start = Math.max(1, currentPage - 2);
    const end = Math.min(totalPages, currentPage + 2);

    for (let p = start; p <= end; p++) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `page-btn ${p === currentPage ? 'active' : ''}`;
      btn.textContent = p;
      btn.onclick = () => navigateToPage(p);
      pagesContainer.appendChild(btn);
    }
  }
}
