/**
 * One-time (and safe to re-run) setup for a Supabase project.
 *
 *   npm run db:setup                         # schema + storage bucket
 *   npm run db:setup -- --seed               # …plus demo data (empty database only)
 *   npm run db:setup -- --admin=you@org.com --name="Your Name" --password="…" [--title="Director" --division=1 --phone="813-555-1234"]
 *                                            # …plus your first real admin account
 *
 * Reads DATABASE_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY from the
 * environment or .env.production.local (kept out of `npm run dev`, which
 * should use the local demo database, never live data).
 */
import fs from "node:fs";
import path from "node:path";
import postgres from "postgres";
import { createClient } from "@supabase/supabase-js";
import { seed, type Exec } from "../src/lib/seed";
import { hashPassword } from "../src/lib/password";

for (const file of [".env.production.local", ".env.local"]) {
  try {
    process.loadEnvFile(file);
    break;
  } catch {}
}

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, ...v] = a.replace(/^--/, "").split("=");
    return [k, v.length ? v.join("=") : true];
  }),
) as Record<string, string | true>;

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set. Add it to .env.production.local (see .env.example).");
  process.exit(1);
}

const sql = postgres(url, { prepare: false, max: 1, onnotice: () => {} });

const execFor =
  (s: typeof sql): Exec =>
  async (text, params) => {
    const res = await s.unsafe(text, params as never[]);
    return { rows: res as unknown as Record<string, unknown>[], count: res.count };
  };

async function main() {
  const migrations = path.join(process.cwd(), "supabase", "migrations");
  for (const file of fs.readdirSync(migrations).filter((f) => f.endsWith(".sql")).sort()) {
    await sql.unsafe(fs.readFileSync(path.join(migrations, file), "utf8"));
    console.log(`✓ Applied ${file}`);
  }

  const [{ n }] = await sql<{ n: number }[]>`SELECT COUNT(*)::int AS n FROM users`;

  if (args.seed) {
    if (n > 0) console.log("• Skipped demo data: the database already has users.");
    else {
      console.log("… Seeding demo data (a minute or so over the network)");
      await sql.begin((tx) => seed(execFor(tx as unknown as typeof sql)));
      console.log("✓ Seeded demo data. Sign in as admin@example.com / password, then change it.");
    }
  }

  if (typeof args.admin === "string") {
    const password = typeof args.password === "string" ? args.password : "";
    if (password.length < 8) throw new Error("--password must be at least 8 characters.");
    const name = typeof args.name === "string" ? args.name : args.admin;
    const title = typeof args.title === "string" ? args.title : "Administrator";
    const division = typeof args.division === "string" ? Number(args.division) : null;
    if (division !== null && !(division >= 1 && division <= 7)) throw new Error("--division must be 1–7.");
    let phone = typeof args.phone === "string" ? args.phone.replace(/\D/g, "") : "";
    if (phone.length === 11 && phone.startsWith("1")) phone = phone.slice(1);
    await sql`
      INSERT INTO users (name, email, password_hash, role, title, division, phone)
      VALUES (${name}, ${args.admin.toLowerCase()}, ${hashPassword(password)}, 'admin', ${title}, ${division}, ${phone})
      ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, role = 'admin', active = 1,
        title = EXCLUDED.title, division = COALESCE(EXCLUDED.division, users.division),
        phone = CASE WHEN EXCLUDED.phone <> '' THEN EXCLUDED.phone ELSE users.phone END`;
    console.log(`✓ Admin account ready: ${args.admin}`);
  }

  const sbUrl = process.env.SUPABASE_URL;
  const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const bucket = process.env.SUPABASE_STORAGE_BUCKET || "uploads";
  if (sbUrl && sbKey) {
    const sb = createClient(sbUrl, sbKey, { auth: { persistSession: false } });
    const options = {
      public: false,
      fileSizeLimit: "25MB",
      allowedMimeTypes: ["image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf"],
    };
    const { error } = await sb.storage.createBucket(bucket, options);
    if (error && !/already exists/i.test(error.message)) throw error;
    if (error) await sb.storage.updateBucket(bucket, options);
    console.log(`✓ Private storage bucket "${bucket}" ready`);
  } else {
    console.log("• Skipped storage bucket: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set.");
  }
}

main()
  .catch((err) => {
    console.error("✗", err.message ?? err);
    process.exitCode = 1;
  })
  .finally(() => sql.end());
