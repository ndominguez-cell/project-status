import { readdirSync, readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

type Params = unknown[];

const plain = (rows: unknown[]) => rows.map((row) => ({ ...(row as object) }));

class TestStatement {
  constructor(
    private readonly sqlite: DatabaseSync,
    readonly sql: string,
    private readonly params: Params = [],
  ) {}

  bind(...params: Params) {
    return new TestStatement(this.sqlite, this.sql, params);
  }

  async run() {
    const result = this.sqlite.prepare(this.sql).run(...(this.params as never[]));
    return { success: true, results: [], meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) } };
  }

  async all<T = Record<string, unknown>>() {
    const rows = plain(this.sqlite.prepare(this.sql).all(...(this.params as never[]))) as T[];
    return { success: true, results: rows, meta: { changes: 0 } };
  }

  async first<T = Record<string, unknown>>() {
    const row = this.sqlite.prepare(this.sql).get(...(this.params as never[]));
    return (row ? { ...row } : null) as T | null;
  }
}

export function createTestDb() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON');
  const dir = new URL('../../drizzle/', import.meta.url);
  for (const file of readdirSync(dir).filter((name) => name.endsWith('.sql')).sort()) {
    for (const statement of readFileSync(new URL(file, dir), 'utf8').split('--> statement-breakpoint')) sqlite.exec(statement);
  }

  const db = {
    prepare: (sql: string) => new TestStatement(sqlite, sql),
    async batch(statements: TestStatement[]) {
      sqlite.exec('BEGIN');
      try {
        const results = [];
        for (const statement of statements) results.push(await statement.run());
        sqlite.exec('COMMIT');
        return results;
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    },
  };

  const query = <T = Record<string, unknown>>(sql: string, ...params: Params) => plain(sqlite.prepare(sql).all(...(params as never[]))) as T[];
  const exec = (sql: string, ...params: Params) => sqlite.prepare(sql).run(...(params as never[]));
  return { db: db as unknown as D1Database, query, exec };
}

export function seedUser(exec: ReturnType<typeof createTestDb>['exec'], id = 'user-1') {
  exec('INSERT INTO users (id, email, display_name, created_at, updated_at) VALUES (?, ?, ?, 1, 1)', id, `${id}@example.com`, id);
  return id;
}

export function seedProject(exec: ReturnType<typeof createTestDb>['exec'], ownerId: string, id: string, fullName: string | null, slug = id) {
  exec(
    `INSERT INTO projects (id, owner_id, slug, name, business_objective, category, repository_full_name, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'objective', 'Experiment', ?, 1, 1)`,
    id,
    ownerId,
    slug,
    slug,
    fullName,
  );
  return id;
}
