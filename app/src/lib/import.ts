// Pure helpers for contact import: header guessing, row mapping, validation.
// Used on both the client (mapping step) and the server (analysis/import).

import { formatPhone, isValidEmail, normalizeEmail, normalizePhone } from "./phone";

export const IMPORT_FIELDS = [
  { key: "full_name", label: "Full name", hint: "Split into first / last" },
  { key: "first_name", label: "First name" },
  { key: "last_name", label: "Last name" },
  { key: "phone", label: "Phone" },
  { key: "alt_phone", label: "Alt phone", hint: "Second number" },
  { key: "email", label: "Email" },
  { key: "street", label: "Street address" },
  { key: "city", label: "City" },
  { key: "state", label: "State" },
  { key: "zip", label: "ZIP" },
  { key: "notes", label: "Notes" },
  { key: "training_level", label: "Training level" },
  { key: "processing_level", label: "Processing level" },
  { key: "fsm_name", label: "FSM" },
  { key: "active", label: "Active", hint: "Yes / No (blank = Yes)" },
] as const;

export type ImportField = (typeof IMPORT_FIELDS)[number]["key"];
/** Field key → column index in the file (or -1 for none). */
export type ColumnMapping = Record<ImportField, number>;

const ALIASES: Record<ImportField, string[]> = {
  full_name: ["name", "full name", "fullname", "contact name", "contact", "attendee", "guest name"],
  first_name: ["first", "first name", "firstname", "fname", "given name", "given", "forename"],
  last_name: ["last", "last name", "lastname", "lname", "surname", "family name"],
  phone: ["phone", "phone number", "phonenumber", "mobile", "cell", "cell phone", "telephone", "tel", "mobile phone", "phone #", "primary phone", "home phone", "main phone"],
  alt_phone: ["alt phone", "alternate phone", "alt", "other phone", "phone 2", "phone2", "second phone", "secondary phone", "work phone", "alt phone #"],
  email: ["email", "e-mail", "email address", "e-mail address", "mail"],
  street: ["street", "address", "street address", "address 1", "address1", "address line 1", "mailing address"],
  city: ["city", "town"],
  state: ["state", "st", "province", "region"],
  zip: ["zip", "zip code", "zipcode", "postal code", "postcode", "postal"],
  notes: ["notes", "note", "comments", "comment", "remarks"],
  training_level: ["training level", "training", "training status"],
  processing_level: ["processing level", "processing", "case level", "processing status"],
  fsm_name: ["fsm", "fsm name", "field staff member"],
  active: ["active", "is active", "active?", "status"],
};

const clean = (h: string) => h.toLowerCase().replace(/[_\-.]+/g, " ").replace(/\s+/g, " ").trim();

export function guessMapping(headers: string[]): ColumnMapping {
  const cleaned = headers.map((h) => clean(String(h ?? "")));
  const used = new Set<number>();
  const mapping = Object.fromEntries(IMPORT_FIELDS.map((f) => [f.key, -1])) as ColumnMapping;
  // Exact alias matches first, then "contains" matches.
  // Specific fields claim their columns before generic ones ("Alt Phone" before "Phone").
  const order = [...IMPORT_FIELDS].sort((a, b) => Number(b.key === "alt_phone") - Number(a.key === "alt_phone"));
  for (const pass of ["exact", "contains"] as const) {
    for (const f of order) {
      if (mapping[f.key] !== -1) continue;
      const idx = cleaned.findIndex(
        (h, i) =>
          !used.has(i) &&
          ALIASES[f.key].some((a) => (pass === "exact" ? h === a : a.length > 3 && h.includes(a))),
      );
      if (idx !== -1) {
        mapping[f.key] = idx;
        used.add(idx);
      }
    }
  }
  // Only use a full-name column when separate first/last aren't present.
  if (mapping.first_name !== -1 && mapping.last_name !== -1) mapping.full_name = -1;
  return mapping;
}

/**
 * Finds the header row: some files open with a title or a note above the column
 * names. Picks the first of the top rows that names at least two known fields.
 */
export function findHeaderRow(rows: string[][]): number {
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const m = guessMapping(rows[i].map((c) => String(c ?? "")));
    const hits = Object.values(m).filter((v) => v >= 0).length;
    if (hits >= 2) return i;
  }
  return 0;
}

