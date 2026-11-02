import "server-only";
import { get, insert, now, run } from "./db";
import { changeAttendance, ensureRegistration } from "./registrations";
import { normalizeEmail, normalizePhone } from "./phone";
import type { RsvpStatus } from "./status";

export type GuestInput = {
  /** Use an existing contact instead of creating one. */
  contactId?: number;
  first_name?: string;
  last_name?: string;
  phone?: string;
  email?: string;
  /** At the door: mark the guest Attended right away. */
  checkIn?: boolean;
};

/**
 * Adds a named guest to a host's registration. The guest is a real contact
 * (source 'guest' when new) with their own registration on the same event,
 * linked via guest_of and following the host's RSVP. Call inside tx().
 */
export async function addGuest(hostRegistrationId: number, input: GuestInput, userId: number | null): Promise<number> {
  const host = await get<{ event_id: number; contact_id: number; rsvp: RsvpStatus; guest_of: number | null }>(
    "SELECT event_id, contact_id, rsvp, guest_of FROM registrations WHERE id = ?",
    [hostRegistrationId],
  );
  if (!host) throw new Error("Registration not found");
  if (host.guest_of) throw new Error("Guests can't bring their own guests. Add them to the original host instead.");

  const event = await get<{ plus_ones_allowed: number; max_guests: number }>(
    "SELECT plus_ones_allowed, max_guests FROM events WHERE id = ?",
    [host.event_id],
  );
  const current = await get<{ n: number }>("SELECT COUNT(*) AS n FROM registrations WHERE guest_of = ?", [hostRegistrationId]);
  if (!event?.plus_ones_allowed) throw new Error("This event doesn't allow plus-ones.");
  if (event.max_guests > 0 && (current?.n ?? 0) >= event.max_guests) {
    throw new Error(`Each person can bring at most ${event.max_guests} guest${event.max_guests === 1 ? "" : "s"}.`);
  }

  let contactId = input.contactId;
  if (!contactId) {
    const first = (input.first_name ?? "").trim();
    const last = (input.last_name ?? "").trim();
    if (!first || !last) throw new Error("A guest needs a first and last name.");
    const ts = now();
    contactId = await insert(
      `INSERT INTO contacts (first_name, last_name, phone, email, source, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'guest', ?, ?)`,
      [first, last, normalizePhone(input.phone), normalizeEmail(input.email), ts, ts],
    );
  }
  if (contactId === host.contact_id) throw new Error("Someone can't be their own guest.");

  const regId = await ensureRegistration(host.event_id, contactId);
  const existing = await get<{ guest_of: number | null }>("SELECT guest_of FROM registrations WHERE id = ?", [regId]);
  if (existing?.guest_of && existing.guest_of !== hostRegistrationId) {
    throw new Error("That person is already someone else's guest for this event.");
  }
  if ((await get<{ n: number }>("SELECT COUNT(*) AS n FROM registrations WHERE guest_of = ?", [regId]))?.n) {
    throw new Error("That person is bringing guests of their own, so they can't also be a guest.");
  }
  await run("UPDATE registrations SET guest_of = ?, rsvp = ? WHERE id = ?", [hostRegistrationId, host.rsvp, regId]);
  if (input.checkIn && userId) await changeAttendance(regId, "attended", userId);
  return regId;
}

/**
 * Removes a guest from a host. If the guest hasn't been checked in and nothing
 * else was recorded for them, their registration is dropped; otherwise it's
 * unlinked and kept, so attendance history isn't lost. The contact always stays.
 */
export async function removeGuest(guestRegistrationId: number) {
  const reg = await get<{ attendance: string; notes: number }>(
    `SELECT attendance, (SELECT COUNT(*) FROM call_notes n WHERE n.registration_id = r.id) AS notes
       FROM registrations r WHERE id = ? AND guest_of IS NOT NULL`,
    [guestRegistrationId],
  );
  if (!reg) throw new Error("Guest not found");
  if (reg.attendance === "pending" && reg.notes === 0) {
    await run("DELETE FROM registrations WHERE id = ?", [guestRegistrationId]);
  } else {
    await run("UPDATE registrations SET guest_of = NULL WHERE id = ?", [guestRegistrationId]);
  }
}
