import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import { randomUUID } from 'node:crypto';
import { db, transaction } from './db.mjs';
import { hashPassword } from '../passwords.mjs';

if (!process.stdin.isTTY || !process.stdout.isTTY) {
  console.error('Chạy lệnh này trong terminal tương tác để nhập mật khẩu riêng tư.'); db.close(); process.exit(1);
}
let muted = false;
const output = new Writable({ write(chunk, encoding, callback) { if (!muted) process.stdout.write(chunk, encoding); callback(); } });
output.isTTY = true;
const readline = createInterface({ input: process.stdin, output, terminal: true });
async function secret(prompt) {
  const answer = readline.question(prompt); muted = true;
  try { return await answer; } finally { muted = false; process.stdout.write('\n'); }
}
try {
  const username = ((await readline.question('Tên đăng nhập [admin]: ')).trim() || 'admin').toLowerCase();
  if (!/^[a-z0-9_.-]{3,64}$/.test(username)) throw new Error('Tên đăng nhập: 3–64 ký tự, gồm chữ không dấu, số, dấu chấm, gạch ngang hoặc gạch dưới.');
  const exists = db.prepare('SELECT id FROM admin_users WHERE username=?').get(username);
  if (exists && process.argv[2] !== '--reset') throw new Error('Tài khoản đã tồn tại. Dùng npm run admin:reset để đặt lại mật khẩu.');
  const password = await secret('Mật khẩu (15–256 ký tự, sẽ không hiển thị): ');
  if (password.length < 15 || password.length > 256) throw new Error('Mật khẩu phải có 15–256 ký tự.');
  if (await secret('Nhập lại mật khẩu: ') !== password) throw new Error('Hai mật khẩu không khớp.');
  const encoded = await hashPassword(password);
  transaction(() => {
    if (exists) {
      db.prepare('UPDATE admin_users SET password_hash=? WHERE id=?').run(encoded, exists.id);
      db.prepare('DELETE FROM admin_sessions WHERE user_id=?').run(exists.id);
    } else db.prepare('INSERT INTO admin_users(id,username,password_hash) VALUES(?,?,?)').run(randomUUID(), username, encoded);
  });
  console.log(`Đã ${exists ? 'đặt lại mật khẩu' : 'tạo tài khoản'} ${username}. Đăng nhập tại http://localhost:3000/admin`);
} catch (error) { console.error(error.message); process.exitCode = 1; }
finally { readline.close(); db.close(); }
