import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { app } from './server.js';
import { pool } from './db/db.js';
import { createSession } from './authService.js';

let server;
let baseUrl;
let adminToken;
let userToken;
const adminId = 'admin_phase3_tester';
const userId = 'user_phase3_tester';

before(async () => {
  // Khởi tạo tài khoản test
  await pool.query(`
    INSERT INTO users (id, name, email, role)
    VALUES 
      ($1, 'Admin Phase 3', 'admin.phase3@example.com', 'admin'),
      ($2, 'User Phase 3', 'user.phase3@example.com', 'user')
    ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role;
  `, [adminId, userId]);

  const adminSession = await createSession(adminId, 24);
  const userSession = await createSession(userId, 24);
  adminToken = adminSession.token;
  userToken = userSession.token;

  await new Promise((resolve) => {
    server = http.createServer(app);
    server.listen(0, () => {
      const port = server.address().port;
      baseUrl = `http://localhost:${port}`;
      resolve();
    });
  });
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await pool.query('DELETE FROM users WHERE id IN ($1, $2)', [adminId, userId]);
  await pool.query('DELETE FROM anime_overrides WHERE anime_id LIKE $1', ['test-%']);
  await pool.query('DELETE FROM episode_overrides WHERE anime_id LIKE $1', ['test-%']);
  await pool.query('DELETE FROM reports WHERE anime_slug LIKE $1', ['test-%']);
  await pool.query('DELETE FROM sync_logs WHERE target_slug LIKE $1', ['test-%']);
  await pool.end();
});

