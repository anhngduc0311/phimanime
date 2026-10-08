import { pool } from '../db/db.js';
import { seriesKey, seriesTitle, seasonNumber, groupSeries, seriesAliases } from '../../../shared/series.js';
import { AdminAnimeModel } from '../models/adminAnime.model.js';
import { ConfigModel } from '../models/config.model.js';
import { nguoncDetail, searchNguonc } from './nguonc.service.js';
import { normalizeProviderAnime } from '../../../shared/providers.js';
import { remember, cacheKey } from './cache.service.js';
import { searchMeili, indexNguoncSearch } from './meilisearch.service.js';

const cache = new Map();
const pending = new Map();

export async function kkRequest(path) {
  const hit = cache.get(path);
  if (hit?.until > Date.now()) return hit.data;
  if (pending.has(path)) return pending.get(path);
  const task = (async () => {
    const r = await fetch('https://phimapi.com' + path, { signal: AbortSignal.timeout(15000) });
    if (!r.ok) throw new Error('AniDoki HTTP ' + r.status);
    const data = await r.json();
    if (data.status === false || data.status === 'error') throw new Error('AniDoki không có dữ liệu');
    if (cache.size >= 200) cache.delete(cache.keys().next().value);
    cache.set(path, { data, until: Date.now() + 300000 });
    return data;
  })();
  pending.set(path, task);
  try { return await task; } finally { pending.delete(path); }
}

export const slugOK = id => typeof id === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id) && id.length < 200;

const image = value => {
  if (!value) return '/poster-placeholder.svg';
  try {
    const url = new URL(value, 'https://phimimg.com/');
    return url.protocol === 'https:' ? url.href : '/poster-placeholder.svg';
  } catch {
    return '/poster-placeholder.svg';
  }
};

export function mapMovie(m) {
  const movie = m.tmdb?.type === 'movie' || m.type === 'single';
  const alternativeNames = Array.isArray(m.alternative_names) ? m.alternative_names : [];
  return normalizeProviderAnime({
    id: m.slug,
    title: { english: m.origin_name || m.name, vietnamese: m.name, romaji: m.origin_name || m.name },
    aliases: [m.origin_name, m.name, ...alternativeNames].filter(Boolean),
    seriesId: !movie && m.tmdb?.type === 'tv' ? m.tmdb.id || null : null,
    seasonNumber: !movie ? Number(m.tmdb?.season) || null : null,
    updatedAt: m.modified?.time || null,
    logo: /^tt\d+$/.test(m.imdb?.id || '') ? 'https://images.metahub.space/logo/medium/' + m.imdb.id + '/img' : null,
    coverImage: image(m.poster_url),
    bannerImage: image(m.thumb_url),
    score: Number(m.imdb?.vote_average || m.tmdb?.vote_average || 0),
    studio: 'AniDoki',
    genres: (m.category || []).map(x => x.name),
    format: movie ? 'MOVIE' : 'TV',
    duration: m.time || 'Đang cập nhật',
    status: m.status === 'completed' ? 'Finished Airing' : 'Currently Airing',
    year: m.year,
    startDate: String(m.year || ''),
    season: String(m.year || ''),
    totalEpisodes: Number(m.episode_total) || null,
    currentEpisode: m.episode_current?.match(/\d+/)?.[0] || '',
    nextAiring: null,
    description: (m.content || '').replace(/<[^>]*>/g, '').replace(/&quot;/g, '"').replace(/&amp;/g, '&'),
    isMovie: movie,
    language: m.lang || '',
    source: 'AniDoki'
  });
}

export function extractEpisodes(detail) {
  const server = detail.episodes?.find(s => /^vietsub$/i.test(s.server_name.trim()));
  return (server?.server_data || []).filter(ep => {
    try {
      const url = new URL(ep.link_embed);
      return url.origin === 'https://player.phimapi.com' && url.pathname === '/player/';
    } catch {
      return false;
    }
  }).map((ep, index) => ({
    number: index + 1,
    id: ep.slug,
    title: ep.name,
    embed: ep.link_embed,
    stream: /^https:\/\//i.test(ep.link_m3u8 || '') ? ep.link_m3u8 : null,
    duration: detail.movie?.time || ''
  }));
}

