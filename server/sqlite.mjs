import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createHash } from 'node:crypto';

// Implements the small D1 interface used by the shared application on native SQLite.
export function openDatabase(filename, migrationsDirectory) {
  mkdirSync(dirname(filename), { recursive: true });
  const db = new DatabaseSync(filename);
  let closed = false;
  try {
    db.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;');
    db.exec('CREATE TABLE IF NOT EXISTS app_migrations (name TEXT PRIMARY KEY, hash TEXT NOT NULL)');
    for (const name of readdirSync(migrationsDirectory).filter(n => n.endsWith('.sql')).sort()) {
      const sql = readFileSync(join(migrationsDirectory, name), 'utf8');
      const hash = createHash('sha256').update(sql).digest('hex');
      db.exec('BEGIN IMMEDIATE');
      try {
        const applied = db.prepare('SELECT hash FROM app_migrations WHERE name=?').get(name);
        if (applied && applied.hash !== hash) throw new Error(`Applied migration changed: ${name}`);
        if (!applied) {
          db.exec(sql);
          db.prepare('INSERT INTO app_migrations(name,hash) VALUES (?,?)').run(name, hash);
        }
        db.exec('COMMIT');
      } catch (error) { db.exec('ROLLBACK'); throw error; }
    }
  } catch (error) { db.close(); throw error; }
  const prepare = (sql, args = []) => ({
    sql, args,
    bind(...values) { return prepare(sql, values); },
    async first() { return db.prepare(sql).get(...args) ?? null; },
    async all() { return { results: db.prepare(sql).all(...args), success: true }; },
    async run() { const info = db.prepare(sql).run(...args); return { success: true, meta: { changes: Number(info.changes), last_row_id: Number(info.lastInsertRowid) } }; },
  });
  return {
    prepare,
    async batch(statements) {
      db.exec('BEGIN IMMEDIATE');
      try {
        const results = statements.map(({ sql, args }) => ({ success: true, results: db.prepare(sql).all(...args) }));
        db.exec('COMMIT'); return results;
      } catch (error) { db.exec('ROLLBACK'); throw error; }
    },
    close() { if (!closed) { db.close(); closed = true; } },
  };
}
