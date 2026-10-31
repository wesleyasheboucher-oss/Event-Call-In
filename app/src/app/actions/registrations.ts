"use server";

import { actionUser } from "@/lib/auth";
import { get, insert, now, tx } from "@/lib/db";
import { changeAttendance, changeRsvp, logCall } from "@/lib/registrations";
import {
  findDuplicateContacts,
  getContact,
  getContactHistory,
  getContactNotes,
  getGuestOf,
  getGuests,
  getRegistrationChanges,
  getRegistrationNotes,
} from "@/lib/queries";
import { addGuest as addGuestToHost, removeGuest as removeGuestFromHost, type GuestInput } from "@/lib/guests";
import { normalizeEmail, normalizePhone } from "@/lib/phone";
import { ATTENDANCE_STATUSES, RSVP_STATUSES, type AttendanceStatus, type RsvpStatus } from "@/lib/status";
import type { ChangeRow, Contact, GuestRow, HistoryRow, NoteRow } from "@/lib/types";

export type ContactDetail = {
  contact: Contact;
  history: HistoryRow[];
  notes: NoteRow[];
};

export type RegistrationDetail = ContactDetail & {
  registrationNotes: NoteRow[];
  changes: ChangeRow[];
  guests: GuestRow[];
  guestOf: { registration_id: number; name: string } | null;
};

export async function fetchContactDetail(contactId: number): Promise<ContactDetail | null> {
  await actionUser();
  const [contact, history, notes] = await Promise.all([
    getContact(contactId),
    getContactHistory(contactId),
    getContactNotes(contactId),
  ]);
  if (!contact) return null;
  return { contact, history, notes };
}

export async function fetchRegistrationDetail(registrationId: number): Promise<RegistrationDetail | null> {
  await actionUser();
  const reg = await get<{ contact_id: number }>("SELECT contact_id FROM registrations WHERE id = ?", [registrationId]);
  if (!reg) return null;
  const [base, registrationNotes, changes, guests, guestOf] = await Promise.all([
    fetchContactDetail(reg.contact_id),
    getRegistrationNotes(registrationId),
    getRegistrationChanges(registrationId),
    getGuests(registrationId),
    getGuestOf(registrationId),
  ]);
  if (!base) return null;
  return { ...base, registrationNotes, changes, guests, guestOf };
}

export async function setRsvp(registrationId: number, status: RsvpStatus) {
  const user = await actionUser(["caller"]);
  if (!RSVP_STATUSES.includes(status)) throw new Error("Unknown status");
  const calledAt = await tx(async () => {
    await changeRsvp(registrationId, status, user.id);
    return logCall(registrationId, user.id);
  });
  return { last_called_at: calledAt, called_by_name: user.name };
}

export async function addCallNote(registrationId: number, body: string) {
  const user = await actionUser(["caller", "signin"]);
  const text = body.trim();
  if (!text) throw new Error("Note is empty");
  const createdAt = now();
  const id = await tx(async () => {
    const noteId = await insert("INSERT INTO call_notes (registration_id, user_id, body, created_at) VALUES (?, ?, ?, ?)", [
      registrationId,
      user.id,
      text,
      createdAt,
    ]);
    if (user.role !== "signin") await logCall(registrationId, user.id);
    return noteId;
  });
  return { note: { id, body: text, created_at: createdAt, author: user.name } satisfies NoteRow };
}

/** Existing contacts that match a guest's phone/email, so we don't create duplicates. */
export async function findGuestMatches(phone: string, email: string): Promise<Contact[]> {
  await actionUser(["caller", "signin"]);
  return findDuplicateContacts(normalizePhone(phone), normalizeEmail(email));
}

/** Adds a named guest to a host's registration; returns the host's updated guest list. */
export async function addGuest(
  hostRegistrationId: number,
  input: GuestInput,
): Promise<{ ok: true; guests: GuestRow[] } | { ok: false; error: string }> {
  const user = await actionUser(["caller", "signin"]);
  try {
    await tx(() => addGuestToHost(hostRegistrationId, input, user.id));
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
  return { ok: true, guests: await getGuests(hostRegistrationId) };
}

export async function removeGuest(hostRegistrationId: number, guestRegistrationId: number): Promise<GuestRow[]> {
  await actionUser(["caller", "signin"]);
  await tx(() => removeGuestFromHost(guestRegistrationId));
  return getGuests(hostRegistrationId);
}

export async function setAttendance(registrationId: number, status: AttendanceStatus) {
  const user = await actionUser(["signin"]);
  if (!ATTENDANCE_STATUSES.includes(status)) throw new Error("Unknown status");
  await tx(() => changeAttendance(registrationId, status, user.id));
  return { checked_in_at: status === "attended" ? now() : null };
}
