"use server";

import { refresh } from "next/cache";
import { actionUser } from "@/lib/auth";
import { all, get, now, run, tx } from "@/lib/db";
import { MERGE_FIELDS, planMerge, type ExistingContact } from "@/lib/import";

type Reg = {
  id: number;
  event_id: number;
  rsvp: string;
  attendance: string;
  walk_in: number;
  last_called_at: string | null;
  called_by: number | null;
  checked_in_at: string | null;
  guest_of: number | null;
};

const REG_COLS = "id, event_id, rsvp, attendance, walk_in, last_called_at, called_by, checked_in_at, guest_of";
const later = (a: string | null, b: string | null) => (!a ? b : !b ? a : a > b ? a : b);

/**
 * Merges `mergeIds` into `keepId`. The kept contact's name stays; blank fields are filled
 * in and other phone numbers and emails are added (2nd phone, or notes), never replaced.
 * Event history moves over: where both were on the same event, one registration is kept
 * with the more informative status, and its notes, calls and changes are combined.
 * Each merged contact is snapshotted in contact_merges before it's removed.
 */
export async function mergeContacts(keepId: number, mergeIds: number[]): Promise<{ merged: number }> {
  const user = await actionUser(["admin"]);
  const others = [...new Set(mergeIds)].filter((id) => id !== keepId);
  if (!others.length) throw new Error("Pick at least one contact to merge.");

  await tx(async () => {
    for (const otherId of others) {
      const keep = await get<ExistingContact & { division: number | null }>(
        `SELECT id, ${MERGE_FIELDS.join(", ")}, active, division FROM contacts WHERE id = ?`,
        [keepId],
      );
      const other = await get<Record<string, unknown> & ExistingContact & { division: number | null }>("SELECT * FROM contacts WHERE id = ?", [otherId]);
      if (!keep || !other) throw new Error("One of those contacts no longer exists. Refresh and try again.");

      // 1. Contact details: the other contact is treated like an import row in "add new info" mode.
      const plan: Record<string, string | number> = planMerge(keep, { ...other, active: null }, "merge");
      if (keep.division == null && other.division != null) plan.division = other.division;
      if (!keep.active && other.active) plan.active = 1;
      const fields = Object.keys(plan);
      if (fields.length) {
        await run(`UPDATE contacts SET ${fields.map((k) => `${k} = ?`).join(", ")}, updated_at = ? WHERE id = ?`, [
          ...fields.map((k) => plan[k]),
          now(),
          keepId,
        ]);
      }

      // 2. Event history.
      const keepRegs = new Map((await all<Reg>(`SELECT ${REG_COLS} FROM registrations WHERE contact_id = ?`, [keepId])).map((r) => [r.event_id, r]));
      const otherRegs = await all<Reg>(`SELECT ${REG_COLS} FROM registrations WHERE contact_id = ?`, [otherId]);
      for (const r of otherRegs) {
        const k = keepRegs.get(r.event_id);
        if (!k) {
          await run("UPDATE registrations SET contact_id = ? WHERE id = ?", [keepId, r.id]);
          continue;
        }
        for (const table of ["call_notes", "call_logs", "status_changes"]) {
          await run(`UPDATE ${table} SET registration_id = ? WHERE registration_id = ?`, [k.id, r.id]);
        }
        await run("UPDATE registrations SET guest_of = ? WHERE guest_of = ?", [k.id, r.id]);
        const rsvp = k.rsvp === "no_data" ? r.rsvp : k.rsvp;
        const attended = k.attendance === "pending" && r.attendance !== "pending";
        const guestOf = k.guest_of ?? (r.guest_of && r.guest_of !== k.id ? r.guest_of : null);
        await run(
          `UPDATE registrations SET rsvp = ?, attendance = ?, checked_in_at = ?, walk_in = ?, last_called_at = ?, called_by = ?, guest_of = ?
            WHERE id = ?`,
          [
            rsvp,
            attended ? r.attendance : k.attendance,
            attended ? r.checked_in_at : k.checked_in_at,
            Math.max(k.walk_in, r.walk_in),
            later(k.last_called_at, r.last_called_at),
            k.called_by ?? r.called_by,
            guestOf,
            k.id,
          ],
        );
        await run("DELETE FROM registrations WHERE id = ?", [r.id]);
      }
      // Someone can't be their own guest after the merge.
      await run(
        `UPDATE registrations SET guest_of = NULL
          WHERE contact_id = ? AND guest_of IN (SELECT id FROM registrations WHERE contact_id = ?)`,
        [keepId, keepId],
      );

      // 3. Tags and import history follow the person.
      await run(
        `INSERT INTO contact_tags (contact_id, tag_id, added_by, added_at)
         SELECT ?, tag_id, added_by, added_at FROM contact_tags WHERE contact_id = ? ON CONFLICT DO NOTHING`,
        [keepId, otherId],
      );
      await run("UPDATE import_changes SET contact_id = ? WHERE contact_id = ?", [keepId, otherId]);

      // 4. Keep a copy of what's being removed, then remove it.
      await run("INSERT INTO contact_merges (kept_id, merged_id, snapshot, changes, user_id, created_at) VALUES (?, ?, ?, ?, ?, ?)", [
        keepId,
        otherId,
        JSON.stringify({ contact: other, registrations: otherRegs.map((r) => r.id) }),
        JSON.stringify(plan),
        user.id,
        now(),
      ]);
      await run("DELETE FROM contacts WHERE id = ?", [otherId]);
    }
  });
  refresh();
  return { merged: others.length };
}

/** Remembers that these contacts are different people, so they're no longer suggested. */
export async function markNotDuplicates(ids: number[]): Promise<void> {
  const user = await actionUser(["admin"]);
  const list = [...new Set(ids)].sort((a, b) => a - b);
  const pairs: [number, number][] = [];
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) pairs.push([list[i], list[j]]);
  if (!pairs.length) return;
  await run(
    `INSERT INTO contact_not_duplicates (a_id, b_id, user_id, created_at) VALUES ${pairs.map(() => "(?, ?, ?, ?)").join(", ")}
     ON CONFLICT DO NOTHING`,
    pairs.flatMap(([a, b]) => [a, b, user.id, now()]),
  );
  refresh();
}
