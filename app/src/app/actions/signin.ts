"use server";

import { actionUser } from "@/lib/auth";
import { get, insert, now, run, tx } from "@/lib/db";
import { changeAttendance, ensureRegistration } from "@/lib/registrations";
import { findDuplicateContacts, getEventStats } from "@/lib/queries";
import { isValidEmail, normalizeEmail, normalizePhone } from "@/lib/phone";
import { getHostAndGuestRows, getSignInRow, type SignInRow } from "@/app/(app)/signin/[eventId]/data";
import type { Contact } from "@/lib/types";

export type WalkInInput = { firstName: string; lastName: string; phone: string; email: string };

export type WalkInResult =
  | { status: "error"; message: string }
  | { status: "duplicates"; matches: (Contact & { on_list: number; attendance: string | null })[] }
  | { status: "created"; row: SignInRow; alreadyAttended?: boolean };

async function eventExists(eventId: number) {
  if (!(await get("SELECT id FROM events WHERE id = ?", [eventId]))) throw new Error("Event not found");
}

/** Fresh rows for a host and their guests, after guests were added or removed. */
export async function fetchHostAndGuestRows(hostRegistrationId: number): Promise<SignInRow[]> {
  await actionUser(["signin"]);
  return getHostAndGuestRows(hostRegistrationId);
}

/** Check-in a walk-in: duplicate check first unless `force`. */
export async function addWalkIn(eventId: number, input: WalkInInput, force = false): Promise<WalkInResult> {
  const user = await actionUser(["signin"]);
  await eventExists(eventId);
  const first = input.firstName.trim();
  const last = input.lastName.trim();
  const phone = normalizePhone(input.phone);
  const email = normalizeEmail(input.email);
  if (!first || !last) return { status: "error", message: "First and last name are required." };
  if (!phone && !email) return { status: "error", message: "Add a phone number or an email." };
  if (email && !isValidEmail(email)) return { status: "error", message: "That email doesn't look right." };
  if (phone && phone.length < 10) return { status: "error", message: "Phone number looks too short." };

  if (!force) {
    const dupes = await findDuplicateContacts(phone, email);
    if (dupes.length) {
      const matches = await Promise.all(
        dupes.map(async (d) => {
          const reg = await get<{ attendance: string }>(
            "SELECT attendance FROM registrations WHERE event_id = ? AND contact_id = ?",
            [eventId, d.id],
          );
          return { ...d, on_list: reg ? 1 : 0, attendance: reg?.attendance ?? null };
        }),
      );
      return { status: "duplicates", matches };
    }
  }

  const regId = await tx(async () => {
    const ts = now();
    const contactId = await insert(
      `INSERT INTO contacts (first_name, last_name, phone, email, source, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'walk_in', ?, ?)`,
      [first, last, phone, email, ts, ts],
    );
    const id = await ensureRegistration(eventId, contactId, { walkIn: true });
    await changeAttendance(id, "attended", user.id);
    return id;
  });
  return { status: "created", row: (await getSignInRow(regId))! };
}

/** Use an existing contact for a walk-in: add to the list if needed, then check in. */
export async function checkInExistingContact(eventId: number, contactId: number): Promise<WalkInResult> {
  const user = await actionUser(["signin"]);
  await eventExists(eventId);
  const existing = await get<{ id: number; attendance: string }>(
    "SELECT id, attendance FROM registrations WHERE event_id = ? AND contact_id = ?",
    [eventId, contactId],
  );
  const alreadyAttended = existing?.attendance === "attended";
  const regId = await tx(async () => {
    const id = existing?.id ?? (await ensureRegistration(eventId, contactId, { walkIn: true }));
    await changeAttendance(id, "attended", user.id);
    return id;
  });
  return { status: "created", row: (await getSignInRow(regId))!, alreadyAttended };
}

export type CloseOutSummary = {
  attended: number;
  noShow: number;
  walkIns: number;
  showRate: number | null;
  expected: number;
};

/** Marks the given still-pending registrations No-Show and completes the event. */
export async function closeOutEvent(eventId: number, registrationIds: number[]): Promise<CloseOutSummary> {
  const user = await actionUser(["signin"]);
  await eventExists(eventId);
  await tx(async () => {
    for (const id of registrationIds) {
      const reg = await get<{ attendance: string }>(
        "SELECT attendance FROM registrations WHERE id = ? AND event_id = ?",
        [id, eventId],
      );
      if (reg?.attendance === "pending") await changeAttendance(id, "no_show", user.id);
    }
    await run("UPDATE events SET status = 'completed', updated_at = ? WHERE id = ?", [now(), eventId]);
  });
  const s = await getEventStats(eventId);
  return {
    attended: s.attended,
    noShow: s.noShow,
    walkIns: s.walkIns,
    showRate: s.showRate,
    expected: s.rsvp.confirmed + s.rsvp.reconfirmed + s.rsvp.tentative,
  };
}
