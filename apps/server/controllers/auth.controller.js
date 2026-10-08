import {
  verifyGoogleCredential,
  verifyGoogleAccessToken,
  upsertUser,
  authenticateLocalUser,
  registerLocalUser,
  createSession,
  revokeSession
} from '../services/auth.service.js';
import { extractBearerToken } from '../middlewares/auth.middleware.js';

export const AuthController = {
  getAuthConfig(req, res) {
    res.json({
      clientId: process.env.GOOGLE_CLIENT_ID || '680572592219-jovd5g5n9p9k5r1ok4p81cpu5sr4hiu9.apps.googleusercontent.com'
    });
  },

  async register(req, res) {
    try {
      const { username, email, name, password } = req.body;
      const user = await registerLocalUser({ username, email, name, password });

      const session = await createSession(user.id, 7, {
        userAgent: req.headers['user-agent'],
        ip: req.ip || req.socket.remoteAddress
      });

      res.status(201).json({
        success: true,
        message: 'Đăng ký tài khoản thành công! Chào mừng ' + user.name,
        token: session.token,
        expiresAt: session.expiresAt,
        user
      });
    } catch (err) {
      res.status(err.status || 400).json({
        success: false,
        message: err.message || 'Đăng ký tài khoản thất bại'
      });
    }
  },

  async loginLocal(req, res) {
    try {
      const { username, password, email } = req.body;
      const identifier = username || email;
      if (!identifier || !password) {
        return res.status(400).json({ success: false, message: 'Vui lòng nhập tên đăng nhập và mật khẩu' });
      }

      const user = await authenticateLocalUser(identifier, password);

      const session = await createSession(user.id, 7, {
        userAgent: req.headers['user-agent'],
        ip: req.ip || req.socket.remoteAddress
      });

      res.json({
        success: true,
        token: session.token,
        expiresAt: session.expiresAt,
        user
      });
    } catch (err) {
      res.status(401).json({
        success: false,
        message: err.message || 'Đăng nhập thất bại. Vui lòng kiểm tra lại tài khoản và mật khẩu.'
      });
    }
  },

  async loginGoogle(req, res) {
    try {
      const { credential, access_token } = req.body;
      const clientId = process.env.GOOGLE_CLIENT_ID;
      let profile = null;

      if (credential) {
        profile = await verifyGoogleCredential(credential, clientId);
      } else if (access_token) {
        profile = await verifyGoogleAccessToken(access_token, clientId);
      } else {
        return res.status(400).json({ success: false, message: 'Thiếu thông tin xác thực Google (credential hoặc access_token)' });
      }

      const user = await upsertUser({
        sub: profile.sub,
        email: profile.email,
        name: profile.name,
        picture: profile.picture,
        provider: 'google'
      });

      if (user.is_banned) {
        return res.status(403).json({
          success: false,
          code: 'ACCOUNT_BANNED',
          message: `Tài khoản của bạn đã bị khóa.${user.ban_reason ? ' Lý do: ' + user.ban_reason : ''}`
        });
      }

      const session = await createSession(user.id, 7, {
        userAgent: req.headers['user-agent'],
        ip: req.ip || req.socket.remoteAddress
      });

      res.json({
        success: true,
        token: session.token,
        expiresAt: session.expiresAt,
        user
      });
    } catch (err) {
      console.error('Google Auth Error:', err.message);
      res.status(401).json({
        success: false,
        message: err.message || 'Đăng nhập Google thất bại. Vui lòng thử lại.'
      });
    }
  },

  getMe(req, res) {
    res.json({
      success: true,
      user: req.user
    });
  },

  async logout(req, res) {
    const token = extractBearerToken(req);
    if (token) {
      await revokeSession(token);
    }
    res.json({
      success: true,
      message: 'Đăng xuất thành công'
    });
  }
};
