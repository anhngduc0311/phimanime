import express from 'express';
import { AuthController } from '../controllers/auth.controller.js';
import { requireAuth } from '../middlewares/auth.middleware.js';

export const authRouter = express.Router();

authRouter.get('/config', AuthController.getAuthConfig);
authRouter.post('/register', AuthController.register);
authRouter.post('/login', AuthController.loginLocal);
authRouter.post('/google', AuthController.loginGoogle);
authRouter.get('/me', requireAuth, AuthController.getMe);
authRouter.post('/logout', AuthController.logout);
