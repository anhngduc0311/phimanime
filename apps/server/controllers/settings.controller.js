import { ConfigModel } from '../models/config.model.js';

export const SettingsController = {
  async getPublicHomepageConfig(req, res) {
    try {
      const config = await ConfigModel.getHomepageConfig();
      res.json({
        success: true,
        data: config
      });
    } catch (err) {
      console.error('Get homepage config error:', err);
      res.status(500).json({ success: false, message: 'Lỗi tải cấu hình trang chủ' });
    }
  },

  async getPublicSettings(req, res) {
    try {
      const settings = await ConfigModel.getSystemSettings();
      res.json({
        success: true,
        settings
      });
    } catch (err) {
      console.error('Get settings error:', err);
      res.status(500).json({ success: false, message: 'Lỗi tải cài đặt hệ thống' });
    }
  }
};
