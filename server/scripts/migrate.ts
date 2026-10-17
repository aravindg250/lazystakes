/**
 * migrate.ts — applies db/migrations/*.sql that haven't run yet, in order.
 *
 *   npm run migrate
 *
 * Each migration runs in its own transaction and is recorded in
 * ops.schema_migrations (a private schema, not exposed by Supabase's REST
 * endpoint). schema.sql itself is still run once by hand on a new project.
 */

import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { createRuntime } from "../src/runtime";

const dir = fileURLToPath(new URL("../db/migrations/", import.meta.url));
const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();

const { deps } = createRuntime();
try {
  await deps.db.query(`
    create schema if not exists ops;
    revoke all on schema ops from public;
    create table if not exists ops.schema_migrations (
      name       text primary key,
      applied_at timestamptz not null default now()
    );`);
  const { rows } = await deps.db.query<{ name: string }>(`select name from ops.schema_migrations`);
  const done = new Set(rows.map((r) => r.name));

  const pending = files.filter((f) => !done.has(f));
  if (pending.length === 0) console.log("Up to date.");
  for (const f of pending) {
    const sql = readFileSync(`${dir}/${f}`, "utf8");
    await deps.db.tx(async (q) => {
      await q.query(sql);
      await q.query(`insert into ops.schema_migrations (name) values ($1)`, [f]);
    });
    console.log(`Applied ${f}`);
  }
} finally {
  await deps.db.close();
}
