import {createHash} from 'node:crypto';
import {SecurityError} from './security.mjs';

// The caller supplies the trusted edge IP (or a normalized account identifier).
// Expired rows are removed even when all requests fail validation or login.
export async function edgeRateLimit(db,scope,identifier,limit,now=Date.now()){
  const windowMs=900000,bucket=Math.floor(now/windowMs);
  const key=createHash('sha256').update(`${scope}:${identifier}:${bucket}`).digest('hex');
  await db.prepare('DELETE FROM edge_rate_limits WHERE expires_at<=?').bind(now).run();
  const row=await db.prepare('INSERT INTO edge_rate_limits(key,count,expires_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count').bind(key,(bucket+1)*windowMs).first();
  if(row.count>limit)throw new SecurityError(429,'Đã gửi quá nhiều yêu cầu. Vui lòng thử lại sau 15 phút.');
}