export function applyAnimeOverride(anime, override) {
  if (!override) return anime;
  const copy = { ...anime };
  if (override.title_vietnamese) {
    copy.title = { ...(copy.title || {}), vietnamese: override.title_vietnamese };
  }
  if (override.title_english) {
    copy.title = { ...(copy.title || {}), english: override.title_english };
  }
  if (override.description !== undefined && override.description !== null) {
    copy.description = override.description;
  }
  if (override.cover_image) copy.coverImage = override.cover_image;
  if (override.banner_image) copy.bannerImage = override.banner_image;
  if (Array.isArray(override.genres) && override.genres.length) copy.genres = override.genres;
  if (override.status) copy.status = override.status;
  if (Array.isArray(override.custom_seasons) && override.custom_seasons.length) {
    copy.seasons = override.custom_seasons;
  }
  copy.is_hidden = Boolean(override.is_hidden);
  copy.has_override = true;
  copy.notes = override.notes;
  return copy;
}

export async function movieDetail(slug) {
  if (!slugOK(slug)) throw new Error('Mã phim AniDoki không hợp lệ');

  let override = null;
  try {
    override = await AdminAnimeModel.getAnimeOverride(slug);
  } catch { }

  if (override && override.is_hidden) {
    const error = new Error('Nội dung không còn khả dụng hoặc đã bị ẩn');
    error.status = 404;
    throw error;
  }

  let anime;
  if (slug.startsWith('nguonc-')) {
    anime = await nguoncDetail(slug);
  } else {
    const detail = await kkRequest('/phim/' + slug);
    if (!detail.movie) throw new Error('Không tìm thấy phim');
    anime = { ...mapMovie(detail.movie), episodes: extractEpisodes(detail) };
  }

  if (override) {
    anime = applyAnimeOverride(anime, override);
  }

  return anime;
}

export async function relatedSeasons(anime, request = kkRequest) {
  if (anime.isMovie) return [anime];
  const keyword = seriesTitle(anime.title.vietnamese || anime.title.english);
  const matches = new Map([[anime.id, anime]]);
  let page = 1, totalPages = 1;
  do {
    const query = new URLSearchParams({ keyword, country: 'nhat-ban', limit: '64', page: String(page) });
    const result = await request('/v1/api/tim-kiem?' + query);
    if (!Array.isArray(result.data?.items)) throw new Error('Không tải được các mùa phim');
    for (const raw of result.data.items) {
      if (raw.type !== 'hoathinh') continue;
      const candidate = mapMovie(raw);
      if (seriesKey(candidate) === seriesKey(anime)) matches.set(candidate.id, candidate);
    }
    totalPages = Number(result.data.params?.pagination?.totalPages) || page;
    page++;
  } while (page <= totalPages);
  return [...matches.values()].sort((a, b) => seasonNumber(a) - seasonNumber(b) || (a.year || 0) - (b.year || 0));
}

export async function listing(params = {}) {
  const query = new URLSearchParams({ country: 'nhat-ban', limit: '24', ...params });
  const json = await kkRequest('/v1/api/danh-sach/hoat-hinh?' + query);
  return { items: (json.data?.items || []).map(mapMovie), pagination: json.data?.params?.pagination || {} };
}

export function selectSpotlights(items, limit = 7) {
  const updated = item => Date.parse(item.updatedAt) || 0;
  const latest = [...items].sort((a, b) => updated(b) - updated(a));
  return groupSeries(latest)
    .filter(item => Number.isFinite(item.score) && item.score > 0)
    .sort((a, b) => b.score - a.score || updated(b) - updated(a))
    .slice(0, limit);
}

export function selectTrending(items) {
  return groupSeries(items).filter(item => Number.isFinite(item.score) && item.score >= 7);
}

export async function trendingCatalog(page = 1, limit = 12, request = kkRequest) {
  page = Math.min(100, Math.max(1, parseInt(page) || 1));
  limit = Math.min(24, Math.max(1, parseInt(limit) || 12));
  const end = page * limit;
  const series = new Map();
  let upstreamPage = 1, totalPages = 1;
  let eligible = [];
  do {
    const query = new URLSearchParams({ country: 'nhat-ban', limit: '64', page: String(upstreamPage) });
    const json = await request('/v1/api/danh-sach/hoat-hinh?' + query);
    if (!Array.isArray(json.data?.items)) throw new Error('Danh sách thịnh hành không hợp lệ');
    totalPages = Number(json.data.params?.pagination?.totalPages) || upstreamPage;
    for (const raw of json.data.items) {
      const item = mapMovie(raw);
      const key = seriesKey(item);
      if (slugOK(item.id) && !series.has(key)) series.set(key, item);
    }
    eligible = selectTrending([...series.values()]);
    upstreamPage++;
  } while (eligible.length <= end && upstreamPage <= totalPages);
  return { data: eligible.slice((page - 1) * limit, end), pagination: { page, limit, hasMore: eligible.length > end } };
}

export async function genreOptions(request = kkRequest) {
  const json = await request('/the-loai');
  if (!Array.isArray(json.data?.items)) throw new Error('Danh sách thể loại không hợp lệ');
  return json.data.items.filter(item => slugOK(item.slug)).map(({ name, slug }) => ({ name, slug }));
}