export type MappedRow = {
  row: number; // 1-based row number in the spreadsheet
  first_name: string;
  last_name: string;
  phone: string;
  alt_phone: string;
  email: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  notes: string;
  training_level: string;
  processing_level: string;
  fsm_name: string;
  /** 1/0 when the file says; null when there's no Active column or it's blank (= stays/becomes active) */
  active: 1 | 0 | null;
  /** Fixable problems worth showing, e.g. a phone that couldn't be read */
  warnings: string[];
  raw: string[];
};

/** Spreadsheets sometimes turn phone numbers into 8.13555E+09; those digits are gone. */
const MANGLED = /^\s*\d(\.\d+)?e[+-]?\d+\s*$/i;

function cleanPhone(value: string, label: string, warnings: string[]): string {
  if (!value) return "";
  if (MANGLED.test(value)) {
    warnings.push(`${label} was unreadable (${value.trim()}) and was left blank`);
    return "";
  }
  const digits = normalizePhone(value);
  if (digits.length > 0 && digits.length < 10) warnings.push(`${label} looks incomplete (${value.trim()})`);
  return digits;
}

function parseActive(value: string): 1 | 0 | null {
  const v = value.trim().toLowerCase();
  if (!v) return null;
  if (["no", "n", "false", "0", "inactive", "x"].includes(v)) return 0;
  return 1;
}

export function splitFullName(full: string): [string, string] {
  const s = full.trim().replace(/\s+/g, " ");
  if (!s) return ["", ""];
  if (s.includes(",")) {
    // "Last, First"
    const [last, first] = s.split(",").map((p) => p.trim());
    return [first ?? "", last ?? ""];
  }
  const parts = s.split(" ");
  if (parts.length === 1) return [parts[0], ""];
  return [parts.slice(0, -1).join(" "), parts[parts.length - 1]];
}

/**
 * `firstRow` is the spreadsheet row number of rows[0] (header row + 1). Blank rows are
 * skipped here (not beforehand) so every row keeps its real spreadsheet row number.
 */
export function applyMapping(rows: string[][], mapping: ColumnMapping, firstRow = 2): MappedRow[] {
  const at = (r: string[], k: ImportField) => (mapping[k] >= 0 ? String(r[mapping[k]] ?? "").trim() : "");
  return rows.flatMap((r, i): MappedRow[] => {
    if (!r.some((c) => String(c ?? "").trim() !== "")) return [];
    let first = at(r, "first_name");
    let last = at(r, "last_name");
    if ((!first || !last) && mapping.full_name >= 0) {
      const [f, l] = splitFullName(at(r, "full_name"));
      first ||= f;
      last ||= l;
    }
    const warnings: string[] = [];
    let phone = cleanPhone(at(r, "phone"), "Phone", warnings);
    let alt = cleanPhone(at(r, "alt_phone"), "Alt phone", warnings);
    if (!phone && alt) [phone, alt] = [alt, ""]; // only number they have becomes their main phone
    if (alt === phone) alt = "";
    const email = normalizeEmail(at(r, "email"));
    if (!phone && !email) warnings.push("No phone or email");
    return [{
      row: i + firstRow,
      first_name: first,
      last_name: last,
      phone,
      alt_phone: alt,
      email,
      street: at(r, "street"),
      city: at(r, "city"),
      state: at(r, "state"),
      zip: at(r, "zip"),
      notes: at(r, "notes"),
      training_level: at(r, "training_level"),
      processing_level: at(r, "processing_level"),
      fsm_name: at(r, "fsm_name"),
      active: parseActive(at(r, "active")),
      warnings,
      raw: r.map((c) => String(c ?? "")),
    }];
  });
}

/**
 * Returns a reason string if the row can't be imported. Only a name is required;
 * a missing or unreadable phone is a warning (see MappedRow.warnings), not an error.
 */
export function rowError(r: Pick<MappedRow, "first_name" | "last_name" | "email">): string | null {
  const missing = [!r.first_name && "first name", !r.last_name && "last name"].filter(Boolean);
  if (missing.length) return `Missing ${missing.join(" and ")}`;
  if (r.email && !isValidEmail(r.email)) return "Invalid email";
  return null;
}

