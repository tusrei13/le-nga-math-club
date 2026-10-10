import { db, databasePath } from './db.mjs';
console.log(`Database: ${databasePath}`);
console.log(`Products: ${db.prepare('SELECT COUNT(*) AS count FROM products').get().count}`);
db.close();
