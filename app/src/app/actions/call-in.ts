"use server";

import { actionUser } from "@/lib/auth";
import { get, tx } from "@/lib/db";
import { changeRsvp, ensureRegistration, logCall } from "@/lib/registrations";
import { getGuests } from "@/lib/queries";
import { RSVP_STATUSES, type RsvpStatus } from "@/lib/status";
import type { CallInCell } from "@/lib/call-in";
import type { GuestRow } from "@/lib/types";

/**
 * Put someone on an event's call list from Call In, optionally setting their
 * registration status in the same click.
 */
export async function addToEventList(eventId: number, contactId: number, status: RsvpStatus = "no_data"): Promise<CallInCell> {
  const user = await actionUser(["caller"]);
  if (!RSVP_STATUSES.includes(status)) throw new Error("Unknown status");
  const event = await get<{ status: string }>("SELECT status FROM events WHERE id = ?", [eventId]);
  if (!event) throw new Error("Event not found");

  return tx(async () => {
    const regId = await ensureRegistration(eventId, contactId);
    let lastCalled: string | null = null;
    if (status !== "no_data") {
      await changeRsvp(regId, status, user.id);
      lastCalled = await logCall(regId, user.id);
    }
    const reg = await get<{ status: RsvpStatus }>("SELECT rsvp AS status FROM registrations WHERE id = ?", [regId]);
    return {
      registration_id: regId,
      status: reg!.status,
      last_called_at: lastCalled,
      called_by_name: status !== "no_data" ? user.name : null,
      guest_count: 0,
      guest_of_name: null,
      guest_of_phone: null,
      guest_of_contact_id: null,
      note_count: 0,
    };
  });
}

export async function fetchGuests(registrationId: number): Promise<GuestRow[]> {
  await actionUser(["caller", "signin"]);
  return getGuests(registrationId);
}
