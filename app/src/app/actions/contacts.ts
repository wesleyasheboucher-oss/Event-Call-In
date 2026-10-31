"use server";

import { refresh } from "next/cache";
import { findOrCreateTag, tagContacts } from "@/lib/tags";
import { actionUser } from "@/lib/auth";
import { all, get, insert, now, run, tx } from "@/lib/db";
import { isValidEmail, normalizeEmail, normalizePhone } from "@/lib/phone";
import { rowError, sameName, type MappedRow } from "@/lib/import";
import { CONTACT_DIVISIONS } from "@/lib/status";

export type ContactInput = {
  first_name: string;
  last_name: string;
  phone: string;
  email: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  notes: string;
  alt_phone: string;
  training_level: string;
  processing_level: string;
  fsm_name: string;
  active: boolean;
};

export type DuplicateMatch = { id: number; name: string; phone: string; email: string; matched: "phone" | "email" | "both" };

function clean(input: ContactInput): ContactInput {
  return {
    first_name: input.first_name.trim(),
    last_name: input.last_name.trim(),
    phone: normalizePhone(input.phone),
    email: normalizeEmail(input.email),
    street: input.street.trim(),
    city: input.city.trim(),
    state: input.state.trim(),
    zip: input.zip.trim(),
    notes: input.notes.trim(),
    alt_phone: normalizePhone(input.alt_phone),
    training_level: input.training_level.trim(),
    processing_level: input.processing_level.trim(),
    fsm_name: input.fsm_name.trim(),
    active: input.active,
  };
}

/** A name is required; phone and email are optional (lists often arrive without them). */
function validate(c: ContactInput): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!c.first_name) errors.first_name = "Required";
  if (!c.last_name) errors.last_name = "Required";
  if (c.email && !isValidEmail(c.email)) errors.email = "That doesn't look like an email";
  if (c.phone && c.phone.length < 7) errors.phone = "Phone number looks too short";
  if (c.alt_phone && c.alt_phone.length < 7) errors.alt_phone = "Phone number looks too short";
  return errors;
}

async function duplicates(phone: string, email: string, excludeId?: number): Promise<DuplicateMatch[]> {
  if (!phone && !email) return [];
  const rows = await all<{ id: number; first_name: string; last_name: string; phone: string; email: string }>(
    `SELECT id, first_name, last_name, phone, email FROM contacts
      WHERE ((?::text <> '' AND (phone = ?::text OR alt_phone = ?::text)) OR (?::text <> '' AND email = ?::text)) AND id <> ? LIMIT 5`,
    [phone, phone, phone, email, email, excludeId ?? -1],
  );
  return rows.map((c): DuplicateMatch => {
    const p = !!phone && c.phone === phone;
    const e = !!email && c.email === email;
    return {
      id: c.id,
      name: `${c.first_name} ${c.last_name}`,
      phone: c.phone,
      email: c.email,
      matched: p && e ? "both" : p ? "phone" : "email",
    };
  });
}

/** Toggle a contact's division (any signed-in user; null clears it). */
export async function setContactDivision(contactId: number, division: number | null): Promise<void> {
  await actionUser();
  if (division !== null && !(CONTACT_DIVISIONS as readonly number[]).includes(division)) throw new Error("Unknown division");
  await run("UPDATE contacts SET division = ?, updated_at = ? WHERE id = ?", [division, now(), contactId]);
}

/** Quick Active / Inactive switch from a contact's drawer. */
export async function setContactActive(contactId: number, active: boolean): Promise<void> {
  await actionUser();
  await run("UPDATE contacts SET active = ?, updated_at = ? WHERE id = ?", [active ? 1 : 0, now(), contactId]);
}

/** Values already in use, offered as suggestions in the contact form. */
export async function fetchProfileOptions(): Promise<{ training: string[]; processing: string[]; fsm: string[] }> {
  await actionUser();
  const distinct = async (col: "training_level" | "processing_level" | "fsm_name") =>
    (await all<{ v: string }>(`SELECT DISTINCT ${col} AS v FROM contacts WHERE ${col} <> '' ORDER BY 1`)).map((r) => r.v);
  const [training, processing, fsm] = await Promise.all([
    distinct("training_level"),
    distinct("processing_level"),
    distinct("fsm_name"),
  ]);
  return { training, processing, fsm };
}

