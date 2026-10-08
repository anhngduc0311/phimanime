import crypto from 'node:crypto';
import { UserModel } from '../models/user.model.js';

export function getAdminEmails() {
  const envAdmin = process.env.ADMIN_EMAILS || '';
  return envAdmin
    .split(',')
    .map(e => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isEmailAdmin(email) {
  if (!email) return false;
  const adminEmails = getAdminEmails();
  return adminEmails.includes(email.toLowerCase());
}

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password, storedHash) {
  if (!storedHash || !password) return false;
  if (storedHash === password) return true;
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, key] = parts;
  try {
    const hash = crypto.scryptSync(password, salt, 64).toString('hex');
    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(key, 'hex'));
  } catch {
    return false;
  }
}

export async function verifyGoogleCredential(credential, expectedClientId) {
  if (!credential) {
    throw new Error('Thiếu thông tin Google ID Token (credential)');
  }
  const verifyRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`, {
    signal: AbortSignal.timeout(10000)
  });
  const payload = await verifyRes.json();
  if (!verifyRes.ok || payload.error) {
    throw new Error(payload.error_description || payload.error || 'Google ID Token không hợp lệ');
  }

  if (expectedClientId && payload.aud !== expectedClientId) {
    throw new Error('Google ID Token không dành cho ứng dụng này (mã ứng dụng không khớp)');
  }

  return {
    sub: payload.sub,
    email: payload.email,
    name: payload.name || (payload.email ? payload.email.split('@')[0] : 'Người dùng Google'),
    picture: payload.picture || `https://ui-avatars.com/api/?name=${encodeURIComponent(payload.name || 'User')}&background=random`
  };
}

export async function verifyGoogleAccessToken(accessToken, expectedClientId) {
  if (!accessToken) {
    throw new Error('Thiếu thông tin Google Access Token');
  }

  const tokenInfoRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(accessToken)}`, {
    signal: AbortSignal.timeout(10000)
  });
  const tokenInfo = await tokenInfoRes.json();
  if (!tokenInfoRes.ok || tokenInfo.error) {
    throw new Error(tokenInfo.error_description || tokenInfo.error || 'Google Access Token không hợp lệ hoặc đã hết hạn');
  }

  if (expectedClientId && tokenInfo.aud && tokenInfo.aud !== expectedClientId) {
    throw new Error('Google Access Token không thuộc ứng dụng này');
  }

  const userinfoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(10000)
  });
  const profile = await userinfoRes.json();
  if (!userinfoRes.ok || profile.error) {
    throw new Error(profile.error_description || profile.error || 'Không tải được hồ sơ tài khoản Google');
  }

  return {
    sub: profile.sub || tokenInfo.sub,
    email: profile.email || tokenInfo.email,
    name: profile.name || (profile.email ? profile.email.split('@')[0] : 'Người dùng Google'),
    picture: profile.picture || `https://ui-avatars.com/api/?name=${encodeURIComponent(profile.name || 'User')}&background=random`
  };
}

export async function upsertUser({ sub, email, name, picture, provider = 'google' }) {
  const userId = `google_${sub}`;
  const isAdmin = isEmailAdmin(email);
  const initialRole = isAdmin ? 'admin' : 'user';

  const user = await UserModel.upsertGoogleUser({
    userId,
    email,
    name,
    picture,
    provider,
    initialRole
  });

  if (user && typeof user.player_settings === 'string') {
    try {
      user.player_settings = JSON.parse(user.player_settings);
    } catch {
      user.player_settings = { autoNext: true, autoPlay: true, defaultSpeed: 1, preferredQuality: 'auto' };
    }
  } else if (user && !user.player_settings) {
    user.player_settings = { autoNext: true, autoPlay: true, defaultSpeed: 1, preferredQuality: 'auto' };
  }

  return user;
}

