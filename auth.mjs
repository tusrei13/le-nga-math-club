import {isJsonType} from './security.mjs';
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { db } from './database/db.mjs';
import { verifyPassword } from './passwords.mjs';
import { publicOrigin, clientAddress, createRateLimiter } from './runtime.mjs';

export class AuthError extends Error { constructor(status, message) { super(message); this.status = status; } }
const cookieName = 'clb_admin_session';
const lifetime = 8 * 60 * 60 * 1000;
const idleTime = 30 * 60 * 1000;
const failures = new Map();
const accountAttempts = createRateLimiter({limit:30});
let activeLogins = 0;
const dummyHash = `scrypt:${'0'.repeat(32)}:${'0'.repeat(128)}`;
const digest = token => createHash('sha256').update(token).digest('hex');
function equal(left, right) {
  const a = Buffer.from(left || ''), b = Buffer.from(right || '');
  return a.length === b.length && timingSafeEqual(a, b);
}
function cookie(request) {
  return (request.headers.cookie || '').split(';').map(s => s.trim()).find(s => s.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);
}
function setCookie(response, value, age) {
  const secure = process.env.ADMIN_COOKIE_SECURE === 'true' || process.env.NODE_ENV === 'production';
  response.setHeader('Set-Cookie', `${cookieName}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${age}${secure ? '; Secure' : ''}`);
}
export function sameOrigin(request) {
  const origin = request.headers.origin;
  const allowed = publicOrigin ? [publicOrigin] : [`http://${request.headers.host}`, `https://${request.headers.host}`];
  if (request.headers['sec-fetch-site'] === 'cross-site' || (origin && !allowed.includes(origin)))
    throw new AuthError(403, 'Nguồn yêu cầu không hợp lệ.');
}
export function session(request) {
  const value = cookie(request);
  if (!value || !/^[a-f0-9]{64}$/.test(value)) return undefined;
  const row = db.prepare('SELECT s.*,u.username FROM admin_sessions s JOIN admin_users u ON u.id=s.user_id WHERE s.token_hash=?').get(digest(value));
  if (!row) return undefined;
  const now = Date.now();
  if (row.expires_at <= now || row.last_seen_at <= now - idleTime) {
    db.prepare('DELETE FROM admin_sessions WHERE token_hash=?').run(row.token_hash); return undefined;
  }
  db.prepare('UPDATE admin_sessions SET last_seen_at=? WHERE token_hash=?').run(now, row.token_hash);
  return row;
}
export function authorizeAdmin(request) {
  const token = process.env.ADMIN_API_TOKEN;
  if (token?.length >= 32 && equal(request.headers.authorization, `Bearer ${token}`)) return { type: 'bearer' };
  const current = session(request);
  if (!current) throw new AuthError(401, 'Vui lòng đăng nhập để tiếp tục.');
  if (!['GET','HEAD'].includes(request.method)) {
    sameOrigin(request);
    if (!equal(request.headers['x-csrf-token'], current.csrf_token)) throw new AuthError(403, 'Phiên xác nhận không hợp lệ. Vui lòng tải lại trang.');
  }
  return current;
}
export async function handleAuth(request, response, pathname, readBody, sendJson) {
  if (pathname === '/api/auth/session' && request.method === 'GET') {
    const current = session(request);
    return sendJson(response, 200, current
      ? { authenticated: true, username: current.username, csrf_token: current.csrf_token, expires_at: current.expires_at }
      : { authenticated: false, setup_required: !db.prepare('SELECT 1 FROM admin_users LIMIT 1').get() });
  }
  if (pathname === '/api/auth/login' && request.method === 'POST') {
    sameOrigin(request);
    if (!isJsonType(request.headers['content-type'])) throw new AuthError(415, 'Yêu cầu JSON không hợp lệ.');
    const input = await readBody(request);
    if (typeof input.username !== 'string' || input.username.length > 64 || typeof input.password !== 'string' || !input.password.length || input.password.length > 256)
      throw new AuthError(400, 'Vui lòng nhập tên đăng nhập và mật khẩu hợp lệ.');
    const now = Date.now(), ip = clientAddress(request);
    for (const [address, entry] of failures) if (entry.until <= now) failures.delete(address);
    const attempts = failures.get(ip);
    if (attempts?.count >= 5 || activeLogins >= 2 || (!attempts && failures.size >= 10000)) throw new AuthError(429, 'Đã thử đăng nhập quá nhiều lần. Vui lòng thử lại sau 15 phút.');
    const retry=accountAttempts(input.username.trim().toLowerCase());
    if(retry){response.setHeader('Retry-After',String(retry));throw new AuthError(429,'Đã thử đăng nhập quá nhiều lần. Vui lòng thử lại sau 15 phút.');}
    const user = db.prepare('SELECT * FROM admin_users WHERE username=? COLLATE NOCASE').get(input.username.trim());
    activeLogins++;
    let valid;
    try { valid = await verifyPassword(input.password, user?.password_hash || dummyHash); }
    finally { activeLogins--; }
    if (!valid || !user) {
      const latest = failures.get(ip);
      failures.set(ip, { count: (latest?.count || 0) + 1, until: latest?.until || now + 15 * 60 * 1000 });
      throw new AuthError(401, 'Tên đăng nhập hoặc mật khẩu không đúng.');
    }
    failures.delete(ip);
    const token = randomBytes(32).toString('hex'), csrf = randomBytes(32).toString('hex');
    const oldToken = cookie(request);
    if (oldToken) db.prepare('DELETE FROM admin_sessions WHERE token_hash=?').run(digest(oldToken));
    db.prepare('DELETE FROM admin_sessions WHERE expires_at<=? OR last_seen_at<=?').run(now, now-idleTime);
    db.prepare('INSERT INTO admin_sessions(token_hash,user_id,csrf_token,expires_at,last_seen_at) VALUES(?,?,?,?,?)').run(digest(token), user.id, csrf, now + lifetime, now);
    setCookie(response, token, lifetime / 1000);
    return sendJson(response, 200, { authenticated: true, username: user.username, csrf_token: csrf, expires_at: now + lifetime });
  }
  if (pathname === '/api/auth/logout' && request.method === 'POST') {
    const current = authorizeAdmin(request);
    if (current.token_hash) db.prepare('DELETE FROM admin_sessions WHERE token_hash=?').run(current.token_hash);
    setCookie(response, '', 0);
    return sendJson(response, 200, { authenticated: false });
  }
  throw new AuthError(404, 'API không tồn tại.');
}
