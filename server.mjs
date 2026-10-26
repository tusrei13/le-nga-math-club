import {securityHeaders,policies} from './security.mjs';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { handleApi } from './api.mjs';
import { db } from './database/db.mjs';
import { publicOrigin } from './runtime.mjs';

const root = fileURLToPath(new URL('.', import.meta.url));
const port = Number(process.env.PORT || 3000);
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.pdf': 'application/pdf' };

const server = createServer(async (request, response) => {
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('X-Frame-Options', 'DENY');
  response.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  try {
    const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
    const policy=url.pathname.startsWith('/api/')||url.pathname==='/healthz'?policies.api:url.pathname.startsWith('/stem')?policies.stem:url.pathname.startsWith('/admin')?policies.admin:policies.books;
    for(const [name,value] of Object.entries(securityHeaders({https:publicOrigin.startsWith('https:'),policy,sensitive:url.pathname.startsWith('/api/')||url.pathname.startsWith('/admin')||url.pathname==='/healthz'})))response.setHeader(name,value);
    if (url.pathname === '/healthz' && ['GET','HEAD'].includes(request.method)) {
      db.prepare('SELECT 1').get();
      response.writeHead(200, {'Content-Type':'application/json', 'Cache-Control':'no-store'});
      response.end(request.method === 'HEAD' ? undefined : '{"status":"ok"}'); return;
    }
    if (url.pathname === '/robots.txt') {
      response.writeHead(200, {'Content-Type':'text/plain; charset=utf-8'});
      response.end(`User-agent: *\nDisallow: /admin\nDisallow: /api/\n${publicOrigin ? `Sitemap: ${publicOrigin}/sitemap.xml\n` : ''}`); return;
    }
    if (url.pathname === '/sitemap.xml' && publicOrigin) {
      response.writeHead(200, {'Content-Type':'application/xml; charset=utf-8'});
      response.end(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${publicOrigin.replaceAll('&','&amp;').replaceAll('<','&lt;')}</loc></url></urlset>`); return;
    }
    if (url.pathname.startsWith('/api/')) return await handleApi(request, response, url);
    if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405); response.end(); return; }
    const pathname = decodeURIComponent(url.pathname);
    if(pathname==='/stem'){response.writeHead(302,{Location:'/stem/'});response.end();return;}
    const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
    const adminFiles = { admin:'admin.html', 'admin/':'admin.html', 'admin.html':'admin.html', 'admin.js':'admin.js', 'admin.css':'admin.css' };
    const stemFiles={'stem/':'index.html','stem/index.html':'index.html','stem/styles.css':'styles.css','stem/app.js':'app.js'};
    const publicRoot = resolve(root, 'public');
    let file;
    if(Object.hasOwn(stemFiles,relative)){
      file=join(root,'stem-maths',stemFiles[relative]);
      response.setHeader('Content-Security-Policy',policies.stem);
    }
    else if (Object.hasOwn(adminFiles,relative)) {
      file = join(root,adminFiles[relative]);
      response.setHeader('Cache-Control','no-store');
      response.setHeader('X-Frame-Options','DENY');
      response.setHeader('Referrer-Policy','same-origin');
      response.setHeader('Content-Security-Policy',policies.admin);
    }
    else if (['index.html', 'styles.css', 'app.js', 'customer.js', 'customer.css'].includes(relative)) {
      file = join(root, relative);
      response.setHeader('Content-Security-Policy', policies.books);
    }
    else if (relative === 'manus-routes.json' || relative.startsWith('assets/')) file = resolve(publicRoot, relative);
    else if (relative.startsWith('public/assets/')) file = resolve(publicRoot, relative.slice(7));
    if (!file || (!Object.hasOwn(stemFiles,relative) && !Object.hasOwn(adminFiles,relative) && !['index.html', 'styles.css', 'app.js', 'customer.js', 'customer.css'].includes(relative) && !file.startsWith(publicRoot + sep))) {
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
server.requestTimeout = 30000;
server.headersTimeout = 15000;
let stopping = false;
for (const signal of ['SIGINT','SIGTERM']) process.on(signal, () => {
  if (stopping) return; stopping = true;
  const force = setTimeout(() => process.exit(1), 10000); force.unref();
  server.close(() => { clearTimeout(force); db.close(); process.exit(0); });
  server.closeIdleConnections();
});
