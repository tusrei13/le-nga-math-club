import { isIP } from 'node:net';

export const production = process.env.NODE_ENV === 'production';
export const publicOrigin = process.env.PUBLIC_ORIGIN || '';
if (publicOrigin) {
  const url = new URL(publicOrigin);
  if (url.origin !== publicOrigin || (production && url.protocol !== 'https:'))
    throw new Error('PUBLIC_ORIGIN must be an origin without a trailing slash; production requires HTTPS.');
}
if (production && !publicOrigin) throw new Error('Set PUBLIC_ORIGIN to the HTTPS origin before starting production.');
if (process.env.ADMIN_API_TOKEN && process.env.ADMIN_API_TOKEN.length < 32)
  throw new Error('ADMIN_API_TOKEN must contain at least 32 characters, or be unset.');

// Enable only when one trusted reverse proxy is the sole entry point to Node.
export function clientAddress(request) {
  if (process.env.TRUST_PROXY === '1') {
    const address = String(request.headers['x-forwarded-for'] || '').split(',').at(-1).trim();
    if (isIP(address)) return address;
  }
  return request.socket.remoteAddress || 'unknown';
}

export function createRateLimiter({ limit = 30, windowMs = 15 * 60 * 1000 } = {}) {
  const entries = new Map();
  return (address, now = Date.now()) => {
    for (const [key, value] of entries) if (value.until <= now) entries.delete(key);
    let entry = entries.get(address);
    if (!entry) {
      if (entries.size >= 10000) return Math.ceil(windowMs / 1000);
      entry = { count: 0, until: now + windowMs }; entries.set(address, entry);
    }
    if (entry.count >= limit) return Math.ceil((entry.until - now) / 1000);
    entry.count++; return 0;
  };
}
