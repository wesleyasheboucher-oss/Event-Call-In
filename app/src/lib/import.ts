// Pure helpers for contact import: header guessing, row mapping, validation.
// Used on both the client (mapping step) and the server (analysis/import).

import { isValidEmail, normalizeEmail, normalizePhone } from "./phone";

export const IMPORT_FIELDS = [
  { key: "full_name", label: "Full name", hint: "Split into first / last" },
  { key: "first_name", label: "First name" },
  { key: "last_name", label: "Last name" },
  { key: "phone", label: "Phone" },
  { key: "email", label: "Email" },
  { key: "street", label: "Street address" },
  { key: "city", label: "City" },
  { key: "state", label: "State" },
  { key: "zip", label: "ZIP" },
  { key: "notes", label: "Notes" },
] as const;

export type ImportField = (typeof IMPORT_FIELDS)[number]["key"];
/** Field key → column index in the file (or -1 for none). */
export type ColumnMapping = Record<ImportField, number>;

const ALIASES: Record<ImportField, string[]> = {
  full_name: ["name", "full name", "fullname", "contact name", "contact", "attendee", "guest name"],
  first_name: ["first", "first name", "firstname", "fname", "given name", "given", "forename"],
  last_name: ["last", "last name", "lastname", "lname", "surname", "family name"],
  phone: ["phone", "phone number", "phonenumber", "mobile", "cell", "cell phone", "telephone", "tel", "mobile phone", "phone #", "primary phone"],
  email: ["email", "e-mail", "email address", "e-mail address", "mail"],
  street: ["street", "address", "street address", "address 1", "address1", "address line 1", "mailing address"],
  city: ["city", "town"],
  state: ["state", "st", "province", "region"],
  zip: ["zip", "zip code", "zipcode", "postal code", "postcode", "postal"],
  notes: ["notes", "note", "comments", "comment", "remarks"],
};

const clean = (h: string) => h.toLowerCase().replace(/[_\-.]+/g, " ").replace(/\s+/g, " ").trim();

export function guessMapping(headers: string[]): ColumnMapping {
  const cleaned = headers.map((h) => clean(String(h ?? "")));
  const used = new Set<number>();
  const mapping = Object.fromEntries(IMPORT_FIELDS.map((f) => [f.key, -1])) as ColumnMapping;
  // Exact alias matches first, then "contains" matches.
  for (const pass of ["exact", "contains"] as const) {
    for (const f of IMPORT_FIELDS) {
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

export type MappedRow = {
  row: number; // 1-based row number in the file, counting the header as row 1
  first_name: string;
  last_name: string;
  phone: string;
  email: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  notes: string;
  raw: string[];
};

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

export function applyMapping(rows: string[][], mapping: ColumnMapping): MappedRow[] {
  const at = (r: string[], k: ImportField) => (mapping[k] >= 0 ? String(r[mapping[k]] ?? "").trim() : "");
  return rows.map((r, i) => {
    let first = at(r, "first_name");
    let last = at(r, "last_name");
    if ((!first || !last) && mapping.full_name >= 0) {
      const [f, l] = splitFullName(at(r, "full_name"));
      first ||= f;
      last ||= l;
    }
    return {
      row: i + 2,
      first_name: first,
      last_name: last,
      phone: normalizePhone(at(r, "phone")),
      email: normalizeEmail(at(r, "email")),
      street: at(r, "street"),
      city: at(r, "city"),
      state: at(r, "state"),
      zip: at(r, "zip"),
      notes: at(r, "notes"),
      raw: r.map((c) => String(c ?? "")),
    };
  });
}

/** Returns a reason string if the row can't be imported. */
export function rowError(r: MappedRow): string | null {
  const missing = [!r.first_name && "first name", !r.last_name && "last name"].filter(Boolean);
  if (missing.length) return `Missing ${missing.join(" and ")}`;
  if (!r.phone && !r.email) return "No phone or email";
  if (r.email && !isValidEmail(r.email)) return "Invalid email";
  if (r.phone && r.phone.length < 7) return "Phone number too short";
  return null;
}

/** Drop rows that are entirely empty (common at the bottom of spreadsheets). */
export function dropBlankRows(rows: string[][]): string[][] {
  return rows.filter((r) => r.some((c) => String(c ?? "").trim() !== ""));
}