export async function checkDuplicates(phone: string, email: string, excludeId?: number) {
  await actionUser(["admin"]);
  return duplicates(normalizePhone(phone), normalizeEmail(email), excludeId);
}

export async function createContact(input: ContactInput) {
  await actionUser(["admin"]);
  const c = clean(input);
  const errors = validate(c);
  if (Object.keys(errors).length) return { ok: false as const, errors };
  const ts = now();
  const id = await insert(
    `INSERT INTO contacts (first_name, last_name, phone, email, street, city, state, zip, notes, alt_phone,
                           training_level, processing_level, fsm_name, active, source, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'manual', ?, ?)`,
    [c.first_name, c.last_name, c.phone, c.email, c.street, c.city, c.state, c.zip, c.notes, c.alt_phone,
     c.training_level, c.processing_level, c.fsm_name, c.active ? 1 : 0, ts, ts],
  );
  refresh();
  return { ok: true as const, id };
}

export async function updateContact(id: number, input: ContactInput) {
  await actionUser(["admin"]);
  const c = clean(input);
  const errors = validate(c);
  if (Object.keys(errors).length) return { ok: false as const, errors };
  await run(
    `UPDATE contacts SET first_name = ?, last_name = ?, phone = ?, email = ?, street = ?, city = ?, state = ?, zip = ?,
            notes = ?, alt_phone = ?, training_level = ?, processing_level = ?, fsm_name = ?, active = ?, updated_at = ?
      WHERE id = ?`,
    [c.first_name, c.last_name, c.phone, c.email, c.street, c.city, c.state, c.zip, c.notes, c.alt_phone,
     c.training_level, c.processing_level, c.fsm_name, c.active ? 1 : 0, now(), id],
  );
  refresh();
  return { ok: true as const, id };
}

export async function deleteContact(id: number) {
  await actionUser(["admin"]);
  await run("DELETE FROM contacts WHERE id = ?", [id]);
  refresh();
}

/* --------------------------------- Import --------------------------------- */

export type ImportRow = Omit<MappedRow, "raw">;
export type ExistingMatch = { id: number; name: string } | null;

async function existingIndex() {
  const rows = await all<{ id: number; first_name: string; last_name: string; phone: string; alt_phone: string; email: string }>(
    "SELECT id, first_name, last_name, phone, alt_phone, email FROM contacts",
  );
  type Known = { id: number; name: string; first_name: string; last_name: string };
  const byPhone = new Map<string, Known[]>();
  const byEmail = new Map<string, Known>();
  const byName = new Map<string, Known>();
  const nameKey = (k: { first_name: string; last_name: string }) =>
    `${k.first_name} ${k.last_name}`.toLowerCase().replace(/\s+/g, " ").trim();
  for (const r of rows) {
    const m = { id: r.id, name: `${r.first_name} ${r.last_name}`, first_name: r.first_name, last_name: r.last_name };
    for (const p of [r.phone, r.alt_phone]) if (p) byPhone.set(p, [...(byPhone.get(p) ?? []), m]);
    if (r.email && !byEmail.has(r.email)) byEmail.set(r.email, m);
    if (!byName.has(nameKey(r))) byName.set(nameKey(r), m);
  }
  // Same email = same person. Same phone only counts with the same name too: households and
  // offices share numbers.
  return (phone: string, email: string, altPhone = "", who?: { first_name: string; last_name: string }): ExistingMatch => {
    const e = email ? byEmail.get(email) : undefined;
    if (e) return { id: e.id, name: e.name };
    if (!who) return null;
    // Nothing to match on but the name: the same full name is treated as the same person.
    if (!phone && !altPhone && !email) {
      const n = byName.get(nameKey(who));
      return n ? { id: n.id, name: n.name } : null;
    }
    const p = [phone, altPhone]
      .filter(Boolean)
      .flatMap((x) => byPhone.get(x) ?? [])
      .find((k) => sameName(k, who));
    return p ? { id: p.id, name: p.name } : null;
  };
}

