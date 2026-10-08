import express from 'express';
import { AdminController } from '../controllers/admin.controller.js';
import { requireAdmin } from '../middlewares/auth.middleware.js';

export const adminRouter = express.Router();

adminRouter.use(requireAdmin);

adminRouter.get('/me', AdminController.getMe);
adminRouter.get('/dashboard', AdminController.getDashboard);
adminRouter.get('/stats', (req, res) => res.redirect('/api/admin/dashboard'));

// Quản lý Phim & Overrides
adminRouter.get('/anime', AdminController.getAnime);
adminRouter.get('/anime/:id', AdminController.getAnimeDetail);
adminRouter.put('/anime/:id', AdminController.updateAnime);
adminRouter.post('/anime/:id/toggle-visibility', AdminController.toggleAnimeVisibility);

// Quản lý Tập phim & Kiểm tra luồng video
adminRouter.get('/anime/:id/episodes', AdminController.getEpisodes);
adminRouter.put('/anime/:id/episodes/:episodeNumber', AdminController.updateEpisode);
adminRouter.post('/anime/:id/episodes/:episodeNumber/check', AdminController.checkEpisode);

// Đồng bộ Upstream
adminRouter.get('/sync/logs', AdminController.getSyncLogs);
adminRouter.post('/sync/anime', AdminController.syncAnime);
adminRouter.post('/sync/recent', AdminController.syncRecentCatalog);

// Quản lý Báo lỗi
adminRouter.get('/reports', AdminController.getReports);
adminRouter.patch('/reports/:id', AdminController.updateReport);

// Quản lý Người dùng
adminRouter.get('/users', AdminController.getUsers);
adminRouter.get('/users/:id', AdminController.getUserById);
adminRouter.patch('/users/:id/role', AdminController.updateUserRole);
adminRouter.patch('/users/:id/ban', AdminController.banUser);

// Cấu hình Trang chủ
adminRouter.get('/homepage', AdminController.getHomepageConfig);
adminRouter.put('/homepage', AdminController.updateHomepageConfig);

// Phản hồi góp ý
adminRouter.get('/feedback', AdminController.getFeedback);
adminRouter.patch('/feedback/:id', AdminController.updateFeedback);

// Cài đặt Hệ thống
adminRouter.get('/settings', AdminController.getSettings);
adminRouter.put('/settings', AdminController.updateSettings);

// Nhật ký kiểm toán
adminRouter.get('/audit-logs', AdminController.getAuditLogs);
