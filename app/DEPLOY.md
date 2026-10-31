# Deploying to Supabase + Netlify

- **Supabase** holds the Postgres database and a private Storage bucket for uploads.
- **Netlify** builds and runs the Next.js app.
- Sign-in stays the app's own email/password login. Supabase Auth isn't used.

Plan on about 20 minutes the first time.

---

## 1. Create the Supabase project

1. Go to [supabase.com](https://supabase.com) → **New project**.
   - **Region:** pick the one closest to your Netlify functions. Netlify defaults to **US East (N. Virginia)**, so choose `us-east-1` unless you change Netlify's function region.
   - **Database password:** generate one and save it in your password manager.
2. When the project is ready, collect three values:

| Value | Where to find it |
|---|---|
| `DATABASE_URL` | **Connect** (top bar) → **Transaction pooler** → copy the URI (port **6543**) and replace `[YOUR-PASSWORD]` with the database password. |
| `SUPABASE_URL` | **Project Settings → API → Project URL** |
| `SUPABASE_SERVICE_ROLE_KEY` | **Project Settings → API → `service_role` secret** (not the `anon` key) |

> The service role key bypasses all security rules. Keep it server-side only: put it in Netlify's environment variables and never use it in a `NEXT_PUBLIC_` variable.

## 2. Set up the database and storage (run once, from your computer)

```bash
cd app
cp .env.example .env.local      # paste the three values in
npm install
```

Then choose **one** of these:

```bash
# A) Real use: empty database plus your own admin login
npm run db:setup -- --admin=you@yourorg.com --name="Wes Boucher" --password="a-long-password"

# B) Kick the tires: demo data (160 contacts, sample events)
npm run db:setup -- --seed
```

The script:
- applies `supabase/migrations/*.sql` (tables, indexes, and row-level security on every table)
- creates a private `uploads` bucket with type and size limits
- adds the demo data or your admin account

It's safe to re-run. Re-running with `--admin` also resets that admin's password.

> **Why row-level security with no policies?** The app connects to Postgres directly. Supabase also exposes every table through its public REST API. Turning RLS on with no policies means that API returns nothing, so contact data is only reachable through the logged-in app.

## 3. Deploy on Netlify

1. Push this repository to GitHub, GitLab, or Bitbucket.
2. In Netlify: **Add new site → Import an existing project**, then pick the repo.
   - **Base directory:** `app`. The app lives in this subfolder.
   - Build command and publish directory come from `netlify.toml`, so leave them alone.
3. **Site configuration → Environment variables**: add `DATABASE_URL`, `SUPABASE_URL`, and `SUPABASE_SERVICE_ROLE_KEY`, with the same values as `.env.local`.
4. **Deploy.** Netlify detects Next.js and applies its runtime automatically.
5. Open the site, sign in, and check that:
   - Home loads with your events (database is working)
   - uploading a cover image on an event works (storage is working)
   - opening that event shows the image (signed URLs are working)

## 4. After the first deploy

- **Change the demo passwords**, or deactivate the demo users on **Team** if you used `--seed`.
- **Custom domain:** Netlify → **Domain management**. HTTPS is automatic, and the session cookie is marked `Secure` in production.
- **Backups:** Supabase takes daily backups on paid plans. On the free plan, export regularly with **Database → Backups** or `pg_dump`.
- **Free-tier pausing:** Supabase pauses free projects after a week without activity. Upgrade, or open the app at least weekly.

## Schema changes later

Add a new file such as `supabase/migrations/20261115000000_add_x.sql`, then run `npm run db:setup` against production. Migrations are written to be safe to re-run (`IF NOT EXISTS`).

## Local development

With no `DATABASE_URL` set, `npm run dev` uses an embedded Postgres (PGlite) in `data/pglite/` and saves uploads to `storage/uploads/`, so no Supabase project is needed. `npm run db:reset` wipes the local database, and it reseeds on the next request.

To run locally against Supabase instead, keep the values in `.env.local`. Every developer then shares the production data, so use a separate Supabase project for staging.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `prepared statement … does not exist` | Make sure `DATABASE_URL` uses the **transaction pooler on port 6543**. The app already disables prepared statements for it. |
| `too many connections` | Lower `DATABASE_POOL_MAX` (default 5) in Netlify env vars, for example to `2`. |
| Images don't show, or uploads fail with 502 | Check `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`, and that the `uploads` bucket exists (re-run `npm run db:setup`). |
| Everyone is logged out after a deploy | Shouldn't happen, because sessions live in the database. If it does, check that `DATABASE_URL` points at the same project. |
