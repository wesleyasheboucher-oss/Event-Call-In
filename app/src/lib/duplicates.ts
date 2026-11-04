import "server-only";
import { all } from "./db";
import { compareNames, nameKey, normalizeName } from "./name-match";

export type DupContact = {
  id: number;
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
  active: number;
  division: number | null;
  source: string;
  created_at: string;
  events_count: number;
  attended_count: number;
};

export type DupReason = { a: number; b: number; reasons: string[]; strong: boolean };
export type DupGroup = { contacts: DupContact[]; pairs: DupReason[]; strong: boolean };

const phonesOf = (c: DupContact) => [c.phone, c.alt_phone].filter(Boolean);

/**
 * Groups contacts that are probably the same person:
 * - same phone or same email, with a name that matches or nearly does (strong)
 * - the same name once case, accents, spacing and punctuation are ignored (strong if nothing
 *   contradicts it, otherwise shown so a person can decide)
 * - a near-match name (typo, nickname, part of a two-part last name) that no phone or email contradicts
 * A shared phone or email under a clearly different name is a household, not a duplicate.
 * Pairs someone marked "not duplicates" are left out.
 */
export async function findDuplicateGroups(): Promise<DupGroup[]> {
  const [contacts, dismissed] = await Promise.all([
    all<DupContact>(
      `SELECT c.id, c.first_name, c.last_name, c.phone, c.alt_phone, c.email, c.street, c.city, c.state, c.zip, c.notes,
              c.training_level, c.processing_level, c.fsm_name, c.active, c.division, c.source, c.created_at,
              COUNT(r.id) AS events_count, COUNT(r.id) FILTER (WHERE r.attendance = 'attended') AS attended_count
         FROM contacts c LEFT JOIN registrations r ON r.contact_id = c.id
        GROUP BY c.id`,
    ),
    all<{ a_id: number; b_id: number }>("SELECT a_id, b_id FROM contact_not_duplicates"),
  ]);
  const notDup = new Set(dismissed.map((d) => `${d.a_id}:${d.b_id}`));

  // Only compare contacts that share something: a phone, an email, a first name, or a last-name part.
  const blocks = new Map<string, DupContact[]>();
  const add = (k: string, c: DupContact) => {
    const list = blocks.get(k);
    if (list) list.push(c);
    else blocks.set(k, [c]);
  };
  for (const c of contacts) {
    for (const p of phonesOf(c)) add(`p:${p}`, c);
    if (c.email) add(`e:${c.email}`, c);
    const [first] = nameKey(c).split("|");
    if (first) add(`f:${first}`, c);
    for (const t of normalizeName(c.last_name).split(" ")) if (t.length >= 3) add(`l:${t}`, c);
    add(`n:${nameKey(c)}`, c);
  }

  const seen = new Set<string>();
  const pairs: DupReason[] = [];
  for (const list of blocks.values()) {
    if (list.length < 2 || list.length > 400) continue; // a huge block (e.g. "Maria") is covered by the others
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const [a, b] = list[i].id < list[j].id ? [list[i], list[j]] : [list[j], list[i]];
        const key = `${a.id}:${b.id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        if (notDup.has(key)) continue;
        const pair = judge(a, b);
        if (pair) pairs.push(pair);
      }
    }
  }

  // Join pairs into groups.
  const parent = new Map<number, number>();
  const find = (x: number): number => {
    let p = parent.get(x) ?? x;
    while (p !== (parent.get(p) ?? p)) p = parent.get(p) ?? p;
    parent.set(x, p);
    return p;
  };
  for (const p of pairs) parent.set(find(p.a), find(p.b));
  const byId = new Map(contacts.map((c) => [c.id, c]));
  const groups = new Map<number, DupGroup>();
  for (const p of pairs) {
    const root = find(p.a);
    const g = groups.get(root) ?? { contacts: [], pairs: [], strong: false };
    g.pairs.push(p);
    g.strong ||= p.strong;
    for (const id of [p.a, p.b]) if (!g.contacts.some((c) => c.id === id)) g.contacts.push(byId.get(id)!);
    groups.set(root, g);
  }
  return [...groups.values()]
    .map((g) => ({ ...g, contacts: g.contacts.sort((x, y) => y.events_count - x.events_count || x.id - y.id) }))
    .sort((x, y) => Number(y.strong) - Number(x.strong) || x.contacts[0].last_name.localeCompare(y.contacts[0].last_name));
}

function judge(a: DupContact, b: DupContact): DupReason | null {
  const name = compareNames(a, b);
  if (name.level === "different") return null;
  const sharedPhone = phonesOf(a).some((p) => phonesOf(b).includes(p));
  const sharedEmail = !!a.email && a.email === b.email;
  const reasons: string[] = [];
  if (sharedPhone) reasons.push("Same phone");
  if (sharedEmail) reasons.push("Same email");
  reasons.push(name.level === "same" ? "Same name" : `Similar name: ${name.why}`);

  if (sharedPhone || sharedEmail) return { a: a.id, b: b.id, reasons, strong: true };
  // Nothing shared. Different phones *and* different emails point to two people.
  const phonesDiffer = phonesOf(a).length > 0 && phonesOf(b).length > 0;
  const emailsDiffer = !!a.email && !!b.email;
  if (name.level === "close" && (phonesDiffer || emailsDiffer)) return null;
  if (name.level === "same" && phonesDiffer && emailsDiffer) {
    return { a: a.id, b: b.id, reasons: [...reasons, "Different phone and email"], strong: false };
  }
  return { a: a.id, b: b.id, reasons, strong: name.level === "same" };
}
