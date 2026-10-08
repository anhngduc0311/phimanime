import express from 'express';
import { SettingsController } from '../controllers/settings.controller.js';

export const settingsRouter = express.Router();

settingsRouter.get('/homepage/config', SettingsController.getPublicHomepageConfig);
settingsRouter.get('/settings', SettingsController.getPublicSettings);
