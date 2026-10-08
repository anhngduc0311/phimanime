const cache = new Map();
const pending = new Map();
async function request(path) {
  const cached = cache.get(path);
  if (cached?.until > Date.now()) return cached.data;
  if (pending.has(path)) return pending.get(path);
  const task = (async () => {
    const response = await fetch('https://phimapi.com' + path, { signal: AbortSignal.timeout(12000) });
    if (!response.ok) throw new Error('Nguồn Vietsub tạm không kết nối được');
    const data = await response.json();
    if (cache.size >= 100) cache.delete(cache.keys().next().value);
    cache.set(path, { data, until: Date.now() + 300000 });
    return data;
  })();
  pending.set(path, task);
  try { return await task; } finally { pending.delete(path); }
}
export function normalizeTitle(title = '') {
  return title.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}
export function matchesAnime(anime, movie) {
  const titles = Object.values(anime.title).filter(Boolean).map(normalizeTitle);
  return movie.type === 'hoathinh' && Number(movie.year) === Number(anime.year) &&
    [movie.name, movie.origin_name].some(title => titles.includes(normalizeTitle(title)));
}
export async function getVietsub(anime, episodeNumber) {
  const title = anime.title.english || anime.title.vietnamese;
  const keyword = title.replace(/\s*(?:\(?Season\s+\d+\)?|\s+\d+(?:st|nd|rd|th) Season).*$/i, '').trim();
  const result = await request('/v1/api/tim-kiem?keyword=' + encodeURIComponent(keyword) + '&limit=64');
  const candidates = (result.data?.items || []).filter(item => matchesAnime(anime, item));
  if (candidates.length !== 1) return null;
  const slug = candidates[0].slug;
  if (!/^[a-z0-9-]+$/.test(slug)) return null;
  const detail = await request('/phim/' + slug);
  if (!detail.status || !matchesAnime(anime, detail.movie)) return null;
  const server = detail.episodes?.find(server => /^vietsub$/i.test(server.server_name.trim()));
  if (!server) return null;
  const episodes = server.server_data.map(ep => {
    const match = ep.name.match(/^(?:Tập\s*)?(\d+)$/i);
    const number = match ? Number(match[1]) : (/^full$/i.test(ep.name) && anime.format === 'MOVIE' ? 1 : null);
    return { number, title: ep.name, url: ep.link_embed };
  }).filter(ep => ep.number > 0).sort((a,b) => a.number - b.number);
  const selected = episodes.find(ep => ep.number === Number(episodeNumber));
  if (!selected) return null;
  const url = new URL(selected.url);
  if (url.origin !== 'https://player.phimapi.com' || url.pathname !== '/player/') return null;
  return { success: true, type: 'embed', provider: 'Vietsub', language: 'vi', embed_url: url.href,
    episodes: episodes.map(({number,title}) => ({number,title})) };
}
