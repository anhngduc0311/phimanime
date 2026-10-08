import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const anime47ApiHeaders = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  Referer: 'https://anime47.best/',
  Origin: 'https://anime47.best',
  Accept: 'application/json, text/plain, */*'
};

function jwtExpiry(token) {
  try {
    const exp = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()).exp;
    return Number.isFinite(exp) ? exp * 1000 : 0;
  } catch { return 0; }
}

// The environment supplies the initial session. Rotated refresh tokens are
// persisted separately, never written into source files or sent to the client.
export function createAnime47Session({ config = () => process.env, request = (...args) => fetch(...args), now = Date.now } = {}) {
  let state;
  let pending;
  function current() {
    const env = config();
    const accessToken = (env.ANIME47_ACCESS_TOKEN || '').trim().replace(/^Bearer\s+/i, '');
    const refreshToken = (env.ANIME47_REFRESH_TOKEN || '').trim();
    const file = env.ANIME47_SESSION_FILE || '';
    const seed = createHash('sha256').update(JSON.stringify([accessToken, refreshToken, file])).digest('hex');
    if (state?.seed === seed) return state;
    state = { seed, file, accessToken, refreshToken, expiresAt: jwtExpiry(accessToken), retryAfter: 0 };
    if (file) {
      try {
        const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
        if (saved.seed === seed && typeof saved.accessToken === 'string' && typeof saved.refreshToken === 'string') {
          Object.assign(state, { accessToken: saved.accessToken, refreshToken: saved.refreshToken,
            expiresAt: Number(saved.expiresAt) || jwtExpiry(saved.accessToken) });
        }
      } catch (error) {
        if (error.code !== 'ENOENT') console.warn('Anime47 stored session could not be loaded');
      }
    }
    return state;
  }

  function save(session) {
    if (!session.file) return;
    fs.mkdirSync(path.dirname(session.file), { recursive: true, mode: 0o700 });
    const temp = session.file + '.' + randomBytes(8).toString('hex') + '.tmp';
    try {
      fs.writeFileSync(temp, JSON.stringify({ seed: session.seed, accessToken: session.accessToken,
        refreshToken: session.refreshToken, expiresAt: session.expiresAt }), { mode: 0o600 });
      fs.renameSync(temp, session.file);
    } finally {
      if (fs.existsSync(temp)) fs.unlinkSync(temp);
    }
  }

  async function refresh(failedToken) {
    const session = current();
    // Another request may already have refreshed the rejected access token.
    if (failedToken !== undefined && session.accessToken !== failedToken) return session.accessToken;
    if (!session.refreshToken) return session.accessToken;
    if (pending?.session === session) return pending.task;
    if (session.retryAfter > now()) throw Object.assign(new Error('Phiên Anime47 cần được đăng nhập lại hoặc thử lại sau.'), {
      status: session.lastFailure?.status || 502, code: 'SOURCE_LOGIN_REQUIRED',
      upstreamStatus: session.lastFailure?.upstreamStatus
    });
    const task = (async () => {
      let upstreamStatus;
      try {
        const response = await request('https://anime47.love/api/auth/refresh-token', {
          method: 'POST', headers: { ...anime47ApiHeaders, 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token: session.refreshToken }),
          redirect: 'error', signal: AbortSignal.timeout(12000)
        });
        upstreamStatus = response.status;
        if (!response.ok) throw Object.assign(new Error('Không làm mới được phiên Anime47. Hãy cập nhật refresh token trên máy chủ.'), {
          status: response.status, code: 'ANIME47_REFRESH_FAILED'
        });
        const payload = await response.json();
        const data = payload?.data || payload;
        const accessToken = data?.access_token || data?.accessToken || data?.token;
        const refreshToken = data?.refresh_token || data?.refreshToken || session.refreshToken;
        if (typeof accessToken !== 'string' || !accessToken || typeof refreshToken !== 'string' || !refreshToken) {
          throw Object.assign(new Error('Phản hồi làm mới phiên Anime47 không hợp lệ.'), { code: 'ANIME47_REFRESH_INVALID' });
        }
        if (current() !== session) return current().accessToken;
        const seconds = Number(data.expires_in || data.expiresIn);
        Object.assign(session, { accessToken, refreshToken, expiresAt: jwtExpiry(accessToken) ||
          now() + (Number.isFinite(seconds) && seconds > 0 ? seconds : 900) * 1000, retryAfter: 0 });
        try { save(session); }
        catch { console.warn('Anime47 refreshed session could not be persisted; check session volume permissions'); }
        return accessToken;
      } catch (error) {
        session.retryAfter = now() + 30000;
        session.lastFailure = { status: error.status, upstreamStatus };
        console.warn('Anime47 refresh failed', JSON.stringify({
          status: upstreamStatus, code: error.code?.startsWith('ANIME47_REFRESH') ? error.code : 'ANIME47_REFRESH_FAILED',
          networkCode: error.cause?.code
        }));
        // Do not expose upstream error bodies, which may contain credentials.
        if (error.code?.startsWith('ANIME47_REFRESH')) throw error;
        throw Object.assign(new Error('Không kết nối được dịch vụ làm mới phiên Anime47.'), { code: 'ANIME47_REFRESH_FAILED' });
      }
    })();
    pending = { session, task };
    try { return await task; }
    finally { if (pending?.task === task) pending = undefined; }
  }

  return {
    token: () => current().accessToken,
    configured: () => Boolean(current().accessToken || current().refreshToken),
    async ensure() {
      const session = current();
      if (session.refreshToken && (!session.accessToken || (session.expiresAt && session.expiresAt <= now() + 60000))) {
        return refresh();
      }
      return session.accessToken;
    },
    refresh
  };
}

export const anime47Session = createAnime47Session();
