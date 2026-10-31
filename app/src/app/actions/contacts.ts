"use server";

import { refresh } from "next/cache";
import { actionUser } from "@/lib/auth";
import { all, get, insert, now, run, tx } from "@/lib/db";
import { isValidEmail, normalizeEmail, normalizePhone } from "@/lib/phone";
import { rowError, type MappedRow } from "@/lib/import";

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
  };
}

/** Guests (someone's plus-one) may have just a name; everyone else needs a phone or email. */
function validate(c: ContactInput, opts: { guest?: boolean } = {}): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!c.first_name) errors.first_name = "Required";
  if (!c.last_name) errors.last_name = "Required";
  if (!opts.guest && !c.phone && !c.email) errors.phone = "Add a phone or an email";
  if (c.email && !isValidEmail(c.email)) errors.email = "That doesn't look like an email";
  if (c.phone && c.phone.length < 7) errors.phone = "Phone number looks too short";
  return errors;
}

async function duplicates(phone: string, email: string, excludeId?: number): Promise<DuplicateMatch[]> {
  if (!phone && !email) return [];
  const rows = await all<{ id: number; first_name: string; last_name: string; phone: string; email: string }>(
    `SELECT id, first_name, last_name, phone, email FROM contacts
      WHERE ((?::text <> '' AND phone = ?::text) OR (?::text <> '' AND email = ?::text)) AND id <> ? LIMIT 5`,
    [phone, phone, email, email, excludeId ?? -1],
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
    `INSERT INTO contacts (first_name, last_name, phone, email, street, city, state, zip, notes, source, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'manual', ?, ?)`,
    [c.first_name, c.last_name, c.phone, c.email, c.street, c.city, c.state, c.zip, c.notes, ts, ts],
  );
  refresh();
  return { ok: true as const, id };
}

export async function updateContact(id: number, input: ContactInput) {
  await actionUser(["admin"]);
  const c = clean(input);
  const current = await get<{ source: string }>("SELECT source FROM contacts WHERE id = ?", [id]);
  const errors = validate(c, { guest: current?.source === "guest" });
  if (Object.keys(errors).length) return { ok: false as const, errors };
  await run(
    `UPDATE contacts SET first_name = ?, last_name = ?, phone = ?, email = ?, street = ?, city = ?, state = ?, zip = ?,
            notes = ?, updated_at = ? WHERE id = ?`,
    [c.first_name, c.last_name, c.phone, c.email, c.street, c.city, c.state, c.zip, c.notes, now(), id],
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
  const rows = await all<{ id: number; first_name: string; last_name: string; phone: string; email: string }>(
    "SELECT id, first_name, last_name, phone, email FROM contacts",
  );
  const byPhone = new Map<string, { id: number; name: string }>();
  const byEmail = new Map<string, { id: number; name: string }>();
  for (const r of rows) {
    const m = { id: r.id, name: `${r.first_name} ${r.last_name}` };
    if (r.phone && !byPhone.has(r.phone)) byPhone.set(r.phone, m);
    if (r.email && !byEmail.has(r.email)) byEmail.set(r.email, m);
  }
  return (phone: string, email: string): ExistingMatch =>
    (phone && byPhone.get(phone)) || (email && byEmail.get(email)) || null;
}

/** For each row (phone/email already normalized), the existing contact it likely duplicates. */
export async function matchExisting(rows: { phone: string; email: string }[]): Promise<ExistingMatch[]> {
  await actionUser(["admin"]);
  const find = await existingIndex();
  return rows.map((r) => find(normalizePhone(r.phone), normalizeEmail(r.email)));
}

export type ImportResult = {
  added: number;
  updated: number;
  skipped: number;
  errors: { row: number; reason: string }[];
};

const UPDATABLE = ["first_name", "last_name", "phone", "email", "street", "city", "state", "zip", "notes"] as const;

/** Imports one chunk. Rows the client flagged as in-file duplicates should not be sent. */
export async function importContacts(rows: ImportRow[], mode: "skip" | "update"): Promise<ImportResult> {
  await actionUser(["admin"]);
  const result: ImportResult = { added: 0, updated: 0, skipped: 0, errors: [] };
  const find = await existingIndex();
  const ts = now();
  const toAdd: ImportRow[] = [];
  await tx(async () => {
    for (const raw of rows) {
      const r = { ...raw, phone: normalizePhone(raw.phone), email: normalizeEmail(raw.email) };
      const err = rowError({ ...r, raw: [] });
      if (err) {
        result.errors.push({ row: r.row, reason: err });
        continue;
      }
      const match = find(r.phone, r.email);
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
        if (sets.length) {
          await run(`UPDATE contacts SET ${sets.join(", ")}, updated_at = ? WHERE id = ?`, [...vals, ts, match.id]);
        }
        result.updated++;
        continue;
      }
      toAdd.push(r);
      result.added++;
    }
    // New contacts go in as multi-row INSERTs: one round trip per 100 rows instead of per row.
    for (let i = 0; i < toAdd.length; i += 100) {
      const chunk = toAdd.slice(i, i + 100);
      await run(
        `INSERT INTO contacts (first_name, last_name, phone, email, street, city, state, zip, notes, source, created_at, updated_at)
         VALUES ${chunk.map(() => "(?, ?, ?, ?, ?, ?, ?, ?, ?, 'import', ?, ?)").join(", ")}`,
        chunk.flatMap((r) => [r.first_name, r.last_name, r.phone, r.email, r.street, r.city, r.state, r.zip, r.notes, ts, ts]),
      );
    }
  });
  return result;
}

export async function contactCount() {
  await actionUser(["admin"]);
  return (await get<{ n: number }>("SELECT COUNT(*) AS n FROM contacts"))!.n;
}
