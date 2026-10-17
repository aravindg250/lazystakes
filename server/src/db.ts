/**
 * db.ts — the smallest database interface the jobs and API need.
 *
 * Production uses node-postgres against Supabase. Tests use PGlite (real
 * Postgres compiled to WASM, in-process) running the same schema.sql, so
 * every query here is exercised against genuine Postgres semantics —
 * row locks, partial unique indexes, triggers — without a server.
 */

import pg from "pg";

export type Row = Record<string, unknown>;

export interface Queryable {
  query<T extends Row = Row>(text: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

export interface Db extends Queryable {
  /** Runs fn inside BEGIN … COMMIT, rolling back if it throws. */
  tx<T>(fn: (q: Queryable) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

// `date` columns are calendar dates in the commitment's timezone. Letting
// the driver turn them into JS Dates (midnight in the *server's* zone) is
// the classic off-by-one-day bug, so they stay as "YYYY-MM-DD" strings.
const DATE_OID = 1082;
pg.types.setTypeParser(DATE_OID, (v) => v);

export function createPgDb(connectionString: string): Db {
  const isLocal = /@(localhost|127\.0\.0\.1)[:/]/.test(connectionString);
  const pool = new pg.Pool({
    connectionString,
    max: 5,
    // Supabase requires TLS. Its pooler certificate isn't in Node's default
    // trust store, so verification is relaxed; the connection is still
    // encrypted. Swap in Supabase's CA certificate to verify it fully.
    ssl: isLocal ? undefined : { rejectUnauthorized: false },
  });

  return {
    query: async <T extends Row>(text: string, params?: unknown[]) => {
      const r = await pool.query(text, params);
      return { rows: r.rows as T[] };
    },
    tx: async (fn) => {
      const client = await pool.connect();
      try {
        await client.query("begin");
        const q: Queryable = {
          query: async <T extends Row>(text: string, params?: unknown[]) => {
            const r = await client.query(text, params);
            return { rows: r.rows as T[] };
          },
        };
        const out = await fn(q);
        await client.query("commit");
        return out;
      } catch (err) {
        await client.query("rollback").catch(() => {});
        throw err;
      } finally {
        client.release();
      }
    },
    close: () => pool.end(),
  };
}
