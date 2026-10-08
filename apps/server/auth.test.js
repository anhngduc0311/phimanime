import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { pool } from './db/db.js';
import { runMigrations } from './db/migrations.js';
import {
  createSession,
  getUserByToken,
  revokeSession,
  upsertUser,
  isEmailAdmin,
  getAdminEmails
} from './authService.js';
import { app } from './server.js';
import http from 'node:http';

describe('Giai đoạn 1: Xác thực, Phân quyền và Dữ liệu cá nhân', () => {
  let server;
  let serverUrl;
  const testUserId1 = 'test_user_001';
  const testUserId2 = 'test_user_002';
  let tokenUser1 = '';
  let tokenUser2 = '';
  let tokenAdmin = '';

  before(async () => {
    // 1. Chạy migration
    await runMigrations();

    // 2. Tạo server HTTP test trên cổng ngẫu nhiên
    await new Promise(resolve => {
      server = http.createServer(app);
      server.listen(0, () => {
        const port = server.address().port;
        serverUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });

    // 3. Dọn dẹp dữ liệu test cũ nếu có
    await pool.query('DELETE FROM users WHERE id IN ($1, $2, $3)', [testUserId1, testUserId2, 'test_admin_001']);

    // 4. Tạo 2 tài khoản người dùng thường và 1 tài khoản admin
    await pool.query(`
      INSERT INTO users (id, name, email, role, provider)
      VALUES 
        ($1, 'Người Dùng 1', 'user1@test.anidoki', 'user', 'google'),
        ($2, 'Người Dùng 2', 'user2@test.anidoki', 'user', 'google'),
        ($3, 'Quản Trị Viên', 'admin@anidoki.com', 'admin', 'google')
      ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role;
    `, [testUserId1, testUserId2, 'test_admin_001']);

    // 5. Tạo các phiên đăng nhập tương ứng
    const s1 = await createSession(testUserId1, 1);
    const s2 = await createSession(testUserId2, 1);
    const sAdmin = await createSession('test_admin_001', 1);

    tokenUser1 = s1.token;
    tokenUser2 = s2.token;
    tokenAdmin = sAdmin.token;
  });

  after(async () => {
    // Dọn dẹp dữ liệu test
    await pool.query('DELETE FROM users WHERE id IN ($1, $2, $3)', [testUserId1, testUserId2, 'test_admin_001']);
    if (server) {
      await new Promise(resolve => server.close(resolve));
    }
  });

  test('Phiên đăng nhập: kiểm tra token hợp lệ và hết hạn', async () => {
    const user = await getUserByToken(tokenUser1);
    assert.ok(user, 'Phiên hợp lệ phải trả về người dùng');
    assert.equal(user.id, testUserId1);
    assert.equal(user.role, 'user');

    // Token không tồn tại
    const invalid = await getUserByToken('anidoki_sess_invalid');
    assert.equal(invalid, null);

    // Phiên đã hết hạn
    const expiredToken = 'anidoki_sess_expired_test';
    await pool.query(
      'INSERT INTO user_sessions (token, user_id, expires_at) VALUES ($1, $2, NOW() - INTERVAL \'1 hour\')',
      [expiredToken, testUserId1]
    );
    const expiredUser = await getUserByToken(expiredToken);
    assert.equal(expiredUser, null, 'Phiên hết hạn không được trả về người dùng');
    await revokeSession(expiredToken);
  });

  test('/api/auth/me: Trả về người dùng của phiên hiện tại hoặc 401', async () => {
    // Yêu cầu không có token
    const resNoAuth = await fetch(`${serverUrl}/api/auth/me`);
    assert.equal(resNoAuth.status, 401);
    const noAuthBody = await resNoAuth.json();
    assert.equal(noAuthBody.code, 'UNAUTHORIZED');

    // Yêu cầu với token User 1
    const resUser1 = await fetch(`${serverUrl}/api/auth/me`, {
      headers: { Authorization: `Bearer ${tokenUser1}` }
    });
    assert.equal(resUser1.status, 200);
    const user1Body = await resUser1.json();
    assert.equal(user1Body.user.id, testUserId1);
    assert.equal(user1Body.user.name, 'Người Dùng 1');

    // Yêu cầu với token User 2
    const resUser2 = await fetch(`${serverUrl}/api/auth/me`, {
      headers: { Authorization: `Bearer ${tokenUser2}` }
    });
    assert.equal(resUser2.status, 200);
    const user2Body = await resUser2.json();
    assert.equal(user2Body.user.id, testUserId2);
    assert.notEqual(user1Body.user.id, user2Body.user.id);
  });

  test('/api/auth/logout: Vô hiệu hóa phiên làm việc trên server', async () => {
    const tempSession = await createSession(testUserId1, 1);
    
    // Kiểm tra trước khi logout
    const beforeCheck = await fetch(`${serverUrl}/api/auth/me`, {
      headers: { Authorization: `Bearer ${tempSession.token}` }
    });
    assert.equal(beforeCheck.status, 200);

    // Đăng xuất
    const logoutRes = await fetch(`${serverUrl}/api/auth/logout`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tempSession.token}` }
    });
    assert.equal(logoutRes.status, 200);

    // Sau khi logout: phải bị từ chối 401
    const afterCheck = await fetch(`${serverUrl}/api/auth/me`, {
      headers: { Authorization: `Bearer ${tempSession.token}` }
    });
    assert.equal(afterCheck.status, 401);
  });

  test('Phân quyền RBAC: Người dùng thường không gọi được API Admin', async () => {
    // 1. Chưa đăng nhập -> 401
    const resGuest = await fetch(`${serverUrl}/api/admin/me`);
    assert.equal(resGuest.status, 401);

    // 2. Đăng nhập quyền 'user' -> 403 Forbidden
    const resUser = await fetch(`${serverUrl}/api/admin/me`, {
      headers: { Authorization: `Bearer ${tokenUser1}` }
    });
    assert.equal(resUser.status, 403);
    const userForbiddenBody = await resUser.json();
    assert.equal(userForbiddenBody.code, 'FORBIDDEN');

    // 3. Đăng nhập quyền 'admin' -> 200 OK
    const resAdmin = await fetch(`${serverUrl}/api/admin/me`, {
      headers: { Authorization: `Bearer ${tokenAdmin}` }
    });
    assert.equal(resAdmin.status, 200);
    const adminBody = await resAdmin.json();
    assert.equal(adminBody.user.role, 'admin');

    // Admin lấy danh sách người dùng
    const resAdminUsers = await fetch(`${serverUrl}/api/admin/users`, {
      headers: { Authorization: `Bearer ${tokenAdmin}` }
    });
    assert.equal(resAdminUsers.status, 200);
    const usersBody = await resAdminUsers.json();
    assert.ok(Array.isArray(usersBody.users));
  });

  test('POST /api/auth/login: Đăng nhập tài khoản quản trị nội bộ (admin | admin123)', async () => {
    // 1. Sai mật khẩu -> 401
    const resFail = await fetch(`${serverUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'wrong_password' })
    });
    assert.equal(resFail.status, 401);
    const failBody = await resFail.json();
    assert.equal(failBody.success, false);

    // 2. Đúng tài khoản & mật khẩu admin -> 200 OK
    const resOk = await fetch(`${serverUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'admin123' })
    });
    assert.equal(resOk.status, 200);
    const okBody = await resOk.json();
    assert.equal(okBody.success, true);
    assert.ok(okBody.token.startsWith('anidoki_sess_'));
    assert.equal(okBody.user.role, 'admin');

    // 3. Dùng token vừa đăng nhập gọi API admin thành công
    const resAdminMe = await fetch(`${serverUrl}/api/admin/me`, {
      headers: { Authorization: `Bearer ${okBody.token}` }
    });
    assert.equal(resAdminMe.status, 200);
  });

  test('POST /api/auth/register: Người dùng thường đăng ký và đăng nhập tài khoản', async () => {
    const regUsername = 'user_reg_test_' + Date.now();
    const regEmail = `${regUsername}@test.anidoki`;
    const regPassword = 'password123';
    const regName = 'Người Dùng Đăng Ký Mới';

    // 1. Kiểm tra từ chối mật khẩu quá ngắn (< 6 ký tự)
    const resShortPwd = await fetch(`${serverUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: regName,
        email: regEmail,
        username: regUsername,
        password: '123'
      })
    });
    assert.equal(resShortPwd.status, 400);

    // 2. Đăng ký thành công tài khoản mới
    const resReg = await fetch(`${serverUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: regName,
        email: regEmail,
        username: regUsername,
        password: regPassword
      })
    });
    assert.equal(resReg.status, 201);
    const regBody = await resReg.json();
    assert.equal(regBody.success, true);
    assert.ok(regBody.token.startsWith('anidoki_sess_'));
    assert.equal(regBody.user.role, 'user');
    assert.equal(regBody.user.email, regEmail);
    assert.equal(regBody.user.name, regName);

    // 3. Kiểm tra không cho phép đăng ký trùng lặp username
    const resDuplicate = await fetch(`${serverUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: regName,
        email: `other_${regEmail}`,
        username: regUsername,
        password: regPassword
      })
    });
    assert.equal(resDuplicate.status, 409);

    // 4. Đăng nhập lại bằng tài khoản vừa đăng ký qua POST /api/auth/login (bằng username)
    const resLoginByUsername = await fetch(`${serverUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: regUsername,
        password: regPassword
      })
    });
    assert.equal(resLoginByUsername.status, 200);
    const loginUserBody = await resLoginByUsername.json();
    assert.equal(loginUserBody.success, true);
    assert.equal(loginUserBody.user.role, 'user');
    assert.equal(loginUserBody.user.id, regBody.user.id);

    // 5. Đăng nhập lại bằng email
    const resLoginByEmail = await fetch(`${serverUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: regEmail,
        password: regPassword
      })
    });
    assert.equal(resLoginByEmail.status, 200);
    const loginEmailBody = await resLoginByEmail.json();
    assert.equal(loginEmailBody.success, true);
    assert.equal(loginEmailBody.user.id, regBody.user.id);

    // 6. Gọi /api/auth/me với token mới
    const resMe = await fetch(`${serverUrl}/api/auth/me`, {
      headers: { Authorization: `Bearer ${loginEmailBody.token}` }
    });
    assert.equal(resMe.status, 200);
    const meBody = await resMe.json();
    assert.equal(meBody.user.role, 'user');
  });

  test('Watchlist: Hai tài khoản có danh sách yêu thích độc lập', async () => {
    // Chưa đăng nhập -> 401
    const resGuestWatchlist = await fetch(`${serverUrl}/api/watchlist`);
    assert.equal(resGuestWatchlist.status, 401);

    // Thêm phim cho User 1 trực tiếp vào database để test độc lập
    const anime1 = { id: 'test-anime-1', title: { english: 'Anime 1' } };
    const anime2 = { id: 'test-anime-2', title: { english: 'Anime 2' } };

    await pool.query('INSERT INTO kk_watchlist (user_id, slug, anime) VALUES ($1, $2, $3)', [
      testUserId1, 'test-anime-1', JSON.stringify(anime1)
    ]);
    await pool.query('INSERT INTO kk_watchlist (user_id, slug, anime) VALUES ($1, $2, $3)', [
      testUserId2, 'test-anime-2', JSON.stringify(anime2)
    ]);

    // User 1 chỉ thấy Anime 1
    const resListUser1 = await fetch(`${serverUrl}/api/watchlist`, {
      headers: { Authorization: `Bearer ${tokenUser1}` }
    });
    assert.equal(resListUser1.status, 200);
    const listUser1 = await resListUser1.json();
    assert.equal(listUser1.data.length, 1);
    assert.equal(listUser1.data[0].id, 'test-anime-1');

    // User 2 chỉ thấy Anime 2
    const resListUser2 = await fetch(`${serverUrl}/api/watchlist`, {
      headers: { Authorization: `Bearer ${tokenUser2}` }
    });
    assert.equal(resListUser2.status, 200);
    const listUser2 = await resListUser2.json();
    assert.equal(listUser2.data.length, 1);
    assert.equal(listUser2.data[0].id, 'test-anime-2');
  });

  test('Lịch sử xem: Hai tài khoản có lịch sử độc lập và lưu đúng tiến độ', async () => {
    // Chưa đăng nhập -> 401
    const resGuestHistory = await fetch(`${serverUrl}/api/history`);
    assert.equal(resGuestHistory.status, 401);

    // Ghi tiến độ cho User 1 (Video có tiến độ: tập 3, 450s / 1440s)
    await pool.query(`
      INSERT INTO kk_history (user_id, slug, anime, episode, progress_seconds, duration, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, NOW())
    `, [testUserId1, 'test-history-1', JSON.stringify({ id: 'test-history-1' }), 3, 450, 1440]);

    // Ghi tiến độ cho User 2 (Iframe chỉ có tập: tập 1, 0s / 0s)
    await pool.query(`
      INSERT INTO kk_history (user_id, slug, anime, episode, progress_seconds, duration, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, NOW())
    `, [testUserId2, 'test-history-2', JSON.stringify({ id: 'test-history-2' }), 1, 0, 0]);

    // Kiểm tra lịch sử User 1
    const resHist1 = await fetch(`${serverUrl}/api/history`, {
      headers: { Authorization: `Bearer ${tokenUser1}` }
    });
    assert.equal(resHist1.status, 200);
    const hist1 = await resHist1.json();
    assert.equal(hist1.data.length, 1);
    assert.equal(hist1.data[0].animeId, 'test-history-1');
    assert.equal(hist1.data[0].episodeNumber, 3);
    assert.equal(hist1.data[0].currentTime, 450);
    assert.equal(hist1.data[0].duration, 1440);

    // Kiểm tra lịch sử User 2
    const resHist2 = await fetch(`${serverUrl}/api/history`, {
      headers: { Authorization: `Bearer ${tokenUser2}` }
    });
    assert.equal(resHist2.status, 200);
    const hist2 = await resHist2.json();
    assert.equal(hist2.data.length, 1);
    assert.equal(hist2.data[0].animeId, 'test-history-2');
    assert.equal(hist2.data[0].episodeNumber, 1);
    assert.equal(hist2.data[0].currentTime, 0);

    // Xóa lịch sử của User 1 không ảnh hưởng User 2
    const resDel1 = await fetch(`${serverUrl}/api/history/test-history-1`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${tokenUser1}` }
    });
    assert.equal(resDel1.status, 200);

    const checkHist1 = await fetch(`${serverUrl}/api/history`, {
      headers: { Authorization: `Bearer ${tokenUser1}` }
    });
    assert.equal((await checkHist1.json()).data.length, 0);

    const checkHist2 = await fetch(`${serverUrl}/api/history`, {
      headers: { Authorization: `Bearer ${tokenUser2}` }
    });
    assert.equal((await checkHist2.json()).data.length, 1);
  });
});
