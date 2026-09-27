import type { D1Database, D1PreparedStatement, D1Result } from '../d1';

/** A D1 stand-in on node:sqlite, close enough for storage tests. */
export async function sqliteD1(): Promise<D1Database> {
  // Vite strips the node: prefix on import, and 'sqlite' alone isn't a builtin.
  const { DatabaseSync } = (process as unknown as { getBuiltinModule(id: string): typeof import('node:sqlite') }).getBuiltinModule('node:sqlite');
  const db = new DatabaseSync(':memory:');
  const statement = (sql: string, values: unknown[] = []): D1PreparedStatement => ({
    bind: (...v: unknown[]) => statement(sql, v),
    first: async <T>() => (db.prepare(sql).get(...(values as never[])) as T | undefined) ?? null,
    all: async <T>() => ({ results: db.prepare(sql).all(...(values as never[])) as T[] }),
    run: async (): Promise<D1Result> => ({ meta: { changes: Number(db.prepare(sql).run(...(values as never[])).changes) } }),
  });
  return {
    prepare: (sql) => statement(sql),
    batch: async (stmts) => Promise.all(stmts.map((s) => s.run())),
  };
}
