import crypto from 'node:crypto';
import { pool } from './db.js';

export async function runMigrations() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Cập nhật bảng users: thêm role và updated_at
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(50) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE,
        avatar TEXT,
        provider VARCHAR(50) DEFAULT 'google',
        role VARCHAR(20) DEFAULT 'user',
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(20) DEFAULT 'user';
      ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;
    `);

    // 2. Bảng user_sessions lưu trữ phiên đăng nhập có thể kiểm chứng và thu hồi
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_sessions (
        token VARCHAR(128) PRIMARY KEY,
        user_id VARCHAR(50) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        expires_at TIMESTAMPTZ NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id);
      CREATE INDEX IF NOT EXISTS idx_user_sessions_expires ON user_sessions(expires_at);
    `);

    // 3. Đảm bảo bảng kk_watchlist có user_id và khóa duy nhất (user_id, slug)
    // Nếu bảng chưa có, tạo mới; nếu là bảng cũ dùng chung, lưu trữ sang legacy_kk_watchlist
    await client.query(`
      CREATE TABLE IF NOT EXISTS kk_watchlist (
        slug TEXT NOT NULL,
        anime JSONB NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'kk_watchlist' AND column_name = 'user_id'
        ) THEN
          CREATE TABLE IF NOT EXISTS legacy_kk_watchlist AS SELECT * FROM kk_watchlist;
          TRUNCATE kk_watchlist;
          ALTER TABLE kk_watchlist DROP CONSTRAINT IF EXISTS kk_watchlist_pkey;
          ALTER TABLE kk_watchlist ADD COLUMN user_id VARCHAR(50) NOT NULL REFERENCES users(id) ON DELETE CASCADE;
          ALTER TABLE kk_watchlist ADD PRIMARY KEY (user_id, slug);
        END IF;
      END $$;
    `);

    // 4. Đảm bảo bảng kk_history có user_id, progress_seconds, duration và khóa (user_id, slug)
    await client.query(`
      CREATE TABLE IF NOT EXISTS kk_history (
        slug TEXT NOT NULL,
        anime JSONB NOT NULL,
        episode INTEGER NOT NULL,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'kk_history' AND column_name = 'user_id'
        ) THEN
          CREATE TABLE IF NOT EXISTS legacy_kk_history AS SELECT * FROM kk_history;
          TRUNCATE kk_history;
          ALTER TABLE kk_history DROP CONSTRAINT IF EXISTS kk_history_pkey;
          ALTER TABLE kk_history ADD COLUMN user_id VARCHAR(50) NOT NULL REFERENCES users(id) ON DELETE CASCADE;
          ALTER TABLE kk_history ADD COLUMN IF NOT EXISTS progress_seconds INTEGER DEFAULT 0;
          ALTER TABLE kk_history ADD COLUMN IF NOT EXISTS duration INTEGER DEFAULT 0;
          ALTER TABLE kk_history ADD PRIMARY KEY (user_id, slug);
        END IF;
      END $$;
    `);

    await client.query(`
      ALTER TABLE kk_history ADD COLUMN IF NOT EXISTS progress_seconds INTEGER DEFAULT 0;
      ALTER TABLE kk_history ADD COLUMN IF NOT EXISTS duration INTEGER DEFAULT 0;
    `);

    // 5. Cập nhật Thư viện cá nhân: thêm trạng thái theo dõi (plan_to_watch, watching, completed)
    await client.query(`
      ALTER TABLE kk_watchlist ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'plan_to_watch';
      ALTER TABLE kk_watchlist ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
    `);

    // 6. Bảng tiếp nhận báo lỗi (Reports) từ trình phát
    await client.query(`
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
    `);

    await client.query(`
      ALTER TABLE reports ADD COLUMN IF NOT EXISTS admin_notes TEXT;
      ALTER TABLE reports ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;
      ALTER TABLE reports ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
    `);

    // 7. Bảng lưu trữ chỉnh sửa và ẩn/hiện phim của Admin (Giai đoạn 3)
    await client.query(`
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
    `);

    // 8. Bảng lưu trữ tùy biến tập và nguồn phát của Admin (Giai đoạn 3)
    await client.query(`
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
    `);

    // 9. Bảng nhật ký đồng bộ nguồn dữ liệu (Giai đoạn 3)
    await client.query(`
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
    `);

    // 10. Giai đoạn 4: Hoàn thiện User (is_banned, player_settings) & Sessions audit
    await client.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS is_banned BOOLEAN DEFAULT FALSE;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS ban_reason TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS banned_at TIMESTAMPTZ;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS player_settings JSONB DEFAULT '{"autoNext":true,"autoPlay":false,"defaultSpeed":1,"preferredQuality":"1080p"}';

      ALTER TABLE user_sessions ADD COLUMN IF NOT EXISTS user_agent TEXT;
      ALTER TABLE user_sessions ADD COLUMN IF NOT EXISTS ip_address VARCHAR(50);
    `);

    // 11. Giai đoạn 4: Bảng phản hồi người dùng (Feedback & Trợ giúp)
    await client.query(`
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
    `);

    // 12. Giai đoạn 4: Bảng cấu hình bố cục trang chủ (Homepage Configuration)
    await client.query(`
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

      INSERT INTO homepage_config (id)
      VALUES ('default')
      ON CONFLICT (id) DO NOTHING;
    `);

    // 13. Giai đoạn 4: Bảng cài đặt hệ thống (System Settings)
    await client.query(`
      CREATE TABLE IF NOT EXISTS system_settings (
        key VARCHAR(100) PRIMARY KEY,
        value JSONB NOT NULL,
        description TEXT,
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        updated_by VARCHAR(50)
      );

      INSERT INTO system_settings (key, value, description)
      VALUES 
        ('site_name', '"anidoki"', 'Tên thương hiệu website'),
        ('site_logo', '"/brand/anidoki-white.svg?v=6"', 'Đường dẫn logo website'),
        ('contact_email', '"support@anidoki.vn"', 'Email hỗ trợ liên hệ'),
        ('site_announcement', '""', 'Thông báo banner trên đầu website'),
        ('maintenance_mode', 'false', 'Chế độ bảo trì toàn trang')
      ON CONFLICT (key) DO NOTHING;
    `);

    // 14. Giai đoạn 4: Bảng nhật ký kiểm toán thao tác quản trị (Audit Logs)
    await client.query(`
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
    `);

    // 15. Tài khoản quản trị viên cục bộ (admin / admin123)
    await client.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT;
    `);

    const salt = 'e4a28f80459c9d72213e00cf77821381';
    const hash = crypto.scryptSync('admin123', salt, 64).toString('hex');
    const pwdHash = `${salt}:${hash}`;

    await client.query(`
      INSERT INTO users (id, name, email, avatar, provider, role, password_hash, created_at, updated_at)
      VALUES (
        'admin',
        'Quản trị viên AniDoki',
        'admin@system.anidoki',
        'https://ui-avatars.com/api/?name=Admin&background=e50914&color=fff&bold=true',
        'local',
        'admin',
        $1,
        NOW(),
        NOW()
      )
      ON CONFLICT (id) DO UPDATE SET
        password_hash = EXCLUDED.password_hash,
        role = 'admin',
        email = 'admin@system.anidoki';
    `, [pwdHash]);

    // Xóa các phiên đã hết hạn
    await client.query('DELETE FROM user_sessions WHERE expires_at <= NOW()');

    await client.query('COMMIT');
    console.log('✅ Cơ sở dữ liệu và Migration Giai đoạn 1, 2, 3, 4 đã sẵn sàng.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Lỗi chạy Migration:', err);
    throw err;
  } finally {
    client.release();
  }
}
