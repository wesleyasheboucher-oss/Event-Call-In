import "server-only";
import { randomUUID } from "node:crypto";
import { all, get, insert, now, run, tx } from "./db";
import { getEvent, getEventStaff } from "./queries";
import { fromLocalInput, toLocalInput } from "./time";
import { normalizePhone } from "./phone";
import { EVENT_JSON_FIELDS, type EventRecord } from "./types";
import { WRITABLE_TEXT_FIELDS, type CallListFilter, type EventInput } from "@/components/event-form/types";

/* ------------------------------- Form mapping ------------------------------ */

export async function eventToInput(e: EventRecord): Promise<EventInput> {
  const staff = await getEventStaff(e.id);
  return {
    ...e,
    start_local: toLocalInput(e.start_at, e.time_zone),
    end_local: toLocalInput(e.end_at, e.time_zone),
    doors_local: toLocalInput(e.doors_at, e.time_zone),
    rsvp_deadline_local: toLocalInput(e.rsvp_deadline, e.time_zone),
    capacity: e.capacity == null ? "" : String(e.capacity),
    callers: staff.filter((s) => s.role === "caller").map((s) => s.user_id),
    signin_staff: staff.filter((s) => s.role === "signin").map((s) => s.user_id),
    occurrences: 1,
  };
}

/** Shift a "yyyy-MM-ddTHH:mm" wall time by days or months, keeping the clock time. */
function shiftLocal(value: string, step: "weekly" | "monthly", n: number): string {
  if (!value || n === 0) return value;
  const [d, t] = value.split("T");
  const [y, m, day] = d.split("-").map(Number);
  const base = new Date(Date.UTC(y, m - 1, day));
  if (step === "weekly") base.setUTCDate(base.getUTCDate() + 7 * n);
  else base.setUTCMonth(base.getUTCMonth() + n);
  return `${base.toISOString().slice(0, 10)}T${t}`;
}

function rowFromInput(v: EventInput, offset: number, step: "weekly" | "monthly" | null) {
  const tz = v.time_zone;
  const sh = (s: string) => (step ? shiftLocal(s, step, offset) : s);
  const row: Record<string, string | number | null> = {};
  for (const k of WRITABLE_TEXT_FIELDS) row[k] = String(v[k] ?? "").trim();
  row.description = v.description; // keep markdown whitespace
  row.caller_script = v.caller_script;
  row.signin_instructions = v.signin_instructions;
  row.internal_notes = v.internal_notes;
  row.contact_phone = normalizePhone(v.contact_phone);
  for (const k of EVENT_JSON_FIELDS) row[k] = JSON.stringify(cleanJson(k, v[k]));
  row.start_at = fromLocalInput(sh(v.start_local), tz);
  row.end_at = fromLocalInput(sh(v.end_local), tz);
  row.doors_at = fromLocalInput(sh(v.doors_local), tz);
  row.rsvp_deadline = fromLocalInput(sh(v.rsvp_deadline_local), tz);
  row.capacity = v.capacity ? Number(v.capacity) : null;
  row.plus_ones_allowed = v.plus_ones_allowed ? 1 : 0;
  row.max_guests = v.plus_ones_allowed ? Math.max(0, Number(v.max_guests) || 0) : 0;
  if (v.admission !== "paid") row.price_tiers = "[]";
  if (v.status !== "postponed" && v.status !== "cancelled") row.status_reason = "";
  return row;
}

function cleanJson(key: string, value: unknown): unknown {
  if (!Array.isArray(value)) return [];
  if (key === "tags" || key === "hosts" || key === "cohosts" || key === "venue_photos" || key === "gallery") {
    return [...new Set(value.map((s) => String(s).trim()).filter(Boolean))];
  }
  // Repeating lists: drop rows where every field is blank.
  return value.filter((item) => item && Object.values(item).some((x) => String(x ?? "").trim() !== ""));
}

async function setStaff(eventId: number, callers: number[], signin: number[]) {
  await run("DELETE FROM event_staff WHERE event_id = ?", [eventId]);
  for (const id of new Set(callers)) {
    await run("INSERT INTO event_staff (event_id, user_id, role) VALUES (?, ?, 'caller')", [eventId, id]);
  }
  for (const id of new Set(signin)) {
    await run("INSERT INTO event_staff (event_id, user_id, role) VALUES (?, ?, 'signin')", [eventId, id]);
  }
}

async function ensureCategory(name: string) {
  if (name.trim()) await run("INSERT INTO categories (name) VALUES (?) ON CONFLICT DO NOTHING", [name.trim()]);
}

export async function createEvents(v: EventInput, userId: number, filter: CallListFilter): Promise<number[]> {
  const step = v.recurrence === "weekly" || v.recurrence === "monthly" ? v.recurrence : null;
  const count = step ? Math.max(1, Math.min(52, Math.floor(v.occurrences || 1))) : 1;
  const seriesId = count > 1 ? randomUUID() : null;
  return tx(async () => {
    await ensureCategory(v.category);
    const ids: number[] = [];
    for (let i = 0; i < count; i++) {
      const row = rowFromInput(v, i, step);
      row.series_id = seriesId;
      row.created_by = userId;
      const cols = Object.keys(row);
      const id = await insert(
        `INSERT INTO events (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`,
        cols.map((c) => row[c]),
      );
      await setStaff(id, v.callers, v.signin_staff);
      await addToCallList(id, filter);
      ids.push(id);
    }
    return ids;
  });
}

