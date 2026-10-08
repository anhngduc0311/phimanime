import { pool } from './db/db.js';

let refreshTask;
let retryAt = 0;
const query = `query ($ids: [Int]) {
  Page(page: 1, perPage: 50) {
    media(id_in: $ids, type: ANIME) { id coverImage { extraLarge large } bannerImage }
  }
}`;

export function validArtworkUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 's4.anilist.co' &&
      url.pathname.startsWith('/file/anilistcdn/media/anime/');
  } catch { return false; }
}

async function refreshArtwork() {
  if (Date.now() < retryAt) return;
  const { rows } = await pool.query(`SELECT id FROM animes
    WHERE (artwork_checked_at IS NULL OR artwork_checked_at < NOW() - INTERVAL '24 hours')
      AND (artwork_attempted_at IS NULL OR artwork_attempted_at < NOW() - INTERVAL '5 minutes')
    ORDER BY artwork_attempted_at NULLS FIRST, id LIMIT 50`);
  if (!rows.length) return;
  const ids = rows.map(row => row.id);
  await pool.query('UPDATE animes SET artwork_attempted_at = NOW() WHERE id = ANY($1::int[])', [ids]);
  try {
    const response = await fetch('https://graphql.anilist.co', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ query, variables: { ids } }), signal: AbortSignal.timeout(12000)
    });
    if (!response.ok) throw new Error(`AniList HTTP ${response.status}`);
    const data = await response.json();
    if (data.errors || !Array.isArray(data.data?.Page?.media)) throw new Error('Invalid AniList response');
    for (const media of data.data.Page.media) {
      const cover = media.coverImage?.extraLarge || media.coverImage?.large;
      if (!ids.includes(media.id) || !validArtworkUrl(cover)) continue;
      const banner = validArtworkUrl(media.bannerImage) ? media.bannerImage : cover;
      await pool.query(`UPDATE animes SET cover_image = $2, banner_image = $3,
        artwork_checked_at = NOW() WHERE id = $1`, [media.id, cover, banner]);
    }
  } catch (error) {
    retryAt = Date.now() + 5 * 60 * 1000;
    console.warn('Artwork refresh:', error.message);
  }
}

export async function getArtwork(id, kind = 'poster') {
  const result = await pool.query('SELECT id FROM animes WHERE id = $1', [id]);
  if (!result.rowCount) return null;
  if (!refreshTask) refreshTask = refreshArtwork().finally(() => { refreshTask = null; });
  await refreshTask;
  const { rows } = await pool.query(
    'SELECT cover_image, banner_image, artwork_checked_at FROM animes WHERE id = $1', [id]);
  const row = rows[0];
  const url = kind === 'banner' ? row.banner_image : row.cover_image;
  // Keep the last successfully resolved artwork during provider outages.
  return row.artwork_checked_at && validArtworkUrl(url) ? url : '/poster-placeholder.svg';
}
