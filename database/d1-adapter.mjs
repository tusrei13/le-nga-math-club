// Let the local SQLite server use the same STEM API as Cloudflare D1.
export function sqliteD1(db) {
  return {
    prepare(sql) { return {bind(...args) {
      const execute=()=>({meta:{changes:Number(db.prepare(sql).run(...args).changes)}});
      return {execute,first:async()=>db.prepare(sql).get(...args)||null,all:async()=>({results:db.prepare(sql).all(...args)}),run:async()=>execute()};
    }};},
    async batch(statements) {
      db.exec('BEGIN IMMEDIATE');
      try { const results=statements.map(statement=>statement.execute());db.exec('COMMIT');return results; }
      catch(error){db.exec('ROLLBACK');throw error;}
    }
  };
}
