import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const port = Number(process.env.PORT || 3000);
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.pdf': 'application/pdf' };

const server = createServer(async (request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, `http://${request.headers.host || 'localhost'}`).pathname);
  const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const publicRelative = relative === 'manus-routes.json' || relative.startsWith('assets/') ? join('public', relative) : relative;
  const file = normalize(join(root, publicRelative));
  if (!file.startsWith(root)) {
    response.writeHead(403); response.end('Forbidden'); return;
  }
  try {
    const data = await readFile(file);
    response.writeHead(200, { 'Content-Type': mime[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    response.end(data);
  } catch {
    if (!extname(pathname)) {
      try {
        const data = await readFile(join(root, 'index.html'));
        response.writeHead(200, { 'Content-Type': mime['.html'], 'Cache-Control': 'no-cache' });
        response.end(data);
        return;
      } catch {}
    }
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Not found');
  }
});

server.listen(port, '0.0.0.0', () => console.log(`CLB Toán Cô Lê Nga listening on 0.0.0.0:${port}`));
