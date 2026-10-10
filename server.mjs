import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { handleApi } from './api.mjs';

const root = fileURLToPath(new URL('.', import.meta.url));
const port = Number(process.env.PORT || 3000);
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.pdf': 'application/pdf' };

const server = createServer(async (request, response) => {
  response.setHeader('X-Content-Type-Options', 'nosniff');
  try {
    const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
    if (url.pathname.startsWith('/api/')) return await handleApi(request, response, url);
    if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405); response.end(); return; }
    const pathname = decodeURIComponent(url.pathname);
    const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
    const adminFiles = { admin:'admin.html', 'admin/':'admin.html', 'admin.html':'admin.html', 'admin.js':'admin.js', 'admin.css':'admin.css' };
    const publicRoot = resolve(root, 'public');
    let file;
    if (Object.hasOwn(adminFiles,relative)) {
      file = join(root,adminFiles[relative]);
      response.setHeader('Cache-Control','no-store');
      response.setHeader('X-Frame-Options','DENY');
      response.setHeader('Referrer-Policy','same-origin');
      response.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    }
    else if (['index.html', 'styles.css', 'app.js'].includes(relative)) file = join(root, relative);
    else if (relative === 'manus-routes.json' || relative.startsWith('assets/')) file = resolve(publicRoot, relative);
    else if (relative.startsWith('public/assets/')) file = resolve(publicRoot, relative.slice(7));
    if (!file || (!Object.hasOwn(adminFiles,relative) && !['index.html', 'styles.css', 'app.js'].includes(relative) && !file.startsWith(publicRoot + sep))) {
      response.writeHead(404); response.end('Not found'); return;
    }
    const data = await readFile(file);
    response.writeHead(200, { 'Content-Type': mime[extname(file)] || 'application/octet-stream', 'Cache-Control': Object.hasOwn(adminFiles,relative)?'no-store':'no-cache' });
    response.end(request.method === 'HEAD' ? undefined : data);
  } catch {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Not found');
  }
});

server.listen(port, '0.0.0.0', () => console.log(`CLB Toán Cô Lê Nga listening on 0.0.0.0:${server.address().port}`));
