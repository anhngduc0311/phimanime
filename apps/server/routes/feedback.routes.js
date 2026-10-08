import express from 'express';
import { FeedbackController } from '../controllers/feedback.controller.js';
import { optionalAuth } from '../middlewares/auth.middleware.js';

export const feedbackRouter = express.Router();

feedbackRouter.post('/feedback', optionalAuth, FeedbackController.submitFeedback);
