import { seriesKey } from '../../../../shared/series.js';
import { router } from '../router.js';
import { POSTER_PLACEHOLDER } from '../utils/assets.js';
import { providerLabel } from '../utils/providers.js';

export function renderCard(anime) {
  const card = document.createElement('div');
  card.className = 'anime-card';
  card.dataset.seriesKey = seriesKey(anime);
  card.dataset.animeId = anime.id || '';
  card.tabIndex = 0;
  card.setAttribute('role', 'button');

  const engTitle = anime.title?.english || (typeof anime.title === 'string' ? anime.title : '');
  const vieTitle = anime.title?.vietnamese || '';
  const mainTitle = engTitle || vieTitle || 'Anime';
  const coverSrc = anime.coverImage || anime.posterUrl || anime.poster_url || POSTER_PLACEHOLDER;
  const scoreText = anime.score ? `★ ${anime.score}` : '';
  const epText = anime.format === 'MOVIE' ? 'Movie' : `Tập ${anime.currentEpisode || anime.totalEpisodes || 'Full'}`;
  const seasonCount = anime.seasonCount ?? anime.seasons?.length ?? 0;
  const subMeta = [providerLabel(anime.studio), anime.year].filter(Boolean).join(' · ');

  card.setAttribute('aria-label', `Xem chi tiết ${mainTitle}`);
  card.addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); card.click(); }
  });
  card.innerHTML = `
    <div class="anime-card-poster">
      <img src="${coverSrc}" alt="${mainTitle}" loading="lazy" decoding="async">
      <div class="anime-card-badges">
        ${scoreText ? `<span class="badge-score">${scoreText}</span>` : ''}
        <span class="badge-ep">${epText}</span>
      </div>
      <div class="anime-card-overlay">
        <div class="play-bubble">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <polygon points="5 3 19 12 5 21 5 3"></polygon>
          </svg>
        </div>
      </div>
    </div>
    <div class="anime-card-info">
      <h3 class="anime-card-title">${mainTitle}</h3>
      <span class="anime-card-sub">${subMeta || 'AniDoki'}${seasonCount > 1 ? ` · ${seasonCount} mùa` : ''}</span>
    </div>
  `;

  const poster = card.querySelector('img');
  poster.addEventListener('error', () => {
    if (!poster.dataset.fallback && anime.bannerImage) {
      poster.dataset.fallback = 'banner';
      poster.src = anime.bannerImage;
    } else {
      poster.src = POSTER_PLACEHOLDER;
    }
  });

  card.addEventListener('click', () => {
    if (anime.id) {
      router.navigate(`/anime/${anime.id}`);
    }
  });

  return card;
}
