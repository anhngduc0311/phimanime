import express from 'express';
import { ReportController } from '../controllers/report.controller.js';
import { optionalAuth } from '../middlewares/auth.middleware.js';

export const reportRouter = express.Router();

reportRouter.post('/reports', optionalAuth, ReportController.submitReport);
