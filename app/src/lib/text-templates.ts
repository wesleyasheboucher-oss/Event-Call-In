import "server-only";
import { all, get } from "./db";
import type { TextEvent, TextTemplate } from "./texting";

/** Empty (rather than an error that takes down Call In) until the table's migration has been run. */
export async function listTextTemplates(): Promise<TextTemplate[]> {
  if (!(await get<{ ok: string | null }>("SELECT to_regclass('text_templates')::text AS ok"))?.ok) return [];
  return all<TextTemplate>(
    `SELECT t.id, t.name, t.body, t.event_id, t.updated_at
       FROM text_templates t LEFT JOIN events e ON e.id = t.event_id
      WHERE t.event_id IS NULL OR e.archived_at IS NULL
      ORDER BY t.event_id IS NOT NULL, lower(t.name)`,
  );
}

/** Events a text can be about: anything not archived that hasn't ended more than a day ago. */
export async function listTextEvents(): Promise<TextEvent[]> {
  const since = new Date(Date.now() - 864e5).toISOString();
  const rows = await all<Omit<TextEvent, "has_signup_page"> & { visibility: string; status: string }>(
    `SELECT id, name, start_at, time_zone, venue_name, street, city, state, zip, visibility, status
       FROM events WHERE archived_at IS NULL AND start_at >= ? ORDER BY start_at`,
    [since],
  );
  return rows.map(({ visibility, status, ...e }) => ({ ...e, has_signup_page: visibility === "shareable" && status !== "draft" }));
}