export async function genreCatalog(categories, page = 1, limit = 12, request = kkRequest) {
  const chosen = [...new Set(categories)];
  const options = await genreOptions(request);
  if (!chosen.length || chosen.some(slug => !options.some(option => option.slug === slug))) {
    const error = new Error('Vui lòng chọn thể loại hợp lệ');
    error.status = 400;
    throw error;
  }
  page = Math.min(100, Math.max(1, parseInt(page) || 1));
  limit = Math.min(24, Math.max(1, parseInt(limit) || 12));
  const end = page * limit;
  const series = new Map();
  let upstreamPage = 1, totalPages = 1;
  do {
    const query = new URLSearchParams({ country: 'nhat-ban', category: chosen[0], limit: '64', page: String(upstreamPage) });
    const json = await request('/v1/api/danh-sach/hoat-hinh?' + query);
    if (!Array.isArray(json.data?.items)) throw new Error('Danh sách anime không hợp lệ');
    totalPages = Number(json.data.params?.pagination?.totalPages) || upstreamPage;
    for (const raw of json.data.items) {
      const slugs = new Set((raw.category || []).map(category => category.slug));
      if (!chosen.every(slug => slugs.has(slug))) continue;
      const item = mapMovie(raw);
      if (slugOK(item.id) && !series.has(seriesKey(item))) series.set(seriesKey(item), item);
    }
    upstreamPage++;
  } while (series.size <= end && upstreamPage <= totalPages);
  const items = [...series.values()];
  return { data: items.slice((page - 1) * limit, end), pagination: { page, limit, hasMore: items.length > end } };
}

export async function movieCatalog(page = 1, limit = 12, request = kkRequest) {
  page = Math.min(100, Math.max(1, parseInt(page) || 1));
  limit = Math.min(24, Math.max(1, parseInt(limit) || 12));
  const end = page * limit;
  const movies = new Map();
  let upstreamPage = 1, totalPages = 1;
  do {
    const query = new URLSearchParams({ country: 'nhat-ban', limit: '64', page: String(upstreamPage) });
    const json = await request('/v1/api/danh-sach/hoat-hinh?' + query);
    const items = json.data?.items;
    if (!Array.isArray(items)) throw new Error('Danh sách phim không hợp lệ');
    totalPages = Number(json.data?.params?.pagination?.totalPages) || upstreamPage;
    for (const item of items) {
      const movie = mapMovie(item);
      if (movie.isMovie && slugOK(movie.id)) movies.set(movie.id, movie);
    }
    upstreamPage++;
  } while (movies.size <= end && upstreamPage <= totalPages);
  const all = [...movies.values()];
  return { data: all.slice((page - 1) * limit, end), pagination: { page, limit, hasMore: all.length > end } };
}

export async function browseCatalog(params = {}) {
  const {
    q = '',
    category = '',
    year = '',
    status = '',
    sort = 'year',
    page = 1,
    limit = 24
  } = params;

  const pageNum = Math.max(1, parseInt(page) || 1);
  const limitNum = Math.min(48, Math.max(1, parseInt(limit) || 24));

  let hiddenSet = new Set();
  let overridesMap = new Map();
  try {
    const overrides = await AdminAnimeModel.getAllAnimeOverrides();
    overrides.forEach((r, k) => {
      if (r.is_hidden) hiddenSet.add(k);
      else overridesMap.set(k, r);
    });
  } catch (err) {
    console.error('Error fetching anime overrides for browse:', err);
  }

  const keyword = q.trim().slice(0, 150);
  const query = { country: 'nhat-ban' };
  if (category && !keyword) query.category = category;
  if (year) query.year = year;
  const path = keyword ? '/v1/api/tim-kiem' : '/v1/api/danh-sach/hoat-hinh';
  if (keyword) query.keyword = keyword;
  const discoverNguonc = () => remember('nguonc-search:' + cacheKey(keyword), () => searchNguonc(keyword));
  let items = keyword ? await searchMeili(keyword) : null;
  if (!items?.length) {
    const results = await Promise.allSettled([
      loadBrowseEntries(path, query),
      keyword ? discoverNguonc() : Promise.resolve([])
    ]);
    if (results[0].status === 'rejected' && (!keyword || results[1].status === 'rejected')) throw new Error('Không tải được danh sách phim');
    items = [...(results[0].value || []), ...(results[1].value || [])];
    if (keyword && results[1].value?.length) void indexNguoncSearch(results[1].value).catch(() => { });
  } else {
    // Discover supplemental sources in the background, without delaying hits.
    void discoverNguonc().then(indexNguoncSearch).catch(() => { });
  }
  items = items.filter(m => !hiddenSet.has(m.id)).map(m => {
    const override = overridesMap.get(m.id);
    return override ? applyAnimeOverride(m, override) : m;
  });
  if (keyword && category) {
    const slug = text => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').toLowerCase().replace(/[^a-z0-9]+/g, '-');
    items = items.filter(m => (m.genres || []).some(g => slug(g) === category));
  }
  if (year) items = items.filter(m => String(m.year) === String(year));
  if (status === 'completed') items = items.filter(m => m.status === 'Finished Airing');
  if (status === 'ongoing') items = items.filter(m => m.status === 'Currently Airing');
  // Key includes freshly applied overrides and upstream contents. Admin edits,
  // hidden titles and refreshed data cannot reuse an obsolete grouped result.
  const grouped = await remember('browse-grouped:' + cacheKey({ items, sort }),
    async () => paginateBrowseSeries(items, { sort, page: 1, limit: Math.max(1, items.length) }).items);
  const totalItems = grouped.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / limitNum));
  return {
    items: grouped.slice((pageNum - 1) * limitNum, pageNum * limitNum),
    pagination: { page: pageNum, totalPages, totalItems, limit: limitNum, hasMore: pageNum < totalPages }
  };
}

