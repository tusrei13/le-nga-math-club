import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { provisionPagesAdmin } from '../pages-admin-auth.mjs';
if(!process.stdin.isTTY||!process.stdout.isTTY){console.error('Chạy trong Terminal của VS Code để nhập mật khẩu riêng tư.');process.exit(1);}
const source=readFileSync(new URL('../wrangler.toml',import.meta.url),'utf8');
const value=key=>source.match(new RegExp(`^${key}\\s*=\\s*"([^"]*)"`,'m'))?.[1]||'';
const env=Object.fromEntries(['FIREBASE_API_KEY','FIREBASE_PROJECT_ID','FIREBASE_AUTH_DOMAIN'].map(key=>[key,process.env[key]||value(key)]));
let muted=false;
const output=new Writable({write(chunk,_encoding,done){if(!muted)process.stdout.write(chunk);done();}});output.isTTY=true;
const terminal=createInterface({input:process.stdin,output,terminal:true});
async function secret(prompt){const answer=terminal.question(prompt);muted=true;try{return await answer;}finally{muted=false;process.stdout.write('\n');}}
const quote=value=>`'${String(value).replaceAll("'","''")}'`;
try{
  const username=(process.argv[2]||(await terminal.question('Tên đăng nhập [admin]: '))||'admin').trim().toLowerCase();
  if(!/^[a-z0-9_.-]{3,64}$/.test(username))throw new Error('Tên đăng nhập phải có 3–64 ký tự không dấu, gồm chữ, số, dấu chấm, gạch ngang hoặc gạch dưới.');
  const email=(await terminal.question('Email Firebase của admin: ')).trim();
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254)throw new Error('Email không hợp lệ.');
  const password=await secret('Mật khẩu tự đặt (ít nhất 15 ký tự, không hiển thị): ');
  if(password.length<15||password.length>256)throw new Error('Mật khẩu cần từ 15 đến 256 ký tự. Có thể dùng một cụm từ dễ nhớ.');
  if(await secret('Nhập lại mật khẩu: ')!==password)throw new Error('Hai mật khẩu chưa khớp.');
  console.log('Đang tạo hoặc xác thực tài khoản với Firebase…');
  const reference=await provisionPagesAdmin(email,password,env);
  const sql=`INSERT INTO admin_users(id,username,password_hash) VALUES(${quote(randomUUID())},${quote(username)},${quote(reference)}) ON CONFLICT(username) DO UPDATE SET password_hash=excluded.password_hash;\nDELETE FROM admin_sessions WHERE user_id IN (SELECT id FROM admin_users WHERE username=${quote(username)});\n`;
  mkdirSync('data',{recursive:true});writeFileSync('data/pages-admin.sql',sql,{mode:0o600});
  console.log(`Đã chuẩn bị tài khoản ${username}. Mật khẩu do Firebase lưu, không ghi vào SQL.\nÁp dụng quyền admin vào D1 bằng:\nnpx wrangler d1 execute le-nga-books --remote --file=data/pages-admin.sql\nSau khi deploy bản code mới, đăng nhập /admin bằng tên ${username} và mật khẩu vừa nhập.`);
}catch(error){console.error(error.message);process.exitCode=1;}
finally{terminal.close();}