describe('Giai đoạn 3: Phân quyền & Khung quản trị (RBAC & Admin Guard)', () => {
  test('Chưa đăng nhập gọi API admin trả về 401 Unauthorized', async () => {
    const res = await fetch(`${baseUrl}/api/admin/dashboard`);
    assert.equal(res.status, 401);
    const data = await res.json();
    assert.equal(data.success, false);
    assert.equal(data.code, 'UNAUTHORIZED');
  });

  test('Người dùng role "user" gọi API admin trả về 403 Forbidden', async () => {
    const res = await fetch(`${baseUrl}/api/admin/dashboard`, {
      headers: { 'Authorization': `Bearer ${userToken}` }
    });
    assert.equal(res.status, 403);
    const data = await res.json();
    assert.equal(data.success, false);
    assert.equal(data.code, 'FORBIDDEN');
  });

  test('Tài khoản role "admin" gọi /api/admin/dashboard trả về 200 và số liệu thống kê thực', async () => {
    const res = await fetch(`${baseUrl}/api/admin/dashboard`, {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.ok(typeof data.stats.total_reports === 'number');
    assert.ok(typeof data.stats.total_overrides === 'number');
    assert.ok(typeof data.stats.total_users === 'number');
    assert.ok(Array.isArray(data.recent_reports));
  });
});

describe('Giai đoạn 3: Quản lý phim & Ẩn/Hiện (Anime Overrides & Visibility)', () => {
  const testSlug = 'test-naruto-shippuden';

  test('Admin cập nhật thông tin phim và đặt is_hidden = true', async () => {
    const res = await fetch(`${baseUrl}/api/admin/anime/${testSlug}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        title_vietnamese: 'Naruto Truyền Kỳ (Bản Chỉnh Sửa)',
        title_english: 'Naruto Shippuden (Admin Edit)',
        description: 'Mô tả độc quyền đã được quản trị viên hiệu chỉnh.',
        cover_image: 'https://example.com/naruto-cover.jpg',
        is_hidden: true,
        notes: 'Ẩn để kiểm tra tính năng'
      })
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.equal(data.data.anime_id, testSlug);
    assert.equal(data.data.is_hidden, true);
  });

  test('Phim bị ẩn sẽ không hiển thị trên user API /api/anime/:id (trả về 404)', async () => {
    const res = await fetch(`${baseUrl}/api/anime/${testSlug}`);
    assert.equal(res.status, 404);
  });

  test('Admin mở lại phim bằng nút toggle-visibility', async () => {
    const res = await fetch(`${baseUrl}/api/admin/anime/${testSlug}/toggle-visibility`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.equal(data.is_hidden, false);

    // Kiểm tra chi tiết phim qua admin API
    const adminDetailRes = await fetch(`${baseUrl}/api/admin/anime/${testSlug}`, {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    const adminDetail = await adminDetailRes.json();
    assert.equal(adminDetail.data.title.vietnamese, 'Naruto Truyền Kỳ (Bản Chỉnh Sửa)');
    assert.equal(adminDetail.data.is_hidden, false);
  });
});

describe('Giai đoạn 3: Quản lý tập và nguồn phát (Episode Overrides & Check)', () => {
  const testSlug = 'test-one-piece';

  test('Admin cấu hình ẩn Tập 5 của phim', async () => {
    const res = await fetch(`${baseUrl}/api/admin/anime/${testSlug}/episodes/5`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        is_hidden: true,
        notes: 'Tập đang lỗi âm thanh, tạm ẩn để sửa'
      })
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.equal(data.data.is_hidden, true);
  });

  test('User gọi nguồn phát tập bị ẩn nhận 404', async () => {
    const res = await fetch(`${baseUrl}/api/watch/sources`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ anime_id: testSlug, episode_number: 5 })
    });
    assert.equal(res.status, 404);
    const data = await res.json();
    assert.equal(data.success, false);
    assert.match(data.message, /tạm ẩn hoặc bảo trì/i);
  });

  test('Admin cập nhật link phát thay thế và bật lại tập phim', async () => {
    const customEmbed = 'https://player.phimapi.com/player/?url=https://custom.stream.net/ep5.m3u8';
    const res = await fetch(`${baseUrl}/api/admin/anime/${testSlug}/episodes/5`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        embed_url: customEmbed,
        is_hidden: false,
        notes: 'Đã thay link phát mới chất lượng cao'
      })
    });
    assert.equal(res.status, 200);

    // User gọi nguồn phát sẽ nhận được custom embed_url
    const userRes = await fetch(`${baseUrl}/api/watch/sources`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ anime_id: testSlug, episode_number: 5 })
    });
    assert.equal(userRes.status, 200);
    const userData = await userRes.json();
    assert.equal(userData.embed_url, customEmbed);
  });

  test('Admin kiểm tra trạng thái hoạt động của nguồn phát tập phim', async () => {
    const res = await fetch(`${baseUrl}/api/admin/anime/${testSlug}/episodes/5/check`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.ok(['ok', 'error'].includes(data.status));
    assert.ok(data.checked_at);
  });
});

describe('Giai đoạn 3: Báo lỗi & Chống spam (Reports & Rate Limiting)', () => {
  test('Gửi quá 5 báo lỗi liên tiếp trong 1 phút trả về 429 Too Many Requests', async () => {
    // Gửi 5 báo lỗi đầu tiên
    for (let i = 1; i <= 5; i++) {
      const res = await fetch(`${baseUrl}/api/reports`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${userToken}`
        },
        body: JSON.stringify({
          anime_id: 'test-bleach',
          anime_title: 'Bleach',
          episode_number: i,
          provider: 'AniDoki',
          issue_type: 'video_error',
          description: `Spam test ${i}`
        })
      });
      assert.equal(res.status, 201);
    }

    // Báo lỗi thứ 6 phải bị chặn bởi Rate Limiter
    const blockedRes = await fetch(`${baseUrl}/api/reports`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${userToken}`
      },
      body: JSON.stringify({
        anime_id: 'test-bleach',
        anime_title: 'Bleach',
        episode_number: 6,
        provider: 'AniDoki',
        issue_type: 'video_error',
        description: 'Should be rate limited'
      })
    });
    assert.equal(blockedRes.status, 429);
    const blockedData = await blockedRes.json();
    assert.equal(blockedData.success, false);
    assert.match(blockedData.message, /quá nhiều báo lỗi/i);
  });

  test('Admin xem danh sách báo lỗi và chuyển trạng thái sang "resolved" kèm ghi chú', async () => {
    const listRes = await fetch(`${baseUrl}/api/admin/reports?anime_id=test-bleach`, {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    assert.equal(listRes.status, 200);
    const listData = await listRes.json();
    assert.ok(listData.data.length > 0);
    const reportId = listData.data[0].id;

    // Chuyển trạng thái
    const patchRes = await fetch(`${baseUrl}/api/admin/reports/${reportId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        status: 'resolved',
        admin_notes: 'Đã thay link server Vietsub dự phòng, test mượt mà.'
      })
    });
    assert.equal(patchRes.status, 200);
    const patchData = await patchRes.json();
    assert.equal(patchData.data.status, 'resolved');
    assert.equal(patchData.data.admin_notes, 'Đã thay link server Vietsub dự phòng, test mượt mà.');
    assert.ok(patchData.data.resolved_at);
  });
});

describe('Giai đoạn 3: Quản lý người dùng & phân quyền (User Management)', () => {
  test('Admin cập nhật vai trò của user thành admin', async () => {
    const res = await fetch(`${baseUrl}/api/admin/users/${userId}/role`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      },
      body: JSON.stringify({ role: 'admin' })
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.user.role, 'admin');
  });

  test('Admin không thể tự hạ quyền của chính mình', async () => {
    const res = await fetch(`${baseUrl}/api/admin/users/${adminId}/role`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      },
      body: JSON.stringify({ role: 'user' })
    });
    assert.equal(res.status, 400);
    const data = await res.json();
    assert.match(data.message, /không thể tự hạ quyền/i);
  });
});
