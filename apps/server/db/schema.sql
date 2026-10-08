-- Khởi tạo Schema PostgreSQL cho AniDoki Anime Streaming Web

CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE,
    avatar TEXT,
    provider VARCHAR(50) DEFAULT 'google',
    role VARCHAR(20) DEFAULT 'user',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_sessions (
    token VARCHAR(128) PRIMARY KEY,
    user_id VARCHAR(50) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_expires ON user_sessions(expires_at);

CREATE TABLE IF NOT EXISTS animes (
    id INTEGER PRIMARY KEY,
    title_vietnamese VARCHAR(255),
    title_english VARCHAR(255) NOT NULL,
    title_romaji VARCHAR(255),
    title_native VARCHAR(255),
    logo TEXT,
    cover_image TEXT NOT NULL,
    banner_image TEXT,
    score NUMERIC(3, 1) DEFAULT 0,
    studio VARCHAR(255),
    genres JSONB DEFAULT '[]',
    format VARCHAR(50) DEFAULT 'TV',
    duration VARCHAR(50),
    status VARCHAR(100),
    year INTEGER,
    start_date VARCHAR(100),
    total_episodes INTEGER,
    current_episode INTEGER,
    next_airing_episode INTEGER,
    next_airing_at BIGINT,
    next_airing_offset INTEGER,
    description TEXT,
    is_trending BOOLEAN DEFAULT FALSE,
    is_spotlight BOOLEAN DEFAULT FALSE,
    is_movie BOOLEAN DEFAULT FALSE,
    season VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS episodes (
    id SERIAL PRIMARY KEY,
    anime_id INTEGER REFERENCES animes(id) ON DELETE CASCADE,
    episode_number INTEGER NOT NULL,
    title VARCHAR(255),
    duration VARCHAR(50),
    video_url TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(anime_id, episode_number)
);

-- Watchlist / Thư viện người dùng cho AniDoki (slug-based)
CREATE TABLE IF NOT EXISTS kk_watchlist (
    user_id VARCHAR(50) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    slug TEXT NOT NULL,
    anime JSONB NOT NULL,
    status VARCHAR(20) DEFAULT 'plan_to_watch',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (user_id, slug)
);

-- Bảng báo lỗi từ trình phát (Reports)
CREATE TABLE IF NOT EXISTS reports (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(50) REFERENCES users(id) ON DELETE SET NULL,
    anime_slug TEXT NOT NULL,
    anime_title TEXT NOT NULL,
    episode_number INTEGER NOT NULL,
    provider TEXT NOT NULL,
    issue_type VARCHAR(50) NOT NULL,
    description TEXT,
    status VARCHAR(20) DEFAULT 'pending',
    admin_notes TEXT,
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reports_created ON reports(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status);

-- Bảng lưu trữ chỉnh sửa và ẩn/hiện phim của Admin (Giai đoạn 3)
CREATE TABLE IF NOT EXISTS anime_overrides (
    anime_id VARCHAR(150) PRIMARY KEY,
    title_vietnamese TEXT,
    title_english TEXT,
    description TEXT,
    cover_image TEXT,
    banner_image TEXT,
    genres JSONB,
    status VARCHAR(50),
    is_hidden BOOLEAN DEFAULT FALSE,
    custom_seasons JSONB,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_anime_overrides_hidden ON anime_overrides(is_hidden);

-- Bảng lưu trữ tùy biến tập và nguồn phát của Admin (Giai đoạn 3)
CREATE TABLE IF NOT EXISTS episode_overrides (
    id SERIAL PRIMARY KEY,
    anime_id VARCHAR(150) NOT NULL,
    episode_number INTEGER NOT NULL,
    embed_url TEXT,
    is_hidden BOOLEAN DEFAULT FALSE,
    last_checked_at TIMESTAMPTZ,
    last_check_status VARCHAR(20),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (anime_id, episode_number)
);
CREATE INDEX IF NOT EXISTS idx_ep_overrides_anime ON episode_overrides(anime_id);

-- Bảng nhật ký đồng bộ nguồn dữ liệu (Giai đoạn 3)
CREATE TABLE IF NOT EXISTS sync_logs (
    id SERIAL PRIMARY KEY,
    sync_type VARCHAR(50) NOT NULL,
    target_slug TEXT,
    status VARCHAR(20) DEFAULT 'running',
    items_synced INTEGER DEFAULT 0,
    items_failed INTEGER DEFAULT 0,
    details JSONB,
    error_message TEXT,
    started_at TIMESTAMPTZ DEFAULT NOW(),
    finished_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_sync_logs_started ON sync_logs(started_at DESC);

-- Lịch sử xem người dùng cho AniDoki (slug-based)
CREATE TABLE IF NOT EXISTS kk_history (
    user_id VARCHAR(50) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    slug TEXT NOT NULL,
    anime JSONB NOT NULL,
    episode INTEGER NOT NULL,
    progress_seconds INTEGER DEFAULT 0,
    duration INTEGER DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (user_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_kk_history_user_updated ON kk_history(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_kk_watchlist_user_created ON kk_watchlist(user_id, created_at DESC);

-- Index tối ưu truy vấn tìm kiếm và lọc
CREATE INDEX IF NOT EXISTS idx_animes_trending ON animes(is_trending);
CREATE INDEX IF NOT EXISTS idx_animes_spotlight ON animes(is_spotlight);
CREATE INDEX IF NOT EXISTS idx_animes_status ON animes(status);
CREATE INDEX IF NOT EXISTS idx_animes_format ON animes(format);
CREATE INDEX IF NOT EXISTS idx_episodes_anime_id ON episodes(anime_id);

-- Persistent artwork metadata cache
ALTER TABLE animes ADD COLUMN IF NOT EXISTS artwork_checked_at TIMESTAMPTZ;
ALTER TABLE animes ADD COLUMN IF NOT EXISTS artwork_attempted_at TIMESTAMPTZ;

-- Giai đoạn 4: Hoàn thiện User & Cài đặt
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_banned BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS ban_reason TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS banned_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS player_settings JSONB DEFAULT '{"autoNext":true,"autoPlay":false,"defaultSpeed":1,"preferredQuality":"1080p"}';

ALTER TABLE user_sessions ADD COLUMN IF NOT EXISTS user_agent TEXT;
ALTER TABLE user_sessions ADD COLUMN IF NOT EXISTS ip_address VARCHAR(50);

-- Giai đoạn 4: Bảng phản hồi người dùng (Feedback & Trợ giúp)
CREATE TABLE IF NOT EXISTS feedback (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(50) REFERENCES users(id) ON DELETE SET NULL,
    name VARCHAR(255),
    email VARCHAR(255),
    subject VARCHAR(255),
    message TEXT NOT NULL,
    status VARCHAR(20) DEFAULT 'pending',
    admin_notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_feedback_created ON feedback(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feedback_status ON feedback(status);

-- Giai đoạn 4: Bảng cấu hình bố cục trang chủ (Homepage Configuration)
CREATE TABLE IF NOT EXISTS homepage_config (
    id VARCHAR(50) PRIMARY KEY DEFAULT 'default',
    spotlight_slugs JSONB DEFAULT '[]',
    sections_config JSONB DEFAULT '[
      {"id":"spotlight","name":"Tâm điểm hôm nay","enabled":true,"order":1},
      {"id":"continue_watching","name":"Đã xem gần đây","enabled":true,"order":2},
      {"id":"recent","name":"Mới cập nhật","enabled":true,"order":3},
      {"id":"trending","name":"Thịnh hành","enabled":true,"order":4},
      {"id":"action","name":"Hành động & Phiêu lưu","enabled":true,"order":5},
      {"id":"romance","name":"Cảm xúc & Lãng mạn","enabled":true,"order":6},
      {"id":"seasonal","name":"Tâm lý & Tình cảm","enabled":true,"order":7},
      {"id":"movies","name":"Phim lẻ điện ảnh","enabled":true,"order":8}
    ]',
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    updated_by VARCHAR(50)
);

-- Giai đoạn 4: Bảng cài đặt hệ thống (System Settings)
CREATE TABLE IF NOT EXISTS system_settings (
    key VARCHAR(100) PRIMARY KEY,
    value JSONB NOT NULL,
    description TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    updated_by VARCHAR(50)
);

-- Giai đoạn 4: Bảng nhật ký kiểm toán thao tác quản trị (Audit Logs)
CREATE TABLE IF NOT EXISTS audit_logs (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(50),
    admin_name VARCHAR(255),
    admin_email VARCHAR(255),
    action VARCHAR(100) NOT NULL,
    target_type VARCHAR(100),
    target_id VARCHAR(255),
    details JSONB,
    ip_address VARCHAR(50),
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_target ON audit_logs(target_type, target_id);
