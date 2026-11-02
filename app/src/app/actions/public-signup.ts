"use server";

import { all, get, insert, now, run, tx } from "@/lib/db";
import { addGuest } from "@/lib/guests";
import { changeRsvp, ensureRegistration } from "@/lib/registrations";
import { CLOSED_MESSAGE, publicSignupState } from "@/lib/public-event";
import { isValidEmail, normalizeEmail, normalizePhone } from "@/lib/phone";
import type { RsvpStatus } from "@/lib/status";

export type SignupPerson = { first_name: string; last_name: string; phone: string; email: string };
export type SignupResult = { ok: true } | { ok: false; error: string };

const clean = (s: unknown, max = 80) => String(s ?? "").trim().replace(/\s+/g, " ").slice(0, max);
const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * Someone signs themselves up from a shareable event's public page. They're matched to an
 * existing contact only when the name agrees and the phone or email does too (a shared
 * family phone shouldn't sign up the wrong person); otherwise a new contact is created.
 * They're marked Confirmed, along with any named guests they bring.
 */
export async function signUpForEvent(
  eventId: number,
  input: { person: SignupPerson; guests: SignupPerson[]; website?: string },
): Promise<SignupResult> {
  // Spam trap: bots fill the hidden field. Pretend it worked.
  if (input.website) return { ok: true };

  const first = clean(input.person.first_name);
  const last = clean(input.person.last_name);
  const phone = normalizePhone(input.person.phone);
  const email = normalizeEmail(clean(input.person.email, 120));
  if (!first || !last) return { ok: false, error: "Please enter your first and last name." };
  if (phone.length < 10) return { ok: false, error: "Please enter a valid phone number." };
  if (!isValidEmail(email)) return { ok: false, error: "Please enter a valid email address." };

  const event = await get<{
    visibility: string;
    archived_at: string | null;
    status: string;
    start_at: string;
    rsvp_deadline: string | null;
    capacity: number | null;
    plus_ones_allowed: number;
    max_guests: number;
  }>(
    "SELECT visibility, archived_at, status, start_at, rsvp_deadline, capacity, plus_ones_allowed, max_guests FROM events WHERE id = ?",
    [eventId],
  );
  if (!event || event.visibility !== "shareable" || event.archived_at || event.status === "draft") {
    return { ok: false, error: "This event isn't taking sign-ups." };
  }

  const guests = event.plus_ones_allowed
    ? input.guests
        .map((g) => ({
          first_name: clean(g.first_name),
          last_name: clean(g.last_name),
          phone: normalizePhone(g.phone),
          email: normalizeEmail(clean(g.email, 120)),
        }))
        .filter((g) => g.first_name && g.last_name)
        .slice(0, event.max_guests || 1)
    : [];

  try {
    await tx(async () => {
      const confirmed =
        (
          await get<{ n: number }>(
            "SELECT COUNT(*) AS n FROM registrations WHERE event_id = ? AND rsvp IN ('confirmed', 'reconfirmed')",
            [eventId],
          )
        )?.n ?? 0;
      const state = publicSignupState(event, confirmed);
      if (state !== "open") throw new Error(CLOSED_MESSAGE[state]);
      if (event.capacity != null && confirmed + 1 + guests.length > event.capacity) {
        const left = event.capacity - confirmed;
        throw new Error(`Only ${left} spot${left === 1 ? "" : "s"} left.${guests.length ? " Try bringing fewer guests." : ""}`);
      }

      const matches = await all<{ id: number; first_name: string; last_name: string; phone: string; email: string }>(
        "SELECT id, first_name, last_name, phone, email FROM contacts WHERE phone = ? OR email = ? ORDER BY id",
        [phone, email],
      );
      const match = matches.find((c) => same(c.first_name, first) && same(c.last_name, last));
      let contactId: number;
      const ts = now();
      if (match) {
        contactId = match.id;
        // Fill in what we didn't have; never overwrite what staff already recorded.
        if (!match.phone || !match.email) {
          await run("UPDATE contacts SET phone = ?, email = ?, updated_at = ? WHERE id = ?", [
            match.phone || phone,
            match.email || email,
            ts,
            contactId,
          ]);
        }
      } else {
        contactId = await insert(
          `INSERT INTO contacts (first_name, last_name, phone, email, source, created_at, updated_at)
           VALUES (?, ?, ?, ?, 'signup', ?, ?)`,
          [first, last, phone, email, ts, ts],
        );
      }

      const regId = await ensureRegistration(eventId, contactId);
      const reg = await get<{ rsvp: RsvpStatus; guest_of: number | null }>("SELECT rsvp, guest_of FROM registrations WHERE id = ?", [regId]);
      if (reg && reg.rsvp !== "confirmed" && reg.rsvp !== "reconfirmed") await changeRsvp(regId, "confirmed", null, "signup");

      // Someone already listed as another person's guest is confirmed, but can't bring guests of their own.
      if (guests.length && !reg?.guest_of) {
        const existing = await all<{ first_name: string; last_name: string }>(
          "SELECT c.first_name, c.last_name FROM registrations g JOIN contacts c ON c.id = g.contact_id WHERE g.guest_of = ?",
          [regId],
        );
        for (const g of guests) {
          // Signing up twice shouldn't add the same guest twice.
          if (existing.some((e) => same(e.first_name, g.first_name) && same(e.last_name, g.last_name))) continue;
          await addGuest(regId, g, null);
        }
      }
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Something went wrong. Please try again." };
  }
  return { ok: true };
}
