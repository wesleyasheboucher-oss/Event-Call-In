import "server-only";
import { all, get } from "@/lib/db";
import type { AttendanceStatus, RsvpStatus } from "@/lib/status";

export type SignInRow = {
  registration_id: number;
  contact_id: number;
  first_name: string;
  last_name: string;
  division: number | null;
  phone: string;
  email: string;
  rsvp: RsvpStatus;
  attendance: AttendanceStatus;
  walk_in: number;
  /** Host's registration and name when this person is someone's guest. */
  guest_of: number | null;
  guest_of_name: string | null;
  guest_count: number;
  checked_in_at: string | null;
};

const SELECT = `
  SELECT r.id AS registration_id, c.id AS contact_id, c.first_name, c.last_name, c.division, c.phone, c.email,
         r.rsvp, r.attendance, r.walk_in, r.checked_in_at, r.guest_of,
         hc.first_name || ' ' || hc.last_name AS guest_of_name,
         (SELECT COUNT(*) FROM registrations g WHERE g.guest_of = r.id) AS guest_count
    FROM registrations r JOIN contacts c ON c.id = r.contact_id
    LEFT JOIN registrations h ON h.id = r.guest_of LEFT JOIN contacts hc ON hc.id = h.contact_id`;

export async function getSignInRows(eventId: number): Promise<SignInRow[]> {
  return all<SignInRow>(`${SELECT} WHERE r.event_id = ? ORDER BY lower(c.last_name), lower(c.first_name)`, [eventId]);
}

/** A host's row followed by their guests' rows. */
export async function getHostAndGuestRows(hostRegistrationId: number): Promise<SignInRow[]> {
  return all<SignInRow>(`${SELECT} WHERE r.id = ? OR r.guest_of = ? ORDER BY r.guest_of NULLS FIRST, r.id`, [
    hostRegistrationId,
    hostRegistrationId,
  ]);
}

export async function getSignInRow(registrationId: number): Promise<SignInRow | undefined> {
  return get<SignInRow>(`${SELECT} WHERE r.id = ?`, [registrationId]);
}