/** For each row (phone/email already normalized), the existing contact it likely duplicates. */
export async function matchExisting(
  rows: { phone: string; email: string; alt_phone?: string; first_name: string; last_name: string }[],
): Promise<ExistingMatch[]> {
  await actionUser(["admin"]);
  const find = await existingIndex();
  return rows.map((r) => find(normalizePhone(r.phone), normalizeEmail(r.email), normalizePhone(r.alt_phone), r));
}

export type ImportResult = {
  added: number;
  updated: number;
  skipped: number;
  errors: { row: number; reason: string }[];
};

const UPDATABLE = [
  "first_name", "last_name", "phone", "email", "street", "city", "state", "zip", "notes",
  "alt_phone", "training_level", "processing_level", "fsm_name",
] as const;

/**
 * Imports one chunk. Rows the client flagged as in-file duplicates should not be sent.
 * `tagName` (optional) tags everyone added or updated, e.g. "Fully Paid – Oct 2026".
 */
export async function importContacts(rows: ImportRow[], mode: "skip" | "update", tagName?: string): Promise<ImportResult> {
  const user = await actionUser(["admin"]);
  const touched: number[] = [];
  const result: ImportResult = { added: 0, updated: 0, skipped: 0, errors: [] };
  const find = await existingIndex();
  const ts = now();
  const toAdd: ImportRow[] = [];
  await tx(async () => {
    for (const raw of rows) {
      const r = { ...raw, phone: normalizePhone(raw.phone), alt_phone: normalizePhone(raw.alt_phone), email: normalizeEmail(raw.email) };
      const err = rowError(r);
      if (err) {
        result.errors.push({ row: r.row, reason: err });
        continue;
      }
      const match = find(r.phone, r.email, r.alt_phone, r);
      if (match) {
        if (mode === "skip") {
          result.skipped++;
          continue;
        }
        // Only overwrite with non-empty incoming values.
        const sets: string[] = [];
        const vals: (string | number)[] = [];
        for (const k of UPDATABLE) {
          if (r[k]) {
            sets.push(`${k} = ?`);
            vals.push(r[k]);
          }
        }
        if (r.active !== null) {
          sets.push("active = ?");
          vals.push(r.active);
        }
        if (sets.length) {
          await run(`UPDATE contacts SET ${sets.join(", ")}, updated_at = ? WHERE id = ?`, [...vals, ts, match.id]);
        }
        result.updated++;
        touched.push(match.id);
        continue;
      }
      toAdd.push(r);
      result.added++;
    }
    // New contacts go in as multi-row INSERTs: one round trip per 100 rows instead of per row.
    for (let i = 0; i < toAdd.length; i += 100) {
      const chunk = toAdd.slice(i, i + 100);
      const ids = await all<{ id: number }>(
        `INSERT INTO contacts (first_name, last_name, phone, email, street, city, state, zip, notes, alt_phone,
                               training_level, processing_level, fsm_name, active, source, created_at, updated_at)
         VALUES ${chunk.map(() => "(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'import', ?, ?)").join(", ")}
         RETURNING id`,
        chunk.flatMap((r) => [
          r.first_name, r.last_name, r.phone, r.email, r.street, r.city, r.state, r.zip, r.notes, r.alt_phone,
          r.training_level, r.processing_level, r.fsm_name, r.active ?? 1, ts, ts,
        ]),
      );
      touched.push(...ids.map((x) => x.id));
    }
    if (tagName?.trim() && touched.length) {
      const tag = await findOrCreateTag(tagName, user.id);
      await tagContacts(touched, tag.id, user.id);
    }
  });
  return result;
}

export async function contactCount() {
  await actionUser(["admin"]);
  return (await get<{ n: number }>("SELECT COUNT(*) AS n FROM contacts"))!.n;
}
