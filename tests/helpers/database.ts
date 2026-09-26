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
/**
 * node-postgres sends a query with no parameters over the simple protocol,
 * which runs a script of several statements; with parameters it prepares one.
 * PGlite's query() always prepares, so a parameterless script has to go
 * through exec() to behave the way production does. Deciding that by looking
 * for CREATE TABLE worked until the first migration made only of ALTERs, which
 * production ran and this refused.
 */
function isScript(sql: string): boolean {
  return sql.split(';').filter((statement) => statement.trim()).length > 1;
}

async function execute<T>(
  engine: PGlite | Transaction,
  sql: string,
  values?: unknown[],
): Promise<SqlResult<T>> {
  if (!values && isScript(sql)) {
    const results = await engine.exec(sql);
    // Like the simple protocol, a script answers with its last statement.
    return { rows: (results.at(-1)?.rows ?? []) as T[] };
  }
  return engine.query<T>(sql, values);
}