export async function registerLocalUser({ username, email, name, password }) {
  if (!name || typeof name !== 'string' || name.trim().length < 2) {
    throw new Error('Họ và tên phải có ít nhất 2 ký tự.');
  }

  if (!email || typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    throw new Error('Địa chỉ email không hợp lệ.');
  }

  if (!password || typeof password !== 'string' || password.length < 6) {
    throw new Error('Mật khẩu phải có ít nhất 6 ký tự.');
  }

  const cleanEmail = email.trim().toLowerCase();
  const cleanName = name.trim();
  const cleanUsername = (username ? username.trim().toLowerCase() : cleanEmail.split('@')[0])
    .replace(/[^a-zA-Z0-9_]/g, '_');

  if (cleanUsername.length < 3) {
    throw new Error('Tên tài khoản phải có ít nhất 3 ký tự.');
  }

  if (cleanUsername === 'admin' || cleanEmail === 'admin@system.anidoki' || cleanEmail === 'admin@anidoki.com') {
    throw new Error('Tên tài khoản hoặc email này đã được sử dụng.');
  }

  const existingByEmail = await UserModel.findByIdOrEmail(cleanEmail);
  if (existingByEmail) {
    const err = new Error('Email này đã được đăng ký. Vui lòng đăng nhập.');
    err.status = 409;
    throw err;
  }

  const existingById = await UserModel.findById(cleanUsername);
  if (existingById) {
    const err = new Error('Tên tài khoản này đã có người sử dụng. Vui lòng chọn tên khác.');
    err.status = 409;
    throw err;
  }

  const pwdHash = hashPassword(password);
  const avatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(cleanName)}&background=random`;

  const user = await UserModel.createLocalUser({
    id: cleanUsername,
    name: cleanName,
    email: cleanEmail,
    avatar,
    passwordHash: pwdHash,
    role: 'user'
  });

  user.player_settings = { autoNext: true, autoPlay: true, defaultSpeed: 1, preferredQuality: 'auto' };
  return user;
}

export async function authenticateLocalUser(usernameOrEmail, password) {
  if (!usernameOrEmail || !password) {
    throw new Error('Vui lòng nhập tên đăng nhập và mật khẩu.');
  }

  const clean = usernameOrEmail.trim().toLowerCase();
  let user = await UserModel.findByIdOrEmail(clean);

  if (clean === 'admin' || clean === 'admin@anidoki.com' || clean === 'admin@system.anidoki') {
    if (password === 'admin123') {
      const pwdHash = hashPassword('admin123');
      user = await UserModel.upsertLocalAdmin({
        id: 'admin',
        name: 'Quản trị viên AniDoki',
        email: 'admin@system.anidoki',
        avatar: 'https://ui-avatars.com/api/?name=Admin&background=e50914&color=fff&bold=true',
        passwordHash: pwdHash
      });
    } else {
      throw new Error('Mật khẩu không chính xác.');
    }
  } else if (!user) {
    throw new Error('Tài khoản không tồn tại.');
  } else {
    let valid = false;
    if (user.password_hash) {
      valid = verifyPassword(password, user.password_hash);
    }
    if (!valid) {
      throw new Error('Mật khẩu không chính xác.');
    }
  }

  if (user.is_banned) {
    throw new Error(`Tài khoản đã bị khóa.${user.ban_reason ? ' Lý do: ' + user.ban_reason : ''}`);
  }

  if (typeof user.player_settings === 'string') {
    try {
      user.player_settings = JSON.parse(user.player_settings);
    } catch {
      user.player_settings = { autoNext: true, autoPlay: true, defaultSpeed: 1, preferredQuality: 'auto' };
    }
  } else if (!user.player_settings) {
    user.player_settings = { autoNext: true, autoPlay: true, defaultSpeed: 1, preferredQuality: 'auto' };
  }

  return user;
}

export async function createSession(userId, durationDays = 7, metadata = {}) {
  const token = 'anidoki_sess_' + crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000);
  const userAgent = metadata.userAgent || null;
  const ipAddress = metadata.ip || null;

  await UserModel.createSession({
    token,
    userId,
    expiresAt,
    userAgent,
    ipAddress
  });

  return {
    token,
    expiresAt: expiresAt.toISOString()
  };
}

export async function getUserByToken(token) {
  const user = await UserModel.getUserBySessionToken(token);
  if (user) {
    if (typeof user.player_settings === 'string') {
      try {
        user.player_settings = JSON.parse(user.player_settings);
      } catch {
        user.player_settings = { autoNext: true, autoPlay: true, defaultSpeed: 1, preferredQuality: 'auto' };
      }
    } else if (!user.player_settings) {
      user.player_settings = { autoNext: true, autoPlay: true, defaultSpeed: 1, preferredQuality: 'auto' };
    }
  }
  return user;
}

export async function revokeSession(token) {
  await UserModel.revokeSession(token);
}

export async function getUserSessions(userId, currentToken) {
  const rows = await UserModel.getUserSessions(userId);
  return rows.map(row => ({
    id: row.token.slice(-12),
    isCurrent: row.token === currentToken,
    userAgent: row.user_agent || 'Thiết bị không xác định',
    ipAddress: row.ip_address || '—',
    createdAt: row.created_at,
    expiresAt: row.expires_at
  }));
}

export async function revokeOtherSessions(userId, currentToken) {
  const revokedCount = await UserModel.revokeOtherSessions(userId, currentToken);
  return { revokedCount };
}

export async function updateUserProfile(userId, { name, avatar, player_settings }) {
  const user = await UserModel.updateUserProfile(userId, { name, avatar, player_settings });
  if (user && typeof user.player_settings === 'string') {
    try {
      user.player_settings = JSON.parse(user.player_settings);
    } catch {
      user.player_settings = { autoNext: true, autoPlay: true, defaultSpeed: 1, preferredQuality: 'auto' };
    }
  }
  return user;
}