// Read all matching entries before grouping so a series cannot reappear on
// another page. Requests share kkRequest's cache and use bounded concurrency.
export async function loadBrowseEntries(path, params, request = kkRequest) {
  const load = () => fetchBrowseEntries(path, params, request);
  return request === kkRequest ? remember('browse-entries:' + cacheKey({ path, params }), load, {
    freshMs: 5 * 60 * 1000,
    staleMs: 24 * 60 * 60 * 1000,
  }) : load();
}

async function fetchBrowseEntries(path, params, request) {
  const getPage = async page => {
    const result = await request(path + '?' + new URLSearchParams({ ...params, limit: '64', page: String(page), sort_field: 'modified.time', sort_type: 'desc' }));
    if (!Array.isArray(result.data?.items)) throw new Error('Danh sách phim không hợp lệ');
    return result.data;
  };
  const first = await getPage(1);
  const pages = [first];
  const totalPages = Number(first.params?.pagination?.totalPages) || 1;
  for (let page = 2; page <= totalPages; page += 4) {
    pages.push(...await Promise.all(Array.from({ length: Math.min(4, totalPages - page + 1) }, (_, i) => getPage(page + i))));
  }
  return pages.flatMap(page => page.items).filter(m => !m.type || m.type === 'hoathinh').map(mapMovie);
}

export function paginateBrowseSeries(items, { sort = 'updated', page = 1, limit = 24 } = {}) {
  const updated = item => Date.parse(item.updatedAt) || 0;
  const sorted = [...items].sort((a, b) => {
    if (sort === 'score') return (Number(b.score) || 0) - (Number(a.score) || 0) || updated(b) - updated(a);
    if (sort === 'year') return (Number(b.year) || 0) - (Number(a.year) || 0) || updated(b) - updated(a);
    if (sort === 'title') return (a.title.english || a.title.vietnamese || '').localeCompare(b.title.english || b.title.vietnamese || '', 'vi');
    return updated(b) - updated(a);
  });
  const groups = [];
  const aliases = new Map();
  const aliasesWithoutId = new Map();
  for (const item of groupSeries(sorted)) {
    // Index normalized aliases once instead of normalizing every pair of titles.
    // Preserve the first matching representative, and never merge distinct IDs.
    const titles = seriesAliases(item).filter(title => title.length > 3);
    const candidates = item.seriesId ? aliasesWithoutId : aliases;
    let index = Infinity;
    if (!item.isMovie) {
      for (const title of titles) index = Math.min(index, candidates.get(title) ?? Infinity);
    }
    const existing = groups[index];
    if (existing) existing.seasons.push(...item.seasons);
    else {
      const position = groups.length;
      groups.push(item);
      if (!item.isMovie) for (const title of titles) {
        if (!aliases.has(title)) aliases.set(title, position);
        if (!item.seriesId && !aliasesWithoutId.has(title)) aliasesWithoutId.set(title, position);
      }
    }
  }
  const grouped = groups.map(item => ({
    ...item,
    seasonCount: new Set(item.seasons.map(seasonNumber)).size,
    title: item.isMovie ? item.title : Object.fromEntries(Object.entries(item.title).map(([key, title]) => [key, seriesTitle(title)]))
  }));
  const totalItems = grouped.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / limit));
  return {
    items: grouped.slice((page - 1) * limit, page * limit),
    pagination: { page, totalPages, totalItems, limit, hasMore: page < totalPages }
  };
}
