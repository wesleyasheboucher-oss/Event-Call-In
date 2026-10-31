import "server-only";
import { all, get, now, run } from "./db";
import type { AttendanceStatus, RsvpStatus } from "./status";

const CALL_FOLD_MS = 15 * 60e3;

/** Record that `userId` called this person, folding rapid repeat touches into one call. */
export async function logCall(registrationId: number, userId: number) {
  const last = await get<{ created_at: string }>(
    "SELECT created_at FROM call_logs WHERE registration_id = ? AND user_id = ? ORDER BY created_at DESC LIMIT 1",
    [registrationId, userId],
  );
  const ts = now();
  if (!last || Date.parse(ts) - Date.parse(last.created_at) > CALL_FOLD_MS) {
    await run("INSERT INTO call_logs (registration_id, user_id, created_at) VALUES (?, ?, ?)", [registrationId, userId, ts]);
  }
  await run("UPDATE registrations SET last_called_at = ? WHERE id = ?", [ts, registrationId]);
  return ts;
}

export async function changeRsvp(registrationId: number, to: RsvpStatus, userId: number) {
  const reg = await get<{ rsvp: RsvpStatus }>("SELECT rsvp FROM registrations WHERE id = ?", [registrationId]);
  if (!reg) throw new Error("Registration not found");
  if (reg.rsvp === to) return;
  await run("UPDATE registrations SET rsvp = ?, called_by = ? WHERE id = ?", [to, userId, registrationId]);
  await run(
    "INSERT INTO status_changes (registration_id, kind, from_value, to_value, user_id, created_at) VALUES (?, 'rsvp', ?, ?, ?, ?)",
    [registrationId, reg.rsvp, to, userId, now()],
  );

  // Guests follow their host's RSVP (each change audited on the guest too).
  const guests = await all<{ id: number }>("SELECT id FROM registrations WHERE guest_of = ?", [registrationId]);
  for (const g of guests) await changeRsvp(g.id, to, userId);
}

export async function changeAttendance(registrationId: number, to: AttendanceStatus, userId: number) {
  const reg = await get<{ attendance: AttendanceStatus }>("SELECT attendance FROM registrations WHERE id = ?", [registrationId]);
  if (!reg) throw new Error("Registration not found");
  if (reg.attendance === to) return;
  await run("UPDATE registrations SET attendance = ?, checked_in_at = ? WHERE id = ?", [
    to,
    to === "attended" ? now() : null,
    registrationId,
  ]);
  await run(
    "INSERT INTO status_changes (registration_id, kind, from_value, to_value, user_id, created_at) VALUES (?, 'attendance', ?, ?, ?, ?)",
    [registrationId, reg.attendance, to, userId, now()],
  );
}

/** Adds a contact to an event's list if not already on it. Returns the registration id. */
export async function ensureRegistration(
  eventId: number,
  contactId: number,
  opts: { walkIn?: boolean } = {},
): Promise<number> {
  await run("INSERT INTO registrations (event_id, contact_id, walk_in) VALUES (?, ?, ?) ON CONFLICT DO NOTHING", [
    eventId,
    contactId,
    opts.walkIn ? 1 : 0,
  ]);
  return (await get<{ id: number }>("SELECT id FROM registrations WHERE event_id = ? AND contact_id = ?", [eventId, contactId]))!.id;
}
