"use server";

import { refresh } from "next/cache";
import { actionUser } from "@/lib/auth";
import { all, get, now, run, tx } from "@/lib/db";
import { matchName, parseName, type Candidate } from "@/lib/name-match";
import type { RsvpStatus } from "@/lib/status";

export type ConfirmCandidate = Candidate & { name: string; phone: string; status: RsvpStatus | null };
export type ConfirmMatch = {
  input: string;
  kind: "exact" | "ambiguous" | "close" | "none";
  /** exact: one; ambiguous/close: the choices, best first */
  options: (ConfirmCandidate & { why?: string })[];
};

/** Match uploaded names against contacts, with each match's current status on this event. */
export async function matchConfirmNames(eventId: number, names: string[]): Promise<ConfirmMatch[]> {
  await actionUser(["admin"]);
  const [contacts, regs] = await Promise.all([
    all<Candidate & { phone: string }>("SELECT id, first_name, last_name, phone FROM contacts"),
    all<{ contact_id: number; rsvp: RsvpStatus }>("SELECT contact_id, rsvp FROM registrations WHERE event_id = ?", [eventId]),
  ]);
  const statusOf = new Map(regs.map((r) => [r.contact_id, r.rsvp]));
  const enrich = (c: Candidate & { phone: string }): ConfirmCandidate => ({
    ...c,
    name: `${c.first_name} ${c.last_name}`,
    status: statusOf.get(c.id) ?? null,
  });

  return names.map((input) => {
    const m = matchName(input, contacts);
    if (m.kind === "exact") return { input, kind: "exact", options: [enrich(m.contact)] };
    if (m.kind === "ambiguous") return { input, kind: "ambiguous", options: m.options.map(enrich) };
    if (m.kind === "close") return { input, kind: "close", options: m.options.map((o) => ({ ...enrich(o.contact), why: o.why })) };
    return { input, kind: "none", options: [] };
  });
}

export type ConfirmResult = { confirmed: number; already: number; addedToList: number; created: number };

/**
 * Mark people Confirmed for an event (adding them to its list if needed). Anyone already
 * Confirmed or Reconfirmed is left as-is. `newPeople` are created as contacts first.
 * Written in batches so a few hundred names finish quickly. Audited as via = 'upload'.
 */
export async function applyConfirms(
  eventId: number,
  input: { contactIds: number[]; newPeople: string[] },
): Promise<ConfirmResult> {
  const user = await actionUser(["admin"]);
  if (!(await get("SELECT id FROM events WHERE id = ?", [eventId]))) throw new Error("Event not found");
  const result: ConfirmResult = { confirmed: 0, already: 0, addedToList: 0, created: 0 };
  const ts = now();

  await tx(async () => {
    const ids = [...new Set(input.contactIds)];

    // 1. New contacts for names that weren't found (when asked).
    const fresh = input.newPeople.map((n) => parseName(n)).filter((p) => p.first && p.last);
    for (let i = 0; i < fresh.length; i += 100) {
      const chunk = fresh.slice(i, i + 100);
      const cap = (s: string) => s.replace(/\b\p{L}/gu, (c) => c.toUpperCase());
      const rows = await all<{ id: number }>(
        `INSERT INTO contacts (first_name, last_name, source, created_at, updated_at)
         VALUES ${chunk.map(() => "(?, ?, 'manual', ?, ?)").join(", ")} RETURNING id`,
        chunk.flatMap((p) => [cap([p.first, ...p.middle].join(" ")), cap(p.last), ts, ts]),
      );
      ids.push(...rows.map((r) => r.id));
      result.created += rows.length;
    }
    if (ids.length === 0) return;

    for (let i = 0; i < ids.length; i += 200) {
      const chunk = ids.slice(i, i + 200);
      const marks = chunk.map(() => "?").join(", ");

      // 2. Put everyone on the event's list.
      const added = await run(
        `INSERT INTO registrations (event_id, contact_id) VALUES ${chunk.map(() => "(?, ?)").join(", ")} ON CONFLICT DO NOTHING`,
        chunk.flatMap((cid) => [eventId, cid]),
      );
      result.addedToList += added.changes;

      // 3. Confirm whoever isn't already confirmed (and the guests they bring, who follow them).
      const regs = await all<{ id: number; rsvp: RsvpStatus }>(
        `SELECT id, rsvp FROM registrations WHERE event_id = ? AND contact_id IN (${marks})`,
        [eventId, ...chunk],
      );
      const toConfirm = regs.filter((r) => r.rsvp !== "confirmed" && r.rsvp !== "reconfirmed");
      result.already += regs.length - toConfirm.length;
      if (toConfirm.length === 0) continue;
      const guests = await all<{ id: number; rsvp: RsvpStatus }>(
        `SELECT id, rsvp FROM registrations WHERE guest_of IN (${toConfirm.map(() => "?").join(", ")})
           AND rsvp NOT IN ('confirmed', 'reconfirmed')`,
        toConfirm.map((r) => r.id),
      );
      const changed = [...toConfirm, ...guests];
      await run(`UPDATE registrations SET rsvp = 'confirmed' WHERE id IN (${changed.map(() => "?").join(", ")})`, changed.map((r) => r.id));
      await run(
        `INSERT INTO status_changes (registration_id, kind, from_value, to_value, user_id, created_at, via)
         VALUES ${changed.map(() => "(?, 'rsvp', ?, 'confirmed', ?, ?, 'upload')").join(", ")}`,
        changed.flatMap((r) => [r.id, r.rsvp, user.id, ts]),
      );
      result.confirmed += toConfirm.length;
    }
  });

  refresh();
  return result;
}