/** Same person by name (case and extra spaces ignored). Used with a shared phone to tell people apart. */
export function sameName(a: { first_name: string; last_name: string }, b: { first_name: string; last_name: string }): boolean {
  const n = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
  return n(a.first_name) === n(b.first_name) && n(a.last_name) === n(b.last_name);
}

/** Drop rows that are entirely empty (common at the bottom of spreadsheets). */
export function dropBlankRows(rows: string[][]): string[][] {
  return rows.filter((r) => r.some((c) => String(c ?? "").trim() !== ""));
}

/* ------------------------- Merging into existing contacts ------------------------- */

/**
 * What to do with a row that matches an existing contact:
 * - skip:   leave the contact exactly as it is
 * - merge:  fill in blank fields; new phone numbers are added, never replace one
 * - update: the file's values win; the old phone/email are kept as the 2nd number or in notes
 * - new:    it's a different person (e.g. family sharing an email): add them as a new contact
 */
export type MergeChoice = "skip" | "merge" | "update" | "new";

export const MERGE_FIELDS = [
  "first_name", "last_name", "phone", "alt_phone", "email", "street", "city", "state", "zip", "notes",
  "training_level", "processing_level", "fsm_name",
] as const;
export type MergeField = (typeof MERGE_FIELDS)[number];
export type ExistingContact = Record<MergeField, string> & { id: number; active: number };

type Incoming = Pick<MappedRow, MergeField | "active">;
export type MergePlan = Partial<Record<MergeField, string>> & { active?: 0 | 1 };

const PLAIN: MergeField[] = ["first_name", "last_name", "street", "city", "state", "zip", "training_level", "processing_level", "fsm_name"];

/** The new values to write for `choice` (only fields that actually change). Pure: used for the preview and the save. */
export function planMerge(existing: ExistingContact, incoming: Incoming, choice: MergeChoice): MergePlan {
  if (choice === "skip" || choice === "new") return {};
  const plan: MergePlan = {};
  const extraNotes: string[] = [];

  for (const k of PLAIN) {
    const v = incoming[k];
    if (v && v !== existing[k] && (choice === "update" || !existing[k])) plan[k] = v;
  }

  // Phones: two slots. Merge keeps the existing order and adds new numbers; update puts the
  // file's numbers first. Either way, a number that doesn't fit goes into notes, not away.
  const mine = [existing.phone, existing.alt_phone].filter(Boolean);
  const theirs = [incoming.phone, incoming.alt_phone].filter(Boolean);
  const ordered = [...new Set(choice === "update" ? [...theirs, ...mine] : [...mine, ...theirs])];
  const [phone = "", alt = "", ...overflow] = ordered;
  if (phone !== existing.phone) plan.phone = phone;
  if (alt !== existing.alt_phone) plan.alt_phone = alt;
  for (const p of overflow) {
    if (!existing.notes.includes(formatPhone(p))) extraNotes.push(`Other phone: ${formatPhone(p)}`);
  }

  // One email per contact: keep the other one in notes.
  if (incoming.email && incoming.email !== existing.email) {
    if (!existing.email) plan.email = incoming.email;
    else if (choice === "update") {
      plan.email = incoming.email;
      if (!existing.notes.includes(existing.email)) extraNotes.push(`Previous email: ${existing.email}`);
    } else if (!existing.notes.includes(incoming.email)) extraNotes.push(`Other email: ${incoming.email}`);
  }

  if (incoming.notes && !existing.notes.includes(incoming.notes)) extraNotes.push(incoming.notes);
  if (extraNotes.length) plan.notes = [existing.notes, ...extraNotes].filter(Boolean).join("\n");

  if (choice === "update" && incoming.active !== null && incoming.active !== existing.active) plan.active = incoming.active;
  return plan;
}

/** Numbers in the row that the existing contact doesn't have yet. */
export function newPhones(existing: Pick<ExistingContact, "phone" | "alt_phone">, incoming: Pick<MappedRow, "phone" | "alt_phone">): string[] {
  return [incoming.phone, incoming.alt_phone].filter((p) => p && p !== existing.phone && p !== existing.alt_phone);
}
