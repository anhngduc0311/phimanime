/**
 * Bridge module for Backward Compatibility
 * Re-exports catalog functions from services, routes, and migrations
 */
import express from 'express';
import { catalogRouter } from './routes/catalog.routes.js';
import { libraryRouter } from './routes/library.routes.js';
import { historyRouter } from './routes/history.routes.js';
import { reportRouter } from './routes/report.routes.js';
import { runMigrations } from './db/migrations.js';

export {
  kkRequest,
  slugOK,
  mapMovie,
  extractEpisodes,
  applyAnimeOverride,
  movieDetail,
  relatedSeasons,
  selectSpotlights,
  selectTrending,
  trendingCatalog,
  genreOptions,
  genreCatalog,
  movieCatalog,
  browseCatalog
} from './services/kkphim.service.js';

export async function initKKUserData() {
  await runMigrations();
}

export const router = express.Router();
router.use(catalogRouter);
router.use(libraryRouter);
router.use(historyRouter);
router.use(reportRouter);
