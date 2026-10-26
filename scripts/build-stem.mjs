import {staticSecurityHeaders,policies} from '../security.mjs';
import {cp,mkdir,writeFile,rm,readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {createRequire} from 'node:module';
const root=fileURLToPath(new URL('../',import.meta.url));
const site=resolve(root,'stem-maths'),output=resolve(site,'dist-stem');
if(output!==resolve(root,'stem-maths','dist-stem'))throw new Error('Invalid output path');
const {build}=createRequire(new URL('../stem-maths/package.json',import.meta.url))('esbuild');
await rm(output,{recursive:true,force:true});await mkdir(resolve(output,'assets'),{recursive:true});
for(const file of ['index.html','styles.css','app.js'])await cp(resolve(site,file),resolve(output,file));
for(const file of ['logo.png','teacher-le-nga.jpg'])await cp(resolve(root,'public/assets',file),resolve(output,'assets',file));
await build({entryPoints:[resolve(site,'worker.mjs')],outfile:resolve(output,'_worker.js'),bundle:true,platform:'neutral',format:'esm',external:['node:crypto']});
await writeFile(resolve(output,'_routes.json'),JSON.stringify({version:1,include:['/api/*','/healthz','/robots.txt','/sitemap.xml','/admin'],exclude:[]}));
await writeFile(resolve(output,'_headers'),staticSecurityHeaders(policies.stem));
await writeFile(resolve(output,'404.html'),'<!doctype html><html lang="vi"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Không tìm thấy trang · STEM Maths</title><link rel="stylesheet" href="/styles.css"><main class="wrap section"><h1>Không tìm thấy trang.</h1><p><a href="/">Về STEM Maths</a></p></main></html>');
// Validate that the shared D1 migration is present, without copying SQL into public output.
await readFile(resolve(root,'database/migrations/005-stem-maths.sql'),'utf8');
console.log('STEM Maths build ready: stem-maths/dist-stem/. Cloudflare Root directory: stem-maths; output: dist-stem.');
