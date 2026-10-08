// API Client - Giao tiếp với AniDoki Backend REST API
const API_BASE = '/api';
const browseCache = new Map();

export const AniDokiAPI = {
  // 1. Catalog APIs
  async getSpotlight() {
    try {
      const res = await fetch(`${API_BASE}/anime/spotlight`);
      const data = await res.json();
      return data.success ? data.data : [];
    } catch (err) {
      console.error('getSpotlight error:', err);
      return [];
    }
  },

  async getTrending(limit = 12) {
    try {
      const res = await fetch(`${API_BASE}/anime/trending?limit=${limit}`);
      const data = await res.json();
      return data.success ? data.data : [];
    } catch (err) {
      console.error('getTrending error:', err);
      return [];
    }
  },

  async getTrendingCatalog(page = 1, limit = 12) {
    const params = new URLSearchParams({ page, limit });
    const res = await fetch(`${API_BASE}/anime/trending?${params}`);
    const data = await res.json();
    if (!res.ok || !data.success || !Array.isArray(data.data)) throw new Error('Không tải được phim thịnh hành');
    return data;
  },

  async getRecentlyUpdated(limit = 24, page = 1) {
    try {
      const res = await fetch(`${API_BASE}/anime/recently-updated?limit=${limit}&page=${page}`);
      const data = await res.json();
      return data.success ? data.data : [];
    } catch (err) {
      console.error('getRecentlyUpdated error:', err);
      return [];
    }
  },

  async getSeasonal(page = 1) {
    try {
      const res = await fetch(`${API_BASE}/anime/seasonal?page=${page}`);
      const data = await res.json();
      return data.success ? data.data : [];
    } catch (err) {
      console.error('getSeasonal error:', err);
      return [];
    }
  },

  async getMovies(page = 1, limit = 12) {
    const params = new URLSearchParams({ page, limit });
    const res = await fetch(`${API_BASE}/anime/movies?${params}`);
    const data = await res.json();
    if (!res.ok || !data.success || !Array.isArray(data.data)) throw new Error('Không tải được phim lẻ');
    return data;
  },

  async getGenres() {
    try {
      const res = await fetch(`${API_BASE}/anime/genres`);
      const data = await res.json();
      return data.success ? data.data : {};
    } catch (err) {
      console.error('getGenres error:', err);
      return {};
    }
  },

  async getBrowse(filters = {}, { signal } = {}) {
    try {
      const cleanParams = new URLSearchParams();
      Object.entries(filters).forEach(([k, v]) => {
        if (v !== undefined && v !== null && String(v).trim() !== '') {
          cleanParams.set(k, String(v).trim());
        }
      });
      cleanParams.sort();
      const key = cleanParams.toString();
      const cached = browseCache.get(key);
      if (cached?.expires > Date.now()) return cached.data;
      const res = await fetch(`${API_BASE}/browse?${key}`, { signal });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || 'Lỗi tải danh sách phim');
      browseCache.delete(key);
      if (browseCache.size >= 12) browseCache.delete(browseCache.keys().next().value);
      browseCache.set(key, { data, expires: Date.now() + 60000 });
      return data;
    } catch (err) {
      if (err.name !== 'AbortError') console.error('getBrowse error:', err);
      throw err;
    }
  },


  // 2. Anime Detail & Episodes
  async getAnimeDetail(id) {
    try {
      const res = await fetch(`${API_BASE}/anime/${id}`);
      const data = await res.json();
      return data.success ? data.data : null;
    } catch (err) {
      console.error(`getAnimeDetail(${id}) error:`, err);
      return null;
    }
  },

  async getEpisodes(id) {
    try {
      const res = await fetch(`${API_BASE}/anime/${id}/episodes`);
      const data = await res.json();
      return data.success ? data.data : [];
    } catch (err) {
      console.error(`getEpisodes(${id}) error:`, err);
      return [];
    }
  },

  // 3. Search API
  async search(query = '', filters = {}) {
    try {
      const params = new URLSearchParams({ q: query, ...filters });
      const res = await fetch(`${API_BASE}/search?${params.toString()}`);
      const data = await res.json();
      return data.success ? data.data : [];
    } catch (err) {
      console.error('search error:', err);
      return [];
    }
  },

  // Token Storage Helpers
  getToken() {
    return localStorage.getItem('anidoki_token');
  },

  setToken(token) {
    if (token) {
      localStorage.setItem('anidoki_token', token);
    }
  },

  clearToken() {
    localStorage.removeItem('anidoki_token');
  },

  getAuthHeaders(extra = {}) {
    const token = this.getToken();
    const headers = { 'Content-Type': 'application/json', ...extra };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
  },

  // 4. Watchlist API (Yêu cầu đăng nhập & gửi token)
  async getWatchlist() {
    const token = this.getToken();
    if (!token) return [];
    try {
      const res = await fetch(`${API_BASE}/watchlist`, {
        headers: this.getAuthHeaders()
      });
      if (res.status === 401) {
        this.clearToken();
        return [];
      }
      const data = await res.json();
      return data.success ? data.data : [];
    } catch (err) {
      console.error('getWatchlist error:', err);
      return [];
    }
  },

  async toggleWatchlist(animeId) {
    const token = this.getToken();
    if (!token) {
      return { success: false, code: 'UNAUTHORIZED', message: 'Vui lòng đăng nhập để lưu phim yêu thích' };
    }
    try {
      const res = await fetch(`${API_BASE}/watchlist/toggle`, {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify({ animeId })
      });
      const data = await res.json();
      if (res.status === 401) {
        this.clearToken();
        return { success: false, code: 'UNAUTHORIZED', message: data.message || 'Phiên làm việc đã hết hạn' };
      }
      return data;
    } catch (err) {
      console.error('toggleWatchlist error:', err);
      return { success: false, message: 'Lỗi kết nối máy chủ' };
    }
  },

  // 5. History / Continue Watching API (Yêu cầu đăng nhập & gửi token)
  async getHistory(page = 1, limit = 20) {
    const token = this.getToken();
    if (!token) return { success: false, data: [], pagination: { page, limit, total: 0, hasMore: false } };
    try {
      const res = await fetch(`${API_BASE}/history?page=${page}&limit=${limit}`, {
        headers: this.getAuthHeaders()
      });
      if (res.status === 401) {
        this.clearToken();
        return { success: false, data: [], pagination: { page, limit, total: 0, hasMore: false } };
      }
      const data = await res.json();
      return data.success ? data : { success: false, data: [], pagination: {} };
    } catch (err) {
      console.error('getHistory error:', err);
      return { success: false, data: [], pagination: {} };
    }
  },

  async saveProgress(animeId, episodeNumber, currentTime, duration) {
    const token = this.getToken();
    if (!token) return { success: false, code: 'UNAUTHORIZED' };
    try {
      const res = await fetch(`${API_BASE}/history`, {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify({ animeId, episodeNumber, currentTime, duration })
      });
      const data = await res.json();
      if (res.status === 401) {
        this.clearToken();
        return { success: false, code: 'UNAUTHORIZED' };
      }
      return data;
    } catch (err) {
      console.error('saveProgress error:', err);
      return { success: false };
    }
  },

  async deleteHistory(animeId) {
    try {
      const url = animeId ? `${API_BASE}/history/${encodeURIComponent(animeId)}` : `${API_BASE}/history`;
      const res = await fetch(url, {
        method: 'DELETE',
        headers: this.getAuthHeaders()
      });
      return await res.json();
    } catch (err) {
      console.error('deleteHistory error:', err);
      return { success: false };
    }
  },

  async clearAllHistory() {
    try {
      const res = await fetch(`${API_BASE}/history`, {
        method: 'DELETE',
        headers: this.getAuthHeaders()
      });
      return await res.json();
    } catch (err) {
      console.error('clearAllHistory error:', err);
      return { success: false, message: 'Lỗi xóa toàn bộ lịch sử xem' };
    }
  },

  // 6. Library API (Thư viện cá nhân)
  async getLibrary(params = {}) {
    const token = this.getToken();
    if (!token) return { success: false, code: 'UNAUTHORIZED', data: [], counts: { all: 0, plan_to_watch: 0, watching: 0, completed: 0 } };
    try {
      const cleanParams = new URLSearchParams();
      Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined && v !== null && String(v).trim() !== '') {
          cleanParams.set(k, String(v).trim());
        }
      });
      const res = await fetch(`${API_BASE}/library?${cleanParams.toString()}`, {
        headers: this.getAuthHeaders()
      });
      if (res.status === 401) {
        this.clearToken();
        return { success: false, code: 'UNAUTHORIZED', data: [], counts: { all: 0, plan_to_watch: 0, watching: 0, completed: 0 } };
      }
      return await res.json();
    } catch (err) {
      console.error('getLibrary error:', err);
      return { success: false, data: [], counts: { all: 0, plan_to_watch: 0, watching: 0, completed: 0 } };
    }
  },

  async updateLibraryStatus(animeId, status) {
    const token = this.getToken();
    if (!token) return { success: false, code: 'UNAUTHORIZED', message: 'Vui lòng đăng nhập' };
    try {
      const res = await fetch(`${API_BASE}/library/status`, {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify({ animeId, status })
      });
      return await res.json();
    } catch (err) {
      console.error('updateLibraryStatus error:', err);
      return { success: false, message: 'Lỗi cập nhật trạng thái thư viện' };
    }
  },

  async deleteLibraryItem(animeId) {
    const token = this.getToken();
    if (!token) return { success: false, code: 'UNAUTHORIZED' };
    try {
      const res = await fetch(`${API_BASE}/library/${encodeURIComponent(animeId)}`, {
        method: 'DELETE',
        headers: this.getAuthHeaders()
      });
      return await res.json();
    } catch (err) {
      return { success: false };
    }
  },

  // 7. Báo lỗi phát video (Reports)
  async submitReport(reportData) {
    try {
      const res = await fetch(`${API_BASE}/reports`, {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify(reportData)
      });
      return await res.json();
    } catch (err) {
      console.error('submitReport error:', err);
      return { success: false, message: 'Lỗi kết nối khi gửi báo lỗi' };
    }
  },


  // 6. User Auth & Session API
  async getAuthConfig() {
    try {
      const res = await fetch(`${API_BASE}/auth/config`);
      return await res.json();
    } catch {
      return { clientId: '680572592219-jovd5g5n9p9k5r1ok4p81cpu5sr4hiu9.apps.googleusercontent.com' };
    }
  },

  async googleLogin(authPayload) {
    try {
      const res = await fetch(`${API_BASE}/auth/google`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(authPayload)
      });
      const contentType = res.headers.get('content-type') || '';
      const data = contentType.includes('application/json') ? await res.json() : null;

      if (!res.ok) {
        if (res.status === 502) {
          return {
            success: false,
            message: 'Máy chủ backend đang khởi động hoặc chưa sẵn sàng (502 Bad Gateway). Vui lòng thử lại sau vài giây.'
          };
        }
        return {
          success: false,
          message: data?.message || `Lỗi máy chủ (${res.status})`
        };
      }

      if (data?.success && data.token) {
        this.setToken(data.token);
      }
      return data || { success: false, message: 'Dữ liệu phản hồi không hợp lệ' };
    } catch (err) {
      console.error('googleLogin error:', err);
      return { success: false, message: 'Lỗi kết nối máy chủ xác thực. Vui lòng thử lại.' };
    }
  },

  async loginWithCredentials(username, password) {
    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const contentType = res.headers.get('content-type') || '';
      const data = contentType.includes('application/json') ? await res.json() : null;

      if (!res.ok) {
        if (res.status === 502) {
          return {
            success: false,
            message: 'Máy chủ backend đang khởi động hoặc chưa sẵn sàng (502 Bad Gateway). Vui lòng thử lại sau vài giây.'
          };
        }
        return {
          success: false,
          message: data?.message || `Lỗi máy chủ (${res.status})`
        };
      }

      if (data?.success && data.token) {
        this.setToken(data.token);
      }
      return data || { success: false, message: 'Dữ liệu phản hồi không hợp lệ' };
    } catch (err) {
      console.error('loginWithCredentials error:', err);
      return { success: false, message: 'Lỗi kết nối máy chủ xác thực' };
    }
  },

  async registerWithCredentials({ name, email, username, password }) {
    try {
      const res = await fetch(`${API_BASE}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, username, password })
      });
      const data = await res.json();
      if (data.success && data.token) {
        this.setToken(data.token);
      }
      return data;
    } catch (err) {
      console.error('registerWithCredentials error:', err);
      return { success: false, message: 'Lỗi kết nối máy chủ xác thực' };
    }
  },

  async getMe() {
    const token = this.getToken();
    if (!token) return { success: false, code: 'UNAUTHORIZED', message: 'Chưa đăng nhập' };
    try {
      const res = await fetch(`${API_BASE}/auth/me`, {
        headers: this.getAuthHeaders()
      });
      const data = await res.json();
      if (res.status === 401) {
        this.clearToken();
        return { success: false, code: 'SESSION_EXPIRED', message: data.message || 'Phiên làm việc đã hết hạn' };
      }
      return data;
    } catch (err) {
      console.error('getMe error:', err);
      return { success: false, message: 'Lỗi kiểm tra phiên làm việc' };
    }
  },

  async logout() {
    try {
      await fetch(`${API_BASE}/auth/logout`, {
        method: 'POST',
        headers: this.getAuthHeaders()
      });
    } catch (err) {
      console.warn('Logout network notice:', err);
    } finally {
      this.clearToken();
    }
    return { success: true };
  },

  // 7. Admin APIs
  async getAdminMe() {
    try {
      const res = await fetch(`${API_BASE}/admin/me`, {
        headers: this.getAuthHeaders()
      });
      return await res.json();
    } catch (err) {
      return { success: false, message: err.message };
    }
  },

  async getAdminDashboard() {
    try {
      const res = await fetch(`${API_BASE}/admin/dashboard`, {
        headers: this.getAuthHeaders()
      });
      return await res.json();
    } catch (err) {
      return { success: false, message: err.message };
    }
  },

  async getAdminStats() {
    try {
      const res = await fetch(`${API_BASE}/admin/stats`, {
        headers: this.getAuthHeaders()
      });
      return await res.json();
    } catch (err) {
      return { success: false, message: err.message };
    }
  },

  async getAdminAnime(params = {}) {
    try {
      const cleanParams = new URLSearchParams();
      Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined && v !== null && String(v).trim() !== '') {
          cleanParams.set(k, String(v).trim());
        }
      });
      const res = await fetch(`${API_BASE}/admin/anime?${cleanParams.toString()}`, {
        headers: this.getAuthHeaders()
      });
      return await res.json();
    } catch (err) {
      return { success: false, message: err.message };
    }
  },

  async getAdminAnimeDetail(id) {
    try {
      const res = await fetch(`${API_BASE}/admin/anime/${encodeURIComponent(id)}`, {
        headers: this.getAuthHeaders()
      });
      return await res.json();
    } catch (err) {
      return { success: false, message: err.message };
    }
  },

  async updateAdminAnime(id, data) {
    try {
      const res = await fetch(`${API_BASE}/admin/anime/${encodeURIComponent(id)}`, {
        method: 'PUT',
        headers: this.getAuthHeaders(),
        body: JSON.stringify(data)
      });
      return await res.json();
    } catch (err) {
      return { success: false, message: err.message };
    }
  },

  async toggleAdminAnimeVisibility(id, isHidden) {
    try {
      const res = await fetch(`${API_BASE}/admin/anime/${encodeURIComponent(id)}/toggle-visibility`, {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify({ isHidden })
      });
      return await res.json();
    } catch (err) {
      return { success: false, message: err.message };
    }
  },

  async getAdminEpisodes(animeId) {
    try {
      const res = await fetch(`${API_BASE}/admin/anime/${encodeURIComponent(animeId)}/episodes`, {
        headers: this.getAuthHeaders()
      });
      return await res.json();
    } catch (err) {
      return { success: false, message: err.message };
    }
  },

  async updateAdminEpisode(animeId, episodeNumber, data) {
    try {
      const res = await fetch(`${API_BASE}/admin/anime/${encodeURIComponent(animeId)}/episodes/${episodeNumber}`, {
        method: 'PUT',
        headers: this.getAuthHeaders(),
        body: JSON.stringify(data)
      });
      return await res.json();
    } catch (err) {
      return { success: false, message: err.message };
    }
  },

  async checkAdminEpisode(animeId, episodeNumber, embedUrl) {
    try {
      const res = await fetch(`${API_BASE}/admin/anime/${encodeURIComponent(animeId)}/episodes/${episodeNumber}/check`, {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify({ embedUrl })
      });
      return await res.json();
    } catch (err) {
      return { success: false, message: err.message };
    }
  },

  async getAdminSyncLogs(limit = 20) {
    try {
      const res = await fetch(`${API_BASE}/admin/sync/logs?limit=${limit}`, {
        headers: this.getAuthHeaders()
      });
      return await res.json();
    } catch (err) {
      return { success: false, message: err.message };
    }
  },

  async syncAdminAnime(slug) {
    try {
      const res = await fetch(`${API_BASE}/admin/sync/anime`, {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify({ slug })
      });
      return await res.json();
    } catch (err) {
      return { success: false, message: err.message };
    }
  },

  async syncAdminRecent(page = 1) {
    try {
      const res = await fetch(`${API_BASE}/admin/sync/recent`, {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify({ page })
      });
      return await res.json();
    } catch (err) {
      return { success: false, message: err.message };
    }
  },

  async getAdminReports(params = {}) {
    try {
      const cleanParams = new URLSearchParams();
      Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined && v !== null && String(v).trim() !== '') {
          cleanParams.set(k, String(v).trim());
        }
      });
      const res = await fetch(`${API_BASE}/admin/reports?${cleanParams.toString()}`, {
        headers: this.getAuthHeaders()
      });
      return await res.json();
    } catch (err) {
      return { success: false, message: err.message };
    }
  },

  async updateAdminReport(id, data) {
    try {
      const res = await fetch(`${API_BASE}/admin/reports/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: this.getAuthHeaders(),
        body: JSON.stringify(data)
      });
      return await res.json();
    } catch (err) {
      return { success: false, message: err.message };
    }
  },

  async getAdminUsers(params = {}) {
    try {
      const cleanParams = new URLSearchParams();
      Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined && v !== null && String(v).trim() !== '') {
          cleanParams.set(k, String(v).trim());
        }
      });
      const res = await fetch(`${API_BASE}/admin/users?${cleanParams.toString()}`, {
        headers: this.getAuthHeaders()
      });
      return await res.json();
    } catch (err) {
      return { success: false, message: err.message };
    }
  },

  async updateAdminUserRole(id, role) {
    try {
      const res = await fetch(`${API_BASE}/admin/users/${encodeURIComponent(id)}/role`, {
        method: 'PATCH',
        headers: this.getAuthHeaders(),
        body: JSON.stringify({ role })
      });
      return await res.json();
    } catch (err) {
      return { success: false, message: err.message };
    }
  },

  // ==========================================
  // PHASE 4: USER ACCOUNT & PLAYER SETTINGS
  // ==========================================
  async getAccountProfile() {
    try {
      const res = await fetch(`${API_BASE}/account/me`, {
        headers: this.getAuthHeaders()
      });
      return await res.json();
    } catch (err) {
      return { success: false, message: err.message };
    }
  },

  async updateAccountProfile(data) {
    try {
      const res = await fetch(`${API_BASE}/account/profile`, {
        method: 'PUT',
        headers: this.getAuthHeaders(),
        body: JSON.stringify(data)
      });
      return await res.json();
    } catch (err) {
      return { success: false, message: err.message };
    }
  },

  async getAccountSessions() {
    try {
      const res = await fetch(`${API_BASE}/account/sessions`, {
        headers: this.getAuthHeaders()
      });
      return await res.json();
    } catch (err) {
      return { success: false, message: err.message };
    }
  },

  async revokeOtherSessions() {
    try {
      const res = await fetch(`${API_BASE}/account/sessions/revoke-others`, {
        method: 'POST',
        headers: this.getAuthHeaders()
      });
      return await res.json();
    } catch (err) {
      return { success: false, message: err.message };
    }
  },

  // ==========================================
  // PHASE 4: HELP & FEEDBACK
  // ==========================================
  async sendFeedback(data) {
    try {
      const headers = this.getAuthHeaders();
      const res = await fetch(`${API_BASE}/feedback`, {
        method: 'POST',
        headers,
        body: JSON.stringify(data)
      });
      return await res.json();
    } catch (err) {
      return { success: false, message: err.message };
    }
  },

  // ==========================================
  // PHASE 4: PUBLIC HOMEPAGE CONFIG & SETTINGS
  // ==========================================
  async getHomepageConfig() {
    try {
      const res = await fetch(`${API_BASE}/homepage/config`);
      return await res.json();
    } catch (err) {
      return { success: false, message: err.message };
    }
  },

  async getPublicSettings() {
    try {
      const res = await fetch(`${API_BASE}/settings`);
      return await res.json();
    } catch (err) {
      return { success: false, message: err.message };
    }
  },

  // ==========================================
  // PHASE 4: ADMIN ADVANCED USER MANAGEMENT
  // ==========================================
  async getAdminUserDetail(id) {
    try {
      const res = await fetch(`${API_BASE}/admin/users/${encodeURIComponent(id)}`, {
        headers: this.getAuthHeaders()
      });
      return await res.json();
    } catch (err) {
      return { success: false, message: err.message };
    }
  },

  async banAdminUser(id, { is_banned, ban_reason }) {
    try {
      const res = await fetch(`${API_BASE}/admin/users/${encodeURIComponent(id)}/ban`, {
        method: 'PATCH',
        headers: this.getAuthHeaders(),
        body: JSON.stringify({ is_banned, ban_reason })
      });
      return await res.json();
    } catch (err) {
      return { success: false, message: err.message };
    }
  },

  // ==========================================
  // PHASE 4: ADMIN HOMEPAGE CONFIG
  // ==========================================
  async getAdminHomepageConfig() {
    try {
      const res = await fetch(`${API_BASE}/admin/homepage`, {
        headers: this.getAuthHeaders()
      });
      return await res.json();
    } catch (err) {
      return { success: false, message: err.message };
    }
  },

  async updateAdminHomepageConfig(data) {
    try {
      const res = await fetch(`${API_BASE}/admin/homepage`, {
        method: 'PUT',
        headers: this.getAuthHeaders(),
        body: JSON.stringify(data)
      });
      return await res.json();
    } catch (err) {
      return { success: false, message: err.message };
    }
  },

  // ==========================================
  // PHASE 4: ADMIN FEEDBACK MANAGEMENT
  // ==========================================
  async getAdminFeedback(params = {}) {
    try {
      const cleanParams = new URLSearchParams();
      Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined && v !== null && String(v).trim() !== '') {
          cleanParams.set(k, String(v).trim());
        }
      });
      const res = await fetch(`${API_BASE}/admin/feedback?${cleanParams.toString()}`, {
        headers: this.getAuthHeaders()
      });
      return await res.json();
    } catch (err) {
      return { success: false, message: err.message };
    }
  },

  async updateAdminFeedback(id, data) {
    try {
      const res = await fetch(`${API_BASE}/admin/feedback/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: this.getAuthHeaders(),
        body: JSON.stringify(data)
      });
      return await res.json();
    } catch (err) {
      return { success: false, message: err.message };
    }
  },

  // ==========================================
  // PHASE 4: ADMIN SYSTEM SETTINGS
  // ==========================================
  async getAdminSettings() {
    try {
      const res = await fetch(`${API_BASE}/admin/settings`, {
        headers: this.getAuthHeaders()
      });
      return await res.json();
    } catch (err) {
      return { success: false, message: err.message };
    }
  },

  async updateAdminSettings(settings) {
    try {
      const res = await fetch(`${API_BASE}/admin/settings`, {
        method: 'PUT',
        headers: this.getAuthHeaders(),
        body: JSON.stringify(settings)
      });
      return await res.json();
    } catch (err) {
      return { success: false, message: err.message };
    }
  },

  // ==========================================
  // PHASE 4: ADMIN AUDIT LOGS
  // ==========================================
  async getAdminAuditLogs(params = {}) {
    try {
      const cleanParams = new URLSearchParams();
      Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined && v !== null && String(v).trim() !== '') {
          cleanParams.set(k, String(v).trim());
        }
      });
      const res = await fetch(`${API_BASE}/admin/audit-logs?${cleanParams.toString()}`, {
        headers: this.getAuthHeaders()
      });
      return await res.json();
    } catch (err) {
      return { success: false, message: err.message };
    }
  }
};
