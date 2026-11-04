// Retained test entry point: only run against an isolated temporary database.
import {tmpdir} from 'node:os';
import {resolve,sep} from 'node:path';
const database=process.env.DATABASE_PATH;
if(!database||!resolve(database).startsWith(resolve(tmpdir())+sep)||!database.includes('le-nga-ui-'))throw new Error('A temporary UI database is required');
await import('../server.mjs');
