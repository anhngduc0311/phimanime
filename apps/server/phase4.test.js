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
const adminId = 'admin_phase4_tester';
const userId = 'user_phase4_tester';
const targetUserId = 'target_user_phase4_tester';

before(async () => {
  // Tạo người dùng test
  await pool.query(`
    INSERT INTO users (id, name, email, role, is_banned, player_settings)
    VALUES 
      ($1, 'Admin Phase 4', 'admin.phase4@example.com', 'admin', false, '{"autoNext":true,"autoPlay":true,"defaultSpeed":1,"preferredQuality":"auto"}'),
      ($2, 'User Phase 4', 'user.phase4@example.com', 'user', false, '{"autoNext":true,"autoPlay":true,"defaultSpeed":1,"preferredQuality":"auto"}'),
      ($3, 'Target User Phase 4', 'target.phase4@example.com', 'user', false, null)
    ON CONFLICT (id) DO UPDATE SET 
      role = EXCLUDED.role,
      is_banned = false,
      ban_reason = null;
  `, [adminId, userId, targetUserId]);

  const adminSession = await createSession(adminId, 7, { userAgent: 'AdminTestBrowser/1.0', ip: '127.0.0.1' });
  const userSession = await createSession(userId, 7, { userAgent: 'UserTestBrowser/1.0', ip: '127.0.0.1' });
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
  await pool.query('DELETE FROM users WHERE id IN ($1, $2, $3)', [adminId, userId, targetUserId]);
  await pool.query('DELETE FROM feedback WHERE name LIKE $1 OR email LIKE $2', ['%Phase 4%', '%phase4%']);
  await pool.query('DELETE FROM audit_logs WHERE user_id = $1', [adminId]);
  await pool.end();
});

describe('Giai đoạn 4: Tài khoản người dùng & Tùy chọn xem phim (/api/account)', () => {
  test('Chưa đăng nhập truy cập /api/account/me trả về 401', async () => {
    const res = await fetch(`${baseUrl}/api/account/me`);
    assert.equal(res.status, 401);
    const data = await res.json();
    assert.equal(data.success, false);
    assert.equal(data.code, 'UNAUTHORIZED');
  });

  test('Người dùng hợp lệ lấy thông tin cá nhân & tùy chọn trình phát thành công', async () => {
    const res = await fetch(`${baseUrl}/api/account/me`, {
      headers: { Authorization: `Bearer ${userToken}` }
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.equal(data.user.id, userId);
    assert.equal(typeof data.user.player_settings, 'object');
    assert.equal(data.user.player_settings.autoNext, true);
  });

  test('Người dùng cập nhật hồ sơ và tùy chọn xem phim thành công', async () => {
    const updatePayload = {
      name: 'User Phase 4 Updated',
      avatar: 'https://example.com/avatar.png',
      player_settings: {
        autoNext: false,
        autoPlay: true,
        defaultSpeed: 1.5,
        preferredQuality: '1080p'
      }
    };

    const res = await fetch(`${baseUrl}/api/account/profile`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${userToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(updatePayload)
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.equal(data.user.name, 'User Phase 4 Updated');
    assert.equal(data.user.avatar, 'https://example.com/avatar.png');
    assert.equal(data.user.player_settings.autoNext, false);
    assert.equal(data.user.player_settings.defaultSpeed, 1.5);
    assert.equal(data.user.player_settings.preferredQuality, '1080p');
  });

  test('Cập nhật hồ sơ từ chối tên rỗng hoặc avatar URL không hợp lệ', async () => {
    const resBadName = await fetch(`${baseUrl}/api/account/profile`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${userToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ name: '   ' })
    });
    assert.equal(resBadName.status, 400);

    const resBadAvatar = await fetch(`${baseUrl}/api/account/profile`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${userToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ avatar: 'ftp://invalid-url' })
    });
    assert.equal(resBadAvatar.status, 400);
  });

  test('Quản lý danh sách phiên & thu hồi các phiên đăng nhập khác', async () => {
    // Tạo thêm phiên thứ 2 cho user
    const extraSession = await createSession(userId, 7, { userAgent: 'MobilePhone/2.0', ip: '192.168.1.100' });
    const extraToken = extraSession.token;

    // Lấy danh sách phiên
    const sessionsRes = await fetch(`${baseUrl}/api/account/sessions`, {
      headers: { Authorization: `Bearer ${userToken}` }
    });
    assert.equal(sessionsRes.status, 200);
    const sessionsData = await sessionsRes.json();
    assert.equal(sessionsData.success, true);
    assert.ok(sessionsData.sessions.length >= 2);

    const currentSess = sessionsData.sessions.find(s => s.isCurrent);
    assert.ok(currentSess);
    const otherSess = sessionsData.sessions.find(s => !s.isCurrent);
    assert.ok(otherSess);

    // Thu hồi các phiên khác từ userToken
    const revokeRes = await fetch(`${baseUrl}/api/account/sessions/revoke-others`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${userToken}` }
    });
    assert.equal(revokeRes.status, 200);
    const revokeData = await revokeRes.json();
    assert.equal(revokeData.success, true);
    assert.ok(revokeData.revokedCount >= 1);

    // Kiểm tra token đã bị thu hồi không thể gọi API được nữa
    const checkRevoked = await fetch(`${baseUrl}/api/account/me`, {
      headers: { Authorization: `Bearer ${extraToken}` }
    });
    assert.equal(checkRevoked.status, 401);

    // Phiên hiện tại vẫn hoạt động bình thường
    const checkCurrent = await fetch(`${baseUrl}/api/account/me`, {
      headers: { Authorization: `Bearer ${userToken}` }
    });
    assert.equal(checkCurrent.status, 200);
  });
});

describe('Giai đoạn 4: Hỗ trợ & Góp ý người dùng (/api/feedback)', () => {
  test('Gửi phản hồi thất bại nếu thiếu nội dung', async () => {
    const res = await fetch(`${baseUrl}/api/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: '' })
    });
    assert.equal(res.status, 400);
  });

  test('Gửi phản hồi thành công và lưu vào cơ sở dữ liệu', async () => {
    const res = await fetch(`${baseUrl}/api/feedback`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${userToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        subject: 'Góp ý tính năng Phase 4',
        message: 'Trang web load rất mượt mà!'
      })
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.ok(data.feedbackId);
  });

  test('Rate limiting: Gửi phản hồi liên tiếp quá 5 lần/phút bị chặn với 429', async () => {
    const uniqueUser = 'rate_limit_user_phase4';
    await pool.query('INSERT INTO users (id, name, email, role) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING', [uniqueUser, 'Rate Test', 'rate@test.com', 'user']);
    const sess = await createSession(uniqueUser, 1);

    const sendFb = () => fetch(`${baseUrl}/api/feedback`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${sess.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ message: 'Rate limit spam test' })
    });

    const res1 = await sendFb();
    assert.equal(res1.status, 200);
    const res2 = await sendFb();
    assert.equal(res2.status, 200);
    const res3 = await sendFb();
    assert.equal(res3.status, 200);
    const res4 = await sendFb();
    assert.equal(res4.status, 200);
    const res5 = await sendFb();
    assert.equal(res5.status, 200);

    // Lần thứ 6 phải trả về 429
    const res6 = await sendFb();
    assert.equal(res6.status, 429);

    await pool.query('DELETE FROM users WHERE id = $1', [uniqueUser]);
  });
});

