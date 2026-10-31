# Call-In: Event Call Lists & Attendance

Built from `../Event-Call-In-BRD.md`.

## Run it

```bash
npm install
npm run dev          # http://localhost:3000
```

No setup needed: with no `DATABASE_URL`, the app runs an embedded Postgres (PGlite) in `data/pglite/`. The first request creates the schema and seeds demo data: 160 contacts, 4 past events with attendance history, one event **today** for the sign-in screen, and one in 3 weeks that is partly called.

| Account | Role | Password |
|---|---|---|
| admin@example.com | Admin | `password` |
| caller@example.com | Caller | `password` |
| signin@example.com | Sign-in staff | `password` |

`npm run db:reset` deletes the database so it reseeds on the next request.

## Stack

- **Next.js 16** (App Router, Cache Components on). Pages are server components behind Suspense skeletons, and writes are server actions.
- **Postgres** with no ORM. The schema lives in `supabase/migrations/`. `src/lib/db.ts` talks to Supabase through the `postgres` driver when `DATABASE_URL` is set, and to the embedded PGlite otherwise. All SQL sits in `src/lib/queries.ts` and the feature modules under `lib/` and `app/actions/`.
- **Auth**: email/password (scrypt) with a DB-backed session cookie. `src/proxy.ts` redirects anyone without a session. `requireUser()` / `actionUser()` enforce role per screen and action.
- **UI**: Tailwind v4, `motion` (drawers, layout animations), `lucide-react`, `sonner` toasts.
- **Uploads**: a private Supabase Storage bucket. Browsers upload directly with one-time signed URLs, and `/files/<name>` checks the session before redirecting to a short-lived signed link. Locally, files go to `storage/uploads/`.

## Where things live

| Area | Path |
|---|---|
| Caller workspace | `src/app/(app)/call/` |
| Event-day sign-in | `src/app/(app)/signin/` |
| Events (list, page, form) | `src/app/(app)/events/` |
| Contacts & import | `src/app/(app)/contacts/` |
| Reports / Team | `src/app/(app)/reports/`, `src/app/(app)/users/` |
| Shared UI kit | `src/components/` (`ui.tsx`, `drawer.tsx`, `status.tsx`, `contact-panel.tsx`) |
| Audit trail | `status_changes` table: every RSVP/attendance change with who and when |

## Roles

Admins see everything. Callers see Home, Events, and Calling. Sign-in staff see Home, Events, and Sign-in. (BRD open decision #2, defaulted to role-based screens rather than fine-grained permissions.)

## Deploying

Supabase (database and storage) plus Netlify (app). See **[DEPLOY.md](DEPLOY.md)** for step-by-step instructions.
