import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool } from '../db/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

async function setRole() {
  const target = process.argv[2];
  const role = (process.argv[3] || 'admin').toLowerCase();

  if (!target) {
    console.error('❌ Cách dùng: node setRole.js <email-hoac-userId> [admin|user]');
    process.exit(1);
  }

  if (!['admin', 'user'].includes(role)) {
    console.error('❌ Vai trò không hợp lệ. Chỉ chấp nhận "admin" hoặc "user".');
    process.exit(1);
  }

  try {
    const isEmail = target.includes('@');
    const checkRes = await pool.query(
      isEmail ? 'SELECT * FROM users WHERE LOWER(email) = LOWER($1)' : 'SELECT * FROM users WHERE id = $1',
      [target]
    );

    if (checkRes.rows.length > 0) {
      const u = checkRes.rows[0];
      await pool.query('UPDATE users SET role = $1, updated_at = NOW() WHERE id = $2', [role, u.id]);
      console.log(`✅ Đã cập nhật vai trò của người dùng "${u.name}" (${u.email || u.id}) thành: [${role}]`);
    } else {
      if (!isEmail) {
        console.error(`❌ Không tìm thấy người dùng có id "${target}"`);
        process.exit(1);
      }
      // Tạo trước tài khoản dự phòng theo email
      const placeholderId = 'pre_' + Date.now();
      await pool.query(`
        INSERT INTO users (id, name, email, avatar, provider, role)
        VALUES ($1, $2, $3, $4, 'google', $5)
      `, [placeholderId, target.split('@')[0], target.toLowerCase(), '', role]);
      console.log(`✅ Đã cấp trước quyền [${role}] cho email "${target}". Khi tài khoản này đăng nhập Google lần đầu, quyền sẽ tự động được gán.`);
    }
  } catch (err) {
    console.error('❌ Lỗi khi thiết lập vai trò:', err.message);
  } finally {
    await pool.end();
    process.exit(0);
  }
}

setRole();
