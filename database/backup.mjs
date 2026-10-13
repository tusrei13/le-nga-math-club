import { DatabaseSync, backup } from 'node:sqlite';
import { mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
const source = resolve(process.env.DATABASE_PATH || 'data/landing.sqlite');
const destination = resolve(process.argv[2] || `data/backups/landing-${new Date().toISOString().replaceAll(':','-')}.sqlite`);
if (!existsSync(source)) throw new Error('Database does not exist. Initialize it first.');
if (destination === source || existsSync(destination)) throw new Error('Use a new backup file; existing files will not be overwritten.');
mkdirSync(dirname(destination), { recursive: true });
const db = new DatabaseSync(source, { readOnly: true });
try { await backup(db, destination); console.log(`Backup saved: ${destination}`); }
finally { db.close(); }
