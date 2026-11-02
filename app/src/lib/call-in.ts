import "server-only";
import { all } from "./db";
import { listContacts, listEvents, type EventListItem } from "./queries";
import { daysUntil } from "./time";
import type { RsvpStatus } from "./status";

/** One person's registration on one event, as shown in a Call In cell. */
export type CallInCell = {
  registration_id: number;
  status: RsvpStatus;
  last_called_at: string | null;
  called_by_name: string | null;
  guest_count: number;
  /** Set when this person is someone's guest; their status follows the host. */
  guest_of_name: string | null;
  guest_of_phone: string | null;
  guest_of_contact_id: number | null;
  note_count: number;
};

export type CallInRow = {
  contact_id: number;
  first_name: string;
  last_name: string;
  phone: string;
  email: string;
  tag_ids: number[];
  division: number | null;
  alt_phone: string;
  /** 1 = active, 0 = inactive */
  active: number;
  /** 'guest' = came in as someone's plus-one */
  source: "import" | "walk_in" | "manual" | "guest" | "signup";
  attended_count: number;
  no_show_count: number;
  /** keyed by event id; missing = not on that event's list */
  cells: Record<number, CallInCell>;
};

export type CallInEvent = Pick<
  EventListItem,
  | "id"
  | "name"
  | "start_at"
  | "time_zone"
  | "status"
  | "category"
  | "cover_thumb"
  | "capacity"
  | "rsvp_deadline"
  | "caller_script"
  | "plus_ones_allowed"
  | "max_guests"
> & { list_size: number; not_contacted: number; confirms: number; deadline_passed: boolean };

/** Upcoming events that can still be called for, soonest first. */
export async function callableEvents(): Promise<CallInEvent[]> {
  return (await listEvents())
    .filter((e) => daysUntil(e.start_at, e.time_zone) >= 0 && e.status !== "completed" && e.status !== "cancelled")
    .sort((a, b) => a.start_at.localeCompare(b.start_at))
    .map((e) => ({
      id: e.id,
      name: e.name,
      start_at: e.start_at,
      time_zone: e.time_zone,
      status: e.status,
      category: e.category,
      cover_thumb: e.cover_thumb,
      capacity: e.capacity,
      rsvp_deadline: e.rsvp_deadline,
      caller_script: e.caller_script,
      plus_ones_allowed: e.plus_ones_allowed,
      max_guests: e.max_guests,
      list_size: e.stats.rsvp.total,
      not_contacted: e.stats.rsvp.no_data,
      confirms: e.stats.rsvp.confirmed + e.stats.rsvp.reconfirmed,
      deadline_passed: !!e.rsvp_deadline && e.rsvp_deadline < new Date().toISOString(),
    }));
}

/**
 * Contacts with their registration on each of the given events. By default only people
 * on at least one of those lists (what Call In shows first); `everyone` adds all contacts.
 */
export async function getCallInRows(eventIds: number[], opts: { everyone?: boolean } = {}): Promise<CallInRow[]> {
  const [contacts, regs] = await Promise.all([
    listContacts(),
    eventIds.length
      ? all<CallInCell & { contact_id: number; event_id: number }>(
          `SELECT r.id AS registration_id, r.contact_id, r.event_id, r.rsvp AS status, r.last_called_at,
                  u.name AS called_by_name,
                  (SELECT COUNT(*) FROM registrations g WHERE g.guest_of = r.id) AS guest_count,
                  (SELECT COUNT(*) FROM call_notes n WHERE n.registration_id = r.id) AS note_count,
                  hc.first_name || ' ' || hc.last_name AS guest_of_name,
                  hc.phone AS guest_of_phone, hc.id AS guest_of_contact_id
             FROM registrations r
             LEFT JOIN users u ON u.id = r.called_by
             LEFT JOIN registrations h ON h.id = r.guest_of
             LEFT JOIN contacts hc ON hc.id = h.contact_id
            WHERE r.event_id IN (${eventIds.map(() => "?").join(",")})`,
          eventIds,
        )
      : Promise.resolve([]),
  ]);

  const cellsByContact = new Map<number, Record<number, CallInCell>>();
  for (const { contact_id, event_id, ...cell } of regs) {
    if (!cellsByContact.has(contact_id)) cellsByContact.set(contact_id, {});
    cellsByContact.get(contact_id)![event_id] = cell;
  }

  return contacts
    .filter((c) => opts.everyone || cellsByContact.has(c.id))
    .map((c) => ({
    contact_id: c.id,
    first_name: c.first_name,
    last_name: c.last_name,
    phone: c.phone,
    email: c.email,
    tag_ids: c.tag_ids,
    division: c.division,
    source: c.source,
    alt_phone: c.alt_phone,
    active: c.active,
    attended_count: c.attended_count,
    no_show_count: c.no_show_count,
    cells: cellsByContact.get(c.id) ?? {},
  }));
}
