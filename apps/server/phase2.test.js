import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { pool } from './db/db.js';
import { runMigrations } from './db/migrations.js';
import { createSession } from './authService.js';
import { app } from './server.js';
import http from 'node:http';

describe('Giai đoạn 2: API Tìm kiếm, Khám phá, Thư viện, Lịch sử và Báo lỗi', () => {
  let server;
  let serverUrl;
  const testUserId = 'test_phase2_user';
  let userToken = '';

  before(async () => {
    await runMigrations();

    await new Promise(resolve => {
      server = http.createServer(app);
      server.listen(0, () => {
        const port = server.address().port;
        serverUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });

    // Cleanup and prepare test user
    await pool.query('DELETE FROM users WHERE id = $1', [testUserId]);
    await pool.query(`
      INSERT INTO users (id, name, email, role, provider)
      VALUES ($1, 'Phase 2 User', 'phase2@test.anidoki', 'user', 'google')
      ON CONFLICT (id) DO NOTHING;
    `, [testUserId]);

    const sess = await createSession(testUserId, 1);
    userToken = sess.token;
  });

  after(async () => {
    await pool.query('DELETE FROM users WHERE id = $1', [testUserId]);
    if (server) {
      await new Promise(resolve => server.close(resolve));
    }
  });

  test('GET /api/browse: Tìm kiếm & Lọc phim theo nhiều tiêu chí', async () => {
    // 1. Browse không truyền tham số -> trả về danh sách mặc định
    const res = await fetch(`${serverUrl}/api/browse?limit=10`);
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.success, true);
    assert.ok(Array.isArray(json.data));
    assert.ok(json.pagination);
    assert.equal(json.pagination.page, 1);

    // 2. Browse với từ khóa tìm kiếm
    const searchRes = await fetch(`${serverUrl}/api/browse?q=one+piece&limit=5`);
    assert.equal(searchRes.status, 200);
    const searchJson = await searchRes.json();
    assert.equal(searchJson.success, true);
    assert.ok(Array.isArray(searchJson.data));
  });

  test('GET /api/library & POST /api/library/status: Quản lý Thư viện cá nhân theo trạng thái', async () => {
    // Chưa đăng nhập -> 401
    const unauthRes = await fetch(`${serverUrl}/api/library`);
    assert.equal(unauthRes.status, 401);

    // Lưu phim với trạng thái 'watching'
    const setStatus1 = await fetch(`${serverUrl}/api/library/status`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${userToken}`
      },
      body: JSON.stringify({ animeId: 'naruto', status: 'watching' })
    });
    assert.equal(setStatus1.status, 200);
    const res1Json = await setStatus1.json();
    assert.equal(res1Json.success, true);
    assert.equal(res1Json.status, 'watching');

    // Lưu phim thứ hai với trạng thái 'plan_to_watch'
    const setStatus2 = await fetch(`${serverUrl}/api/library/status`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${userToken}`
      },
      body: JSON.stringify({ animeId: 'bleach', status: 'plan_to_watch' })
    });
    assert.equal(setStatus2.status, 200);

    // Lấy thư viện (tất cả)
    const allLibRes = await fetch(`${serverUrl}/api/library`, {
      headers: { Authorization: `Bearer ${userToken}` }
    });
    const allLib = await allLibRes.json();
    assert.equal(allLib.success, true);
    assert.ok(allLib.counts.all >= 2);
    assert.ok(allLib.counts.watching >= 1);
    assert.ok(allLib.counts.plan_to_watch >= 1);

    // Lọc theo tab 'watching'
    const watchingRes = await fetch(`${serverUrl}/api/library?status=watching`, {
      headers: { Authorization: `Bearer ${userToken}` }
    });
    const watchingData = await watchingRes.json();
    assert.equal(watchingData.success, true);
    const foundWatching = watchingData.data.find(a => a.id === 'naruto');
    assert.ok(foundWatching, 'naruto phải xuất hiện trong tab watching');

    // Cập nhật trạng thái thành 'completed'
    await fetch(`${serverUrl}/api/library/status`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${userToken}`
      },
      body: JSON.stringify({ animeId: 'naruto', status: 'completed' })
    });

    // Xóa anime khỏi thư viện
    const delRes = await fetch(`${serverUrl}/api/library/naruto`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${userToken}` }
    });
    const delJson = await delRes.json();
    assert.equal(delJson.success, true);
  });

  test('GET /api/history & DELETE /api/history: Lịch sử xem phim có phân trang & xóa toàn bộ', async () => {
    // Lưu lịch sử xem 2 phim
    await fetch(`${serverUrl}/api/history`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${userToken}`
      },
      body: JSON.stringify({ animeId: 'jujutsu-kaisen', episodeNumber: 1, currentTime: 120, duration: 1440 })
    });
    await fetch(`${serverUrl}/api/history`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${userToken}`
      },
      body: JSON.stringify({ animeId: 'demon-slayer', episodeNumber: 5, currentTime: 0, duration: 0 })
    });

    // Lấy lịch sử xem (trang 1, limit 1)
    const page1Res = await fetch(`${serverUrl}/api/history?page=1&limit=1`, {
      headers: { Authorization: `Bearer ${userToken}` }
    });
    const page1Json = await page1Res.json();
    assert.equal(page1Json.success, true);
    assert.equal(page1Json.data.length, 1);
    assert.ok(page1Json.pagination.total >= 2);
    assert.equal(page1Json.pagination.hasMore, true);

    // Xóa toàn bộ lịch sử xem
    const clearRes = await fetch(`${serverUrl}/api/history`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${userToken}` }
    });
    const clearJson = await clearRes.json();
    assert.equal(clearJson.success, true);

    // Kiểm tra lịch sử sau khi xóa
    const afterClearRes = await fetch(`${serverUrl}/api/history`, {
      headers: { Authorization: `Bearer ${userToken}` }
    });
    const afterClearJson = await afterClearRes.json();
    assert.equal(afterClearJson.data.length, 0);
  });

  test('POST /api/reports: Báo cáo sự cố phát video', async () => {
    const reportPayload = {
      anime_id: 'one-piece',
      episode_number: 1080,
      provider: 'AniDoki',
      issue_type: 'video_error',
      description: 'Video không phát được ở phút thứ 5'
    };

    const res = await fetch(`${serverUrl}/api/reports`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${userToken}`
      },
      body: JSON.stringify(reportPayload)
    });

    assert.equal(res.status, 201);
    const json = await res.json();
    assert.equal(json.success, true);
    assert.ok(json.report.id);
    assert.equal(json.report.anime_slug, 'one-piece');
    assert.equal(json.report.issue_type, 'video_error');
  });
});
