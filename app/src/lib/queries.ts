import "server-only";
import { all, get } from "./db";
import { EVENT_JSON_FIELDS } from "./types";
import type {
  CallListRow,
  ChangeRow,
  Contact,
  EventRecord,
  EventStaff,
  EventStats,
  GuestRow,
  HistoryRow,
  NoteRow,
  User,
} from "./types";
import { RSVP_STATUSES, type RsvpStatus } from "./status";

type RawEvent = Record<string, unknown>;

export function parseEvent(row: RawEvent): EventRecord {
  const out = { ...row } as Record<string, unknown>;
  for (const key of EVENT_JSON_FIELDS) {
    try {
      out[key] = JSON.parse((row[key] as string) || "[]");
    } catch {
      out[key] = [];
    }
  }
  return out as unknown as EventRecord;
}

/* ---------------------------------- Users --------------------------------- */

export async function listUsers(): Promise<User[]> {
  return all<User>(
    "SELECT id, name, email, phone, role, title, division, must_change_password, pending, active, created_at FROM users ORDER BY pending DESC, active DESC, division NULLS LAST, lower(name)",
  );
}

/* --------------------------------- Events --------------------------------- */

export async function getEvent(id: number): Promise<EventRecord | null> {
  const row = await get<RawEvent>("SELECT * FROM events WHERE id = ?", [id]);
  return row ? parseEvent(row) : null;
}

export type EventListItem = EventRecord & { stats: EventStats };

export async function listEvents(opts: { includeArchived?: boolean } = {}): Promise<EventListItem[]> {
  const [rows, stats] = await Promise.all([
    all<RawEvent>(`SELECT * FROM events ${opts.includeArchived ? "" : "WHERE archived_at IS NULL"} ORDER BY start_at DESC`),
    allEventStats(),
  ]);
  return rows.map((r) => {
    const e = parseEvent(r);
    return { ...e, stats: stats.get(e.id) ?? emptyStats() };
  });
}

export async function getEventStaff(eventId: number): Promise<EventStaff[]> {
  return all<EventStaff>(
    `SELECT s.user_id, u.name, s.role FROM event_staff s JOIN users u ON u.id = s.user_id
      WHERE s.event_id = ? ORDER BY u.name`,
    [eventId],
  );
}

export async function listCategories(): Promise<string[]> {
  return (await all<{ name: string }>("SELECT name FROM categories ORDER BY name")).map((r) => r.name);
}

function emptyStats(): EventStats {
  return {
    rsvp: { total: 0, no_data: 0, confirmed: 0, tentative: 0, reconfirmed: 0, declined: 0 },
    attended: 0,
    noShow: 0,
    pending: 0,
    walkIns: 0,
    expectedHeadcount: 0,
    showRate: null,
  };
}

type StatRow = {
  event_id: number;
  rsvp: RsvpStatus;
  n: number;
  attended: number;
  no_show: number;
  pending: number;
  walk_ins: number;
  attended_confirmed: number;
};

function computeStats(rows: StatRow[]): EventStats {
  const s = emptyStats();
  let confirmedAttended = 0;
  let expectedPending = 0;
  for (const r of rows) {
    s.rsvp[r.rsvp] = r.n;
    s.rsvp.total += r.n;
    s.attended += r.attended;
    s.noShow += r.no_show;
    s.pending += r.pending;
    s.walkIns += r.walk_ins;
    if (r.rsvp === "confirmed" || r.rsvp === "reconfirmed" || r.rsvp === "tentative") {
      // Guests have their own registrations, so they're already in r.n.
      s.expectedHeadcount += r.n;
      expectedPending += r.pending;
    }
    if (r.rsvp === "confirmed" || r.rsvp === "reconfirmed") confirmedAttended += r.attended_confirmed;
  }
  const confirmed = s.rsvp.confirmed + s.rsvp.reconfirmed;
  // Show rate: of the people who said yes, how many came.
  // Not meaningful until the event is closed out (no expected attendees left pending).
  s.showRate = confirmed > 0 && expectedPending === 0 ? confirmedAttended / confirmed : null;
  return s;
}

