import { PGlite, type Transaction } from '@electric-sql/pglite';
import type { Database, SqlResult } from '../../server/database';

/** Real PostgreSQL compiled to WASM, not a map pretending to implement SQL. */
export class TestDatabase implements Database {
  readonly engine: PGlite;
  constructor(dataDir?: string) {
    this.engine = new PGlite(dataDir);
  }
  async query<T>(sql: string, values?: unknown[]): Promise<SqlResult<T>> {
    return execute(this.engine, sql, values);
  }
  async transaction<T>(action: (db: Database) => Promise<T>): Promise<T> {
    return this.engine.transaction((tx) =>
      action({
        query: (sql, values) => execute(tx, sql, values),
        transaction: () => {
          throw new Error('Nested transaction');
        },
        close: async () => {},
      }),
    );
  }
  async close(): Promise<void> {
    await this.engine.close();
  }
}
async function execute<T>(
  engine: PGlite | Transaction,
  sql: string,
  values?: unknown[],
): Promise<SqlResult<T>> {
  if (!values && sql.includes('CREATE TABLE')) {
    await engine.exec(sql);
    return { rows: [] };
  }
  return engine.query<T>(sql, values);
}
