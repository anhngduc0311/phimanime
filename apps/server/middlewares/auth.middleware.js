import { getUserByToken } from '../services/auth.service.js';

export function extractBearerToken(req) {
  const authHeader = req.headers['authorization'] || req.headers['x-auth-token'];
  if (!authHeader) return null;
  if (authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }
  return authHeader.trim();
}

export async function requireAuth(req, res, next) {
  const token = extractBearerToken(req);
  if (!token) {
    return res.status(401).json({
      success: false,
      code: 'UNAUTHORIZED',
      message: 'Vui lòng đăng nhập để thực hiện hành động này.'
    });
  }

  const user = await getUserByToken(token);
  if (!user) {
    return res.status(401).json({
      success: false,
      code: 'SESSION_EXPIRED',
      message: 'Phiên làm việc đã hết hạn hoặc không tồn tại. Vui lòng đăng nhập lại.'
    });
  }

  if (user.is_banned) {
    return res.status(403).json({
      success: false,
      code: 'ACCOUNT_BANNED',
      message: `Tài khoản của bạn đã bị khóa.${user.ban_reason ? ' Lý do: ' + user.ban_reason : ''}`
    });
  }

  req.user = user;
  req.token = token;
  next();
}

export async function optionalAuth(req, res, next) {
  const token = extractBearerToken(req);
  if (token) {
    try {
      const user = await getUserByToken(token);
      if (user && !user.is_banned) {
        req.user = user;
        req.token = token;
      } else {
        req.user = null;
      }
    } catch {
      req.user = null;
    }
  } else {
    req.user = null;
  }
  next();
}

export async function requireAdmin(req, res, next) {
  await requireAuth(req, res, () => {
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        code: 'FORBIDDEN',
        message: 'Bạn không có quyền truy cập trang quản trị.'
      });
    }
    next();
  });
}