const STATS_SQL = `
  SELECT event_id, rsvp, COUNT(*) AS n,
         COUNT(*) FILTER (WHERE attendance = 'attended') AS attended,
         COUNT(*) FILTER (WHERE attendance = 'no_show') AS no_show,
         COUNT(*) FILTER (WHERE attendance = 'pending') AS pending,
         SUM(walk_in) AS walk_ins,
         COUNT(*) FILTER (WHERE attendance = 'attended') AS attended_confirmed
    FROM registrations`;

async function allEventStats(): Promise<Map<number, EventStats>> {
  const rows = await all<StatRow>(`${STATS_SQL} GROUP BY event_id, rsvp`);
  const grouped = new Map<number, StatRow[]>();
  for (const r of rows) {
    if (!grouped.has(r.event_id)) grouped.set(r.event_id, []);
    grouped.get(r.event_id)!.push(r);
  }
  return new Map([...grouped].map(([id, rs]) => [id, computeStats(rs)]));
}

export async function getEventStats(eventId: number): Promise<EventStats> {
  return computeStats(await all<StatRow>(`${STATS_SQL} WHERE event_id = ? GROUP BY event_id, rsvp`, [eventId]));
}

/* ------------------------------ Registrations ----------------------------- */

export async function getCallList(eventId: number): Promise<CallListRow[]> {
  return all<CallListRow>(
    `SELECT r.id AS registration_id, c.id AS contact_id, c.first_name, c.last_name, c.phone, c.email,
            r.rsvp, r.attendance, r.last_called_at, u.name AS called_by_name,
            (SELECT string_agg(gc.first_name || ' ' || gc.last_name, ', ' ORDER BY g.id)
               FROM registrations g JOIN contacts gc ON gc.id = g.contact_id WHERE g.guest_of = r.id) AS guest_names,
            (SELECT COUNT(*) FROM registrations g WHERE g.guest_of = r.id) AS guest_count,
            (SELECT COUNT(*) FROM call_notes n WHERE n.registration_id = r.id) AS note_count,
            (SELECT body FROM call_notes n WHERE n.registration_id = r.id ORDER BY created_at DESC LIMIT 1) AS last_note,
            (SELECT COUNT(*) FROM registrations r2 WHERE r2.contact_id = c.id AND r2.attendance = 'attended' AND r2.event_id <> r.event_id) AS attended_count,
            (SELECT COUNT(*) FROM registrations r2 WHERE r2.contact_id = c.id AND r2.attendance = 'no_show' AND r2.event_id <> r.event_id) AS no_show_count
       FROM registrations r
       JOIN contacts c ON c.id = r.contact_id
       LEFT JOIN users u ON u.id = r.called_by
      WHERE r.event_id = ? AND r.guest_of IS NULL
      ORDER BY lower(c.last_name), lower(c.first_name)`,
    [eventId],
  );
}

export async function getRegistrationNotes(registrationId: number): Promise<NoteRow[]> {
  return all<NoteRow>(
    `SELECT n.id, n.body, n.created_at, u.name AS author FROM call_notes n JOIN users u ON u.id = n.user_id
      WHERE n.registration_id = ? ORDER BY n.created_at DESC`,
    [registrationId],
  );
}

export async function getRegistrationChanges(registrationId: number): Promise<ChangeRow[]> {
  return all<ChangeRow>(
    `SELECT s.id, s.kind, s.from_value, s.to_value, s.created_at, u.name AS author
       FROM status_changes s JOIN users u ON u.id = s.user_id
      WHERE s.registration_id = ? ORDER BY s.created_at DESC, s.id DESC`,
    [registrationId],
  );
}

export async function getGuests(registrationId: number): Promise<GuestRow[]> {
  return all<GuestRow>(
    `SELECT g.id AS registration_id, c.id AS contact_id, c.first_name, c.last_name, c.phone, c.email, g.attendance
       FROM registrations g JOIN contacts c ON c.id = g.contact_id
      WHERE g.guest_of = ? ORDER BY g.id`,
    [registrationId],
  );
}

/** The host whose guest this registration is, if any. */
export async function getGuestOf(
  registrationId: number,
): Promise<{ registration_id: number; name: string; phone: string } | null> {
  return (
    (await get<{ registration_id: number; name: string; phone: string }>(
      `SELECT h.id AS registration_id, hc.first_name || ' ' || hc.last_name AS name, hc.phone
         FROM registrations r JOIN registrations h ON h.id = r.guest_of JOIN contacts hc ON hc.id = h.contact_id
        WHERE r.id = ?`,
      [registrationId],
    )) ?? null
  );
}

