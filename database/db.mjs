import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { seed } from './seed.mjs';
import { production } from '../runtime.mjs';

const defaultPath = fileURLToPath(new URL('../data/landing.sqlite', import.meta.url));
export const databasePath = resolve(process.env.DATABASE_PATH || defaultPath);
mkdirSync(dirname(databasePath), { recursive: true });
export const db = new DatabaseSync(databasePath);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
export function transaction(action) {
  db.exec('BEGIN IMMEDIATE');
  try { const result = action(); db.exec('COMMIT'); return result; }
  catch (error) { db.exec('ROLLBACK'); throw error; }
}
transaction(() => {
  db.exec(readFileSync(new URL('./schema.sql', import.meta.url),'utf8'));
  db.exec(readFileSync(new URL('./admin-schema.sql', import.meta.url),'utf8'));
  db.exec(readFileSync(new URL('./customer-schema.sql', import.meta.url),'utf8'));
  seed(db);
  db.exec(readFileSync(new URL('./migrations/004-catalog-corrections.sql', import.meta.url),'utf8'));
  db.exec(readFileSync(new URL('./migrations/005-stem-maths.sql', import.meta.url),'utf8'));
});
export function products(includeInactive = false) {
  return db.prepare(`SELECT * FROM products ${includeInactive ? '' : 'WHERE active = 1'} ORDER BY sort_order,id`).all().map(p => ({
    ...p, media: db.prepare('SELECT kind,url,alt FROM product_media WHERE product_id = ?').all(p.id)
  }));
}
export function landing() {
  const content = Object.fromEntries(db.prepare('SELECT key,value_json FROM site_content').all().map(r => [r.key,JSON.parse(r.value_json)]));
  return { products:products(), content,
    gifts:db.prepare('SELECT id,title,description,kind FROM gifts WHERE active=1 ORDER BY sort_order').all(),
    faqs:db.prepare('SELECT * FROM faqs WHERE active=1 ORDER BY sort_order').all(),
    testimonials:db.prepare(`SELECT * FROM testimonials WHERE published=1 ${production ? 'AND is_composite=0' : ''} ORDER BY sort_order`).all(),
    achievements:db.prepare(`SELECT * FROM achievements WHERE published=1 ${production ? 'AND is_composite=0' : ''} ORDER BY sort_order`).all() };
}