describe('Giai đoạn 4: Quản trị cấu hình trang chủ & hệ thống', () => {
  test('Public API lấy cấu hình trang chủ /api/homepage/config', async () => {
    const res = await fetch(`${baseUrl}/api/homepage/config`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.ok(Array.isArray(data.data.spotlight_slugs));
    assert.ok(Array.isArray(data.data.sections_config));
  });

  test('Admin cập nhật cấu hình trang chủ thành công và ghi nhật ký kiểm toán', async () => {
    const payload = {
      spotlight_slugs: ['dao-hai-tac-one-piece', 'chu-thuat-hoi-chien'],
      sections_config: [
        { id: 'latest', title: 'Mới Cập Nhật', enabled: true, order: 1 },
        { id: 'single', title: 'Phim Lẻ', enabled: false, order: 2 }
      ]
    };

    const res = await fetch(`${baseUrl}/api/admin/homepage`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);

    // Kiểm tra cấu hình công khai được cập nhật
    const publicRes = await fetch(`${baseUrl}/api/homepage/config`);
    const publicData = await publicRes.json();
    assert.deepEqual(publicData.data.spotlight_slugs, payload.spotlight_slugs);
    assert.equal(publicData.data.sections_config.length, 2);
  });

  test('Public API lấy cấu hình hệ thống /api/settings', async () => {
    const res = await fetch(`${baseUrl}/api/settings`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.ok(data.settings.site_name !== undefined);
  });

  test('Admin cập nhật cài đặt hệ thống thành công và ghi nhật ký kiểm toán', async () => {
    const payload = {
      site_name: 'AniDoki Premium',
      contact_email: 'support@anidoki.vn',
      site_announcement: 'Chào mừng bản cập nhật Giai đoạn 4!',
      maintenance_mode: false
    };

    const res = await fetch(`${baseUrl}/api/admin/settings`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);

    // Xác nhận cài đặt công khai
    const checkRes = await fetch(`${baseUrl}/api/settings`);
    const checkData = await checkRes.json();
    assert.equal(checkData.settings.site_name, 'AniDoki Premium');
    assert.equal(checkData.settings.site_announcement, 'Chào mừng bản cập nhật Giai đoạn 4!');
  });
});

describe('Giai đoạn 4: Quản lý người dùng nâng cao & Cơ chế khóa tài khoản (Ban User)', () => {
  test('Admin tìm kiếm và lọc danh sách tài khoản theo trạng thái', async () => {
    const res = await fetch(`${baseUrl}/api/admin/users?q=Target&status=active`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.ok(data.users.length >= 1);
    assert.equal(data.users[0].id, targetUserId);
  });

  test('Ràng buộc an toàn: Admin không thể tự khóa chính mình (Self-ban safeguard)', async () => {
    const res = await fetch(`${baseUrl}/api/admin/users/${adminId}/ban`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ is_banned: true, ban_reason: 'Tự khóa' })
    });
    assert.equal(res.status, 400);
    const data = await res.json();
    assert.equal(data.success, false);
    assert.ok(data.message.includes('chính mình'));
  });

  test('Ràng buộc an toàn: Admin không thể tự hạ quyền chính mình (Self-demote safeguard)', async () => {
    const res = await fetch(`${baseUrl}/api/admin/users/${adminId}/role`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ role: 'user' })
    });
    assert.equal(res.status, 400);
    const data = await res.json();
    assert.equal(data.success, false);
    assert.ok(data.message.includes('chính mình'));
  });

  test('Admin khóa tài khoản người dùng: thu hồi toàn bộ session và chặn 403 ở server', async () => {
    // 1. Tạo session cho target user
    const targetSession = await createSession(targetUserId, 7);
    const targetToken = targetSession.token;

    // Thử truy cập trước khi bị khóa: thành công
    const preCheck = await fetch(`${baseUrl}/api/account/me`, {
      headers: { Authorization: `Bearer ${targetToken}` }
    });
    assert.equal(preCheck.status, 200);

    // 2. Admin tiến hành khóa tài khoản
    const banRes = await fetch(`${baseUrl}/api/admin/users/${targetUserId}/ban`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        is_banned: true,
        ban_reason: 'Vi phạm quy định bản quyền nội dung'
      })
    });
    assert.equal(banRes.status, 200);
    const banData = await banRes.json();
    assert.equal(banData.success, true);
    assert.equal(banData.user.is_banned, true);

    // 3. Toàn bộ session của target user phải bị xóa
    const sessionInDb = await pool.query('SELECT * FROM user_sessions WHERE user_id = $1', [targetUserId]);
    assert.equal(sessionInDb.rows.length, 0);

    // 4. Gọi API với token cũ: phiên không tồn tại -> 401
    const postCheckOldToken = await fetch(`${baseUrl}/api/account/me`, {
      headers: { Authorization: `Bearer ${targetToken}` }
    });
    assert.equal(postCheckOldToken.status, 401);

    // 5. Nếu user bằng cách nào đó có session mới trong lúc is_banned=true -> trả về 403 ACCOUNT_BANNED
    const manualSession = await createSession(targetUserId, 1);
    const postCheckBanned = await fetch(`${baseUrl}/api/account/me`, {
      headers: { Authorization: `Bearer ${manualSession.token}` }
    });
    assert.equal(postCheckBanned.status, 403);
    const bannedJson = await postCheckBanned.json();
    assert.equal(bannedJson.code, 'ACCOUNT_BANNED');
    assert.ok(bannedJson.message.includes('Vi phạm quy định'));

    // 6. Admin mở khóa lại tài khoản thành công
    const unbanRes = await fetch(`${baseUrl}/api/admin/users/${targetUserId}/ban`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ is_banned: false })
    });
    assert.equal(unbanRes.status, 200);
    const unbanData = await unbanRes.json();
    assert.equal(unbanData.user.is_banned, false);
  });
});