/* --------------------------------- Contacts ------------------------------- */

export type ContactListRow = Contact & {
  tag_ids: number[];
  events_count: number;
  attended_count: number;
  no_show_count: number;
  last_event_at: string | null;
};

export async function listContacts(): Promise<ContactListRow[]> {
  return all<ContactListRow>(
    `SELECT c.*,
            COUNT(r.id) AS events_count,
            COUNT(r.id) FILTER (WHERE r.attendance = 'attended') AS attended_count,
            COUNT(r.id) FILTER (WHERE r.attendance = 'no_show') AS no_show_count,
            MAX(e.start_at) AS last_event_at,
            ARRAY(SELECT ct.tag_id FROM contact_tags ct WHERE ct.contact_id = c.id ORDER BY ct.tag_id) AS tag_ids
       FROM contacts c
       LEFT JOIN registrations r ON r.contact_id = c.id
       LEFT JOIN events e ON e.id = r.event_id
      GROUP BY c.id
      ORDER BY lower(c.last_name), lower(c.first_name)`,
  );
}

export async function getContact(id: number): Promise<Contact | null> {
  return (await get<Contact>("SELECT * FROM contacts WHERE id = ?", [id])) ?? null;
}

export async function getContactHistory(contactId: number): Promise<HistoryRow[]> {
  return all<HistoryRow>(
    `SELECT r.id AS registration_id, e.id AS event_id, e.name AS event_name, e.start_at, e.time_zone,
            e.status AS event_status, e.cover_thumb, r.rsvp, r.attendance, r.walk_in, r.last_called_at,
            u.name AS called_by_name, hc.first_name || ' ' || hc.last_name AS guest_of_name, hc.phone AS guest_of_phone
       FROM registrations r JOIN events e ON e.id = r.event_id LEFT JOIN users u ON u.id = r.called_by
       LEFT JOIN registrations h ON h.id = r.guest_of LEFT JOIN contacts hc ON hc.id = h.contact_id
      WHERE r.contact_id = ? ORDER BY e.start_at DESC`,
    [contactId],
  );
}

export async function getContactNotes(contactId: number): Promise<NoteRow[]> {
  return all<NoteRow>(
    `SELECT n.id, n.body, n.created_at, u.name AS author, e.name AS event_name
       FROM call_notes n JOIN registrations r ON r.id = n.registration_id
       JOIN events e ON e.id = r.event_id JOIN users u ON u.id = n.user_id
      WHERE r.contact_id = ? ORDER BY n.created_at DESC`,
    [contactId],
  );
}

export async function findDuplicateContacts(phone: string, email: string): Promise<Contact[]> {
  if (!phone && !email) return [];
  return all<Contact>(
    `SELECT * FROM contacts WHERE (?::text <> '' AND phone = ?::text) OR (?::text <> '' AND email = ?::text) LIMIT 5`,
    [phone, phone, email, email],
  );
}

/* --------------------------------- Reports -------------------------------- */

export type CallerReportRow = { user_id: number; name: string; calls: number; confirms: number; notes: number };

export async function getCallerReport(eventId: number): Promise<CallerReportRow[]> {
  return all<CallerReportRow>(
    `SELECT * FROM (
     SELECT u.id AS user_id, u.name,
            (SELECT COUNT(*) FROM call_logs l JOIN registrations r ON r.id = l.registration_id
              WHERE l.user_id = u.id AND r.event_id = ?) AS calls,
            (SELECT COUNT(*) FROM status_changes s JOIN registrations r ON r.id = s.registration_id
              WHERE s.user_id = u.id AND r.event_id = ? AND s.kind = 'rsvp'
                AND s.via <> 'upload' AND s.to_value IN ('confirmed','reconfirmed')) AS confirms,
            (SELECT COUNT(*) FROM call_notes n JOIN registrations r ON r.id = n.registration_id
              WHERE n.user_id = u.id AND r.event_id = ?) AS notes
       FROM users u
     ) t
      WHERE calls > 0 OR notes > 0
      ORDER BY calls DESC`,
    [eventId, eventId, eventId],
  );
}

export { RSVP_STATUSES };
