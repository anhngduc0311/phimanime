import express from 'express';
import { CatalogController } from '../controllers/catalog.controller.js';

export const catalogRouter = express.Router();

catalogRouter.get('/anime/spotlight', CatalogController.getSpotlight);
catalogRouter.get('/anime/trending', CatalogController.getTrending);
catalogRouter.get('/anime/recently-updated', CatalogController.getRecentlyUpdated);
catalogRouter.get('/catalog', CatalogController.getCatalog);
catalogRouter.get('/anime/seasonal', CatalogController.getSeasonal);
catalogRouter.get('/anime/movies', CatalogController.getMovies);
catalogRouter.get('/anime/genres', CatalogController.getGenres);
catalogRouter.get('/genre-options', CatalogController.getGenreOptions);
catalogRouter.get('/anime/by-genres', CatalogController.getByGenres);
catalogRouter.get('/anime/:id', CatalogController.getAnimeDetail);
catalogRouter.get('/anime/:id/seasons', CatalogController.getAnimeSeasons);
catalogRouter.get('/anime/:id/episodes', CatalogController.getAnimeEpisodes);
catalogRouter.post('/watch/sources', CatalogController.getWatchSources);
catalogRouter.get('/search', CatalogController.search);
catalogRouter.get('/browse', CatalogController.browse);
