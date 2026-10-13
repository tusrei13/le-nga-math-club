import { readFileSync } from 'node:fs';
const source=readFileSync(new URL('../wrangler.toml',import.meta.url),'utf8');
const value=key=>source.match(new RegExp(`^${key}\\s*=\\s*"([^"]*)"`,'m'))?.[1]||'';
const missing=[];
if(!/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(value('database_id')))missing.push('Thay database_id mẫu bằng UUID thật của D1.');
if(!value('FIREBASE_API_KEY'))missing.push('Điền FIREBASE_API_KEY (apiKey của Firebase web app).');
if(!value('FIREBASE_PROJECT_ID'))missing.push('Điền FIREBASE_PROJECT_ID.');
if(!/^[a-z\d.-]+\.firebaseapp\.com$/i.test(value('FIREBASE_AUTH_DOMAIN')))missing.push('Điền FIREBASE_AUTH_DOMAIN từ Firebase web config (*.firebaseapp.com).');
if(missing.length){console.error('Chưa đủ cấu hình cho Pages + đăng nhập khách hàng:\n'+missing.map(message=>`- ${message}`).join('\n')+'\nXem CLOUDFLARE.md và FIREBASE.md.');process.exitCode=1;}
else console.log('Các giá trị cấu hình bắt buộc đã có. Hãy xác nhận D1 đã được khởi tạo, Email/Password và Google đã bật, tên miền Pages đã authorized trong Firebase.');
