import express from 'express';
import { AccountController } from '../controllers/account.controller.js';
import { requireAuth } from '../middlewares/auth.middleware.js';

export const accountRouter = express.Router();

accountRouter.use(requireAuth);

accountRouter.get('/me', AccountController.getProfile);
accountRouter.put('/profile', AccountController.updateProfile);
accountRouter.get('/sessions', AccountController.getSessions);
accountRouter.post('/sessions/revoke-others', AccountController.revokeOtherSessions);
