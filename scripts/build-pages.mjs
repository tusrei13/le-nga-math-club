import { cp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { seed } from '../database/seed.mjs';
import { build } from 'esbuild';
const root = resolve('.'), output = resolve('dist');
if (output !== resolve(root,'dist')) throw new Error('Invalid output path');
await rm(output,{recursive:true,force:true}); await mkdir(output,{recursive:true});
for (const name of ['index.html','styles.css','app.js','admin.html','admin.css','admin.js','customer.js','customer.css']) await cp(name,`${output}/${name}`);
await cp('public/assets',`${output}/assets`,{recursive:true});
// Retain old relative asset links without uploading any backend source or database.
await cp('public/assets',`${output}/public/assets`,{recursive:true});
await build({entryPoints:['cloudflare/worker.mjs'],outfile:`${output}/_worker.js`,bundle:true,platform:'neutral',format:'esm',external:['node:crypto']});
await writeFile(`${output}/404.html`,'<!doctype html><html lang="vi"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Không tìm thấy trang · CLB Toán Cô Lê Nga</title><link rel="stylesheet" href="/styles.css"><main class="container section-pad"><h1>Không tìm thấy trang.</h1><p><a class="btn btn-primary" href="/">Về trang bán sách</a></p></main></html>');
await writeFile(`${output}/_routes.json`,JSON.stringify({version:1,include:['/api/*','/admin','/admin/*','/admin.html','/healthz','/robots.txt','/sitemap.xml'],exclude:[]}));
await writeFile(`${output}/_headers`,"/*\n  X-Content-Type-Options: nosniff\n  X-Frame-Options: DENY\n  Referrer-Policy: strict-origin-when-cross-origin\n  Permissions-Policy: camera=(), microphone=(), geolocation=()\n  Content-Security-Policy: default-src 'self'; script-src 'self' https://www.gstatic.com https://apis.google.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self' https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://www.googleapis.com https://*.firebaseapp.com; frame-src https://*.firebaseapp.com https://accounts.google.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self'\n/admin*\n  Cache-Control: no-store\n");
const schema=await readFile('database/schema.sql','utf8'), adminSchema=await readFile('database/admin-schema.sql','utf8');
const customerSchema=await readFile('database/customer-schema.sql','utf8');
const db=new DatabaseSync(':memory:'); db.exec(schema+adminSchema+customerSchema); seed(db);
const literal=value=>value===null?'NULL':typeof value==='number'?String(value):`'${String(value).replaceAll("'","''")}'`;
let sql=schema+'\n'+adminSchema+'\n'+customerSchema+'\n'+await readFile('cloudflare/edge-schema.sql','utf8')+'\n';
for (const table of ['products','product_media','site_content','gifts','faqs','testimonials','achievements']) {
  for (const row of db.prepare(`SELECT * FROM ${table}`).all()) {
    // Production must not present synthetic testimonials or scores as real results.
    if (Object.hasOwn(row,'is_composite')) row.published=0;
    sql+=`INSERT OR IGNORE INTO ${table}(${Object.keys(row).join(',')}) VALUES(${Object.values(row).map(literal).join(',')});\n`;
  }
}
sql+='\n'+await readFile('database/migrations/004-catalog-corrections.sql','utf8');
sql+='\n'+await readFile('database/migrations/005-stem-maths.sql','utf8');
db.close(); await mkdir('cloudflare',{recursive:true}); await writeFile('cloudflare/init.sql',sql);
console.log('Pages build ready in dist/. D1 initialization SQL: cloudflare/init.sql');
