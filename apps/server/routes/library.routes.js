import express from 'express';
import { LibraryController } from '../controllers/library.controller.js';
import { requireAuth } from '../middlewares/auth.middleware.js';

export const libraryRouter = express.Router();

libraryRouter.get('/watchlist', requireAuth, LibraryController.getWatchlist);
libraryRouter.post('/watchlist/toggle', requireAuth, LibraryController.toggleWatchlist);
libraryRouter.get('/library', requireAuth, LibraryController.getLibrary);
libraryRouter.post('/library/status', requireAuth, LibraryController.updateLibraryStatus);
libraryRouter.delete('/library/:animeId', requireAuth, LibraryController.deleteLibraryItem);
