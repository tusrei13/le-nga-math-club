import {bookVideos} from '../book-video-data.js';
import {staticSecurityHeaders,policies} from '../security.mjs';
import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { seed } from '../database/seed.mjs';
import { bookPreviews } from '../database/book-previews.mjs';
import {digitalPreviews} from '../digital-catalog.mjs';
import { build } from 'esbuild';
const root = resolve('.'), output = resolve('dist');
if (output !== resolve(root,'dist')) throw new Error('Invalid output path');
// Fail before publishing if a book's reading sample is absent or not a PDF.
for (const preview of bookPreviews) {
  const pdf = await readFile(resolve(root,'public/assets/books preview',preview.file));
  if (pdf.subarray(0,5).toString('ascii') !== '%PDF-') throw new Error('Invalid reading sample: '+preview.file);
}
for(const product of digitalPreviews)for(const file of product.files){
  if(!/^\/assets\/documents\/previews\/lop-[3-9]\/[A-Za-z0-9_./-]+\.pdf$/.test(file.url)||file.url.split('/').includes('..'))throw new Error('Invalid preview path');
  const pdf=await readFile(resolve(root,'public'+file.url));
  if(pdf.subarray(0,5).toString('ascii')!=='%PDF-'||pdf.length>25*1024*1024)throw new Error('Invalid or oversized public preview: '+file.url);
}
for(const config of Object.values(bookVideos)){
  if(!/^\/assets\/videos\/sieu-nhan\/[a-z0-9-]+\.mp4$/.test(config.src))throw new Error('Invalid video URL');
  const video=await readFile(resolve(root,'public'+config.src));
  if(video.length>25*1024*1024||video.subarray(4,8).toString('ascii')!=='ftyp')throw new Error('Video is invalid or exceeds Pages limit: '+config.src);
  const poster=await readFile(resolve(root,'public'+config.poster));
  if(poster[0]!==255||poster[1]!==216)throw new Error('Missing or invalid video poster: '+config.poster);
}
await rm(output,{recursive:true,force:true}); await mkdir(output,{recursive:true});
const logoVersion = createHash('sha256').update(await readFile('public/assets/logo.png')).digest('hex').slice(0,12);
for (const name of ['index.html','styles.css','app.js','admin.html','admin.css','admin.js','customer.js','customer.css','digital.js','digital.css','admin-digital.js','admin-digital.css','book-videos.js','book-video-data.js','book-videos.css']) {
  const destination = resolve(output,name);
  if (name.endsWith('.html') || name === 'customer.js') {
    const text = await readFile(name,'utf8');
    await writeFile(destination,text.replace(/\/assets\/logo\.png(?:\?v=[a-f0-9]+)?/g,'/assets/logo.png?v='+logoVersion));
  } else await cp(name,destination);
}
await cp('public/assets',`${output}/assets`,{recursive:true});
// Retain old relative asset links without uploading any backend source or database.
await cp('public/assets',`${output}/public/assets`,{recursive:true});
await build({entryPoints:['cloudflare/worker.mjs'],outfile:`${output}/_worker.js`,bundle:true,platform:'neutral',format:'esm',external:['node:crypto']});
await writeFile(`${output}/404.html`,'<!doctype html><html lang="vi"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Không tìm thấy trang · CLB Toán Cô Lê Nga</title><link rel="stylesheet" href="/styles.css"><main class="container section-pad"><h1>Không tìm thấy trang.</h1><p><a class="btn btn-primary" href="/">Về trang bán sách</a></p></main></html>');
await writeFile(`${output}/_routes.json`,JSON.stringify({version:1,include:['/api/*','/admin','/admin/*','/admin.html','/healthz','/robots.txt','/sitemap.xml'],exclude:[]}));
await writeFile(`${output}/_headers`,staticSecurityHeaders(policies.books)+'/admin*\n  Cache-Control: no-store\n');
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
sql+='\n'+await readFile('database/migrations/006-retire-geometry-book.sql','utf8');
sql+='\n'+await readFile('database/migrations/007-book-previews.sql','utf8');
sql+='\n'+await readFile('database/migrations/008-digital-documents.sql','utf8');
sql+='\n'+await readFile('database/migrations/009-primary-maths-books.sql','utf8');
db.close(); await mkdir('cloudflare',{recursive:true}); await writeFile('cloudflare/init.sql',sql);
console.log('Pages build ready in dist/. D1 initialization SQL: cloudflare/init.sql');
