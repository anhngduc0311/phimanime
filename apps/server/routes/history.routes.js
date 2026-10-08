import express from 'express';
import { HistoryController } from '../controllers/history.controller.js';
import { requireAuth } from '../middlewares/auth.middleware.js';

export const historyRouter = express.Router();

historyRouter.get('/history', requireAuth, HistoryController.getHistory);
historyRouter.post('/history', requireAuth, HistoryController.saveProgress);
historyRouter.delete('/history/:animeId', requireAuth, HistoryController.deleteHistoryItem);
historyRouter.delete('/history', requireAuth, HistoryController.clearAllHistory);