export async function updateEvent(id: number, v: EventInput) {
  await tx(async () => {
    await ensureCategory(v.category);
    const row = rowFromInput(v, 0, null);
    row.updated_at = now();
    const cols = Object.keys(row);
    await run(`UPDATE events SET ${cols.map((c) => `${c} = ?`).join(", ")} WHERE id = ?`, [...cols.map((c) => row[c]), id]);
    await setStaff(id, v.callers, v.signin_staff);
  });
}

export async function duplicateEvent(id: number, userId: number): Promise<number> {
  const src = await getEvent(id);
  if (!src) throw new Error("Event not found");
  return tx(async () => {
    const raw = (await get<Record<string, string | number | null>>("SELECT * FROM events WHERE id = ?", [id]))!;
    const skip = new Set(["id", "series_id", "archived_at", "created_at", "updated_at"]);
    const cols = Object.keys(raw).filter((c) => !skip.has(c));
    const values = cols.map((c) => {
      if (c === "name") return `${src.name} (copy)`;
      if (c === "status") return "draft";
      if (c === "status_reason") return "";
      if (c === "gallery") return "[]";
      if (c === "created_by") return userId;
      return raw[c];
    });
    const newId = await insert(`INSERT INTO events (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`, values);
    await run(
      "INSERT INTO event_staff (event_id, user_id, role) SELECT ?::int, user_id, role FROM event_staff WHERE event_id = ?",
      [newId, id],
    );
    return newId;
  });
}

export async function setArchived(id: number, archived: boolean) {
  await run("UPDATE events SET archived_at = ?, updated_at = ? WHERE id = ?", [archived ? now() : null, now(), id]);
}

/* -------------------------------- Call lists ------------------------------- */

function filterSql(filter: CallListFilter): { sql: string; params: (string | number)[] } {
  const where: string[] = [];
  const params: (string | number)[] = [];
  if (filter.mode === "attended_any") {
    where.push("c.id IN (SELECT contact_id FROM registrations WHERE attendance = 'attended')");
  } else if (filter.mode === "attended_event" && filter.attendedEventId) {
    where.push("c.id IN (SELECT contact_id FROM registrations WHERE attendance = 'attended' AND event_id = ?)");
    params.push(filter.attendedEventId);
  }
  if (filter.excludeNoShows) {
    where.push("c.id NOT IN (SELECT contact_id FROM registrations WHERE attendance = 'no_show')");
  }
  const tagIds = (filter.tagIds ?? []).filter((id) => Number.isInteger(id));
  if (tagIds.length) {
    where.push(`c.id IN (SELECT contact_id FROM contact_tags WHERE tag_id IN (${tagIds.map(() => "?").join(",")}))`);
    params.push(...tagIds);
  }
  return { sql: `SELECT c.id FROM contacts c ${where.length ? "WHERE " + where.join(" AND ") : ""}`, params };
}

export async function previewCallList(eventId: number | null, filter: CallListFilter) {
  if (filter.mode === "none") return { matched: 0, added: 0 };
  const { sql, params } = filterSql(filter);
  const matched = (await get<{ n: number }>(`SELECT COUNT(*) AS n FROM (${sql}) m`, params))!.n;
  const added = eventId
    ? (await get<{ n: number }>(
        `SELECT COUNT(*) AS n FROM (${sql}) m WHERE m.id NOT IN (SELECT contact_id FROM registrations WHERE event_id = ?)`,
        [...params, eventId],
      ))!.n
    : matched;
  return { matched, added };
}

export async function addToCallList(eventId: number, filter: CallListFilter): Promise<number> {
  if (filter.mode === "none") return 0;
  const { sql, params } = filterSql(filter);
  const res = await run(
    `INSERT INTO registrations (event_id, contact_id) SELECT ?::int, m.id FROM (${sql}) m ON CONFLICT DO NOTHING`,
    [eventId, ...params],
  );
  return res.changes;
}

export async function addContactsToEvent(eventId: number, contactIds: number[]): Promise<number> {
  return tx(async () => {
    let n = 0;
    for (const cid of contactIds) {
      n += (
        await run("INSERT INTO registrations (event_id, contact_id) VALUES (?, ?) ON CONFLICT DO NOTHING", [eventId, cid])
      ).changes;
    }
    return n;
  });
}

export type ContactSearchRow = {
  id: number;
  first_name: string;
  last_name: string;
  phone: string;
  email: string;
  on_list: number;
};

export async function searchContactsForEvent(eventId: number, q: string): Promise<ContactSearchRow[]> {
  const term = q.trim();
  if (!term) return [];
  const like = `%${term.replace(/[%_]/g, "")}%`;
  const digits = normalizePhone(term);
  return all<ContactSearchRow>(
    `SELECT c.id, c.first_name, c.last_name, c.phone, c.email,
            EXISTS (SELECT 1 FROM registrations r WHERE r.event_id = ? AND r.contact_id = c.id)::int AS on_list
       FROM contacts c
      WHERE (c.first_name || ' ' || c.last_name) ILIKE ?
         OR c.email ILIKE ?
         OR (?::text <> '' AND c.phone LIKE ?)
      ORDER BY lower(c.last_name), lower(c.first_name)
      LIMIT 25`,
    [eventId, like, like, digits, `%${digits}%`],
  );
}

/** Past events, for the "attended a specific event" filter. */
export async function pastEventOptions(): Promise<{ id: number; name: string; start_at: string; time_zone: string }[]> {
  return all("SELECT id, name, start_at, time_zone FROM events WHERE start_at < ? ORDER BY start_at DESC", [now()]);
}

export async function userOptions(): Promise<{ id: number; name: string; role: string }[]> {
  return all("SELECT id, name, role FROM users WHERE active = 1 ORDER BY name");
}