describe('Giai đoạn 4: Quản lý phản hồi & Nhật ký kiểm toán (Audit Logs)', () => {
  test('Admin xem danh sách và cập nhật trạng thái ý kiến phản hồi', async () => {
    const listRes = await fetch(`${baseUrl}/api/admin/feedback`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert.equal(listRes.status, 200);
    const listData = await listRes.json();
    assert.equal(listData.success, true);
    assert.ok(Array.isArray(listData.feedback));

    if (listData.feedback.length > 0) {
      const fbId = listData.feedback[0].id;
      const patchRes = await fetch(`${baseUrl}/api/admin/feedback/${fbId}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          status: 'resolved',
          admin_notes: 'Đã giải quyết yêu cầu'
        })
      });
      assert.equal(patchRes.status, 200);
      const patchData = await patchRes.json();
      assert.equal(patchData.success, true);
      assert.equal(patchData.feedback.status, 'resolved');
    }
  });

  test('Admin truy vấn nhật ký kiểm toán (Audit Logs) có phân trang và bộ lọc', async () => {
    const res = await fetch(`${baseUrl}/api/admin/audit-logs?page=1&limit=10`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.ok(Array.isArray(data.logs));
    assert.ok(data.pagination);
    assert.ok(data.logs.length >= 1);

    // Kiểm tra có các hành động kiểm toán vừa thực hiện trong test
    const actions = data.logs.map(l => l.action);
    assert.ok(actions.some(a => a.includes('BAN_USER') || a.includes('UPDATE_SYSTEM_SETTINGS') || a.includes('UPDATE_HOMEPAGE')));
  });
});
