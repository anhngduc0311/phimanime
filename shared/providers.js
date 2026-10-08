export function validEmbed(value, provider) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return false;
    if (provider === 'NguonC') return /^embed\d+\.streamc\.xyz$/.test(url.hostname) && url.pathname === '/embed.php';
    if (provider === 'Anime47') {
      return (url.origin === 'https://player.phimapi.com' && url.pathname === '/player/') ||
             (/^embed\d+\.streamc\.xyz$/.test(url.hostname) && url.pathname === '/embed.php');
    }
    return provider === 'AniDoki' && url.origin === 'https://player.phimapi.com' && url.pathname === '/player/';
  } catch { return false; }
}

const bookwormBase = 'honzuki-no-gekokujou-shisho-ni-naru-tame-ni-wa-shudan-wo-erandeiraremasen';
const bookwormSeasons = {
  'co-nang-mot-sach': 4,
  [bookwormBase]: 1,
  [bookwormBase + '-2nd-season']: 2,
  [bookwormBase + '-3rd-season']: 3,
  'honzuki-no-gekokujou-4th-season': 4
};

// Explicit cross-provider mapping: this sequel's upstream TMDB season differs
// from the four-part anime release order. Never infer this from a fuzzy title.
export function normalizeProviderAnime(anime) {
  // Season 2 aired in 2025; PhimAPI reports the series debut year (2022).
  // https://bisquedoll-anime.com/news/?article_id=67897
  if (anime.id === 'nang-bup-be-thu-do-cua-toi-biet-yeu-phan-2') {
    anime = { ...anime, year: 2025, startDate: '2025', season: '2025' };
  }
  const season = bookwormSeasons[anime.id.replace(/^nguonc-/, '')];
  return season ? { ...anime, seriesId: '91768', seasonNumber: season, seriesSearch: 'Honzuki' } : anime;
}
