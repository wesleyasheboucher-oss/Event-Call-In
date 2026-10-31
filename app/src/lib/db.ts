import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import fs from "node:fs";
import path from "node:path";
import { seed, type Exec } from "./seed";

/**
 * Postgres access.
 *
 * - DATABASE_URL set (Supabase in production): connects with the `postgres` driver.
 * - Not set (local dev): runs an embedded Postgres (PGlite) persisted to ./data/pglite,
 *   creating the schema and demo data on first use.
 *
 * Queries use `?` placeholders; they're rewritten to $1, $2… here.
 */

type Row = Record<string, unknown>;
type Param = string | number | null | undefined;
type Driver = { exec: Exec; begin<T>(fn: (exec: Exec) => Promise<T>): Promise<T> };

const MIGRATIONS = path.join(process.cwd(), "supabase", "migrations");

async function connectPostgres(url: string): Promise<Driver> {
  const { default: postgres } = await import("postgres");
  const sql = postgres(url, {
    // Supabase's transaction pooler (port 6543) doesn't support prepared statements.
    prepare: false,
    max: Number(process.env.DATABASE_POOL_MAX ?? 5),
    idle_timeout: 20,
    // Serverless functions freeze between requests; a socket that died meanwhile should
    // fail fast and be replaced, not leave a phone waiting on a page that never opens.
    connect_timeout: 8,
    max_lifetime: 60 * 5,
    // COUNT/SUM come back as int8/numeric; the app expects plain numbers.
    types: { numberish: { to: 20, from: [20, 1700], serialize: String, parse: Number } },
  });
  const execFor =
    (s: typeof sql): Exec =>
    async (text, params) => {
      const res = await s.unsafe(text, params as never[]);
      return { rows: res as unknown as Row[], count: res.count ?? res.length };
    };
  return {
    exec: execFor(sql),
    begin: (fn) => sql.begin((tsql) => fn(execFor(tsql as unknown as typeof sql))) as never,
  };
}

async function connectPglite(): Promise<Driver> {
  const { PGlite } = await import("@electric-sql/pglite");
  const dir = path.join(process.cwd(), "data", "pglite");
  fs.mkdirSync(dir, { recursive: true });
  const pg = await PGlite.create(dir, { parsers: { 20: Number, 1700: Number } });
  type Q = Pick<typeof pg, "query">;
  const execFor =
    (q: Q): Exec =>
    async (text, params) => {
      const res = await q.query<Row>(text, params as unknown[]);
      return { rows: res.rows, count: res.affectedRows ?? res.rows.length };
    };
  const driver: Driver = { exec: execFor(pg), begin: (fn) => pg.transaction((t) => fn(execFor(t))) };

  // Migrations are idempotent, so they're simply re-applied in order on start.
  for (const file of fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort()) {
    await pg.exec(fs.readFileSync(path.join(MIGRATIONS, file), "utf8"));
  }
  const { rows } = await driver.exec("SELECT COUNT(*) AS n FROM users", []);
  if (Number(rows[0].n) === 0) await driver.begin((e) => seed(e));
  return driver;
}

type Globals = { __driver?: Promise<Driver> };
const g = globalThis as Globals;

function driver(): Promise<Driver> {
  if (!g.__driver) {
    const url = process.env.DATABASE_URL;
    const p = url ? connectPostgres(url) : connectPglite();
    p.catch(() => (g.__driver = undefined));
    g.__driver = p;
  }
  return g.__driver;
}

// Inside tx(), every query runs on the transaction's connection.
const txExec = new AsyncLocalStorage<Exec>();

/** Rewrites `?` placeholders to $1, $2, … */
export function toPg(sql: string): string {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

async function exec(sql: string, params: Param[] = []) {
  const run = txExec.getStore() ?? (await driver()).exec;
  return run(toPg(sql), params.map((p) => (p === undefined ? null : p)));
}

export async function all<T>(sql: string, params?: Param[]): Promise<T[]> {
  const { rows } = await exec(sql, params);
  return rows.map((r) => ({ ...r }) as T);
}

export async function get<T>(sql: string, params?: Param[]): Promise<T | undefined> {
  const { rows } = await exec(sql, params);
  return rows[0] ? ({ ...rows[0] } as T) : undefined;
}

/** Runs a statement; `changes` is the number of affected rows. */
export async function run(sql: string, params?: Param[]): Promise<{ changes: number }> {
  const { count } = await exec(sql, params);
  return { changes: count };
}

/** INSERT … and return the new row's id. */
export async function insert(sql: string, params?: Param[]): Promise<number> {
  const { rows } = await exec(`${sql} RETURNING id`, params);
  return Number(rows[0].id);
}

export async function tx<T>(fn: () => Promise<T>): Promise<T> {
  if (txExec.getStore()) return fn(); // already inside a transaction
  return (await driver()).begin((e) => txExec.run(e, fn));
}

export function now(): string {
  return new Date().toISOString();
}
