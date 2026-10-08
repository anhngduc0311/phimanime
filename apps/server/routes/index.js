import express from 'express';
import { authRouter } from './auth.routes.js';
import { accountRouter } from './account.routes.js';
import { adminRouter } from './admin.routes.js';
import { catalogRouter } from './catalog.routes.js';
import { libraryRouter } from './library.routes.js';
import { historyRouter } from './history.routes.js';
import { reportRouter } from './report.routes.js';
import { feedbackRouter } from './feedback.routes.js';
import { settingsRouter } from './settings.routes.js';

export const apiRouter = express.Router();

// Health check
apiRouter.get('/health', (req, res) => res.json({ status: 'ok', provider: 'AniDoki' }));

// Auth & Account
apiRouter.use('/auth', authRouter);
apiRouter.use('/account', accountRouter);

// Admin Management
apiRouter.use('/admin', adminRouter);

// Catalog, Library, History, Reports, Feedback, Settings
apiRouter.use(catalogRouter);
apiRouter.use(libraryRouter);
apiRouter.use(historyRouter);
apiRouter.use(reportRouter);
apiRouter.use(feedbackRouter);
apiRouter.use(settingsRouter);
