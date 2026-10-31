// Matching typed/uploaded names to contacts. Deliberately strict: an "exact" match is
// safe to apply automatically; a "close" match is shown for a person to confirm.

export type NameParts = { first: string; last: string; middle: string[] };
export type Candidate = { id: number; first_name: string; last_name: string };
export type NameMatch<C extends Candidate> =
  | { kind: "exact"; contact: C }
  | { kind: "ambiguous"; options: C[] }
  | { kind: "close"; options: { contact: C; score: number; why: string }[] }
  | { kind: "none" };

/** Lowercase, strip accents and punctuation, collapse spaces. "O'Brien-Smith, José" → "obrien smith jose". */
export function normalizeName(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’`.]/g, "")
    .replace(/[^a-z\s,-]/g, " ")
    .replace(/[-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const SUFFIXES = new Set(["jr", "sr", "ii", "iii", "iv", "v"]);

/** "Smith, John A" or "John A Smith" → { first: "john", last: "smith", middle: ["a"] }. */
export function parseName(raw: string): NameParts {
  let s = normalizeName(raw);
  if (s.includes(",")) {
    const [last, rest] = s.split(",", 2).map((x) => x.trim());
    s = `${rest} ${last}`.trim();
  }
  const tokens = s.replace(/,/g, " ").split(" ").filter((t) => t && !SUFFIXES.has(t));
  if (tokens.length === 0) return { first: "", last: "", middle: [] };
  if (tokens.length === 1) return { first: tokens[0], last: "", middle: [] };
  return { first: tokens[0], last: tokens[tokens.length - 1], middle: tokens.slice(1, -1) };
}

function contactParts(c: Candidate): NameParts {
  const first = normalizeName(c.first_name).split(" ").filter(Boolean);
  const last = normalizeName(c.last_name).split(" ").filter(Boolean);
  return { first: first[0] ?? "", last: last[last.length - 1] ?? "", middle: [...first.slice(1), ...last.slice(0, -1)] };
}

/**
 * Edit distance counting a swap of two neighboring letters as one edit
 * (optimal string alignment). "jhon"→"john" = 1, "michele"→"michael" = 2.
 */
export function typoDistance(a: string, b: string): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...new Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

// Common English nicknames, both directions. Only used for "close" (never automatic).
const NICK_GROUPS = [
  ["william", "bill", "billy", "will", "willie", "liam"],
  ["robert", "bob", "bobby", "rob", "robbie", "bert"],
  ["richard", "rick", "ricky", "dick", "rich"],
  ["james", "jim", "jimmy", "jamie"],
  ["john", "johnny", "jack", "jon"],
  ["joseph", "joe", "joey", "jose"],
  ["michael", "mike", "mikey", "mick"],
  ["thomas", "tom", "tommy"],
  ["charles", "charlie", "chuck", "chas"],
  ["christopher", "chris", "topher"],
  ["daniel", "dan", "danny"],
  ["david", "dave", "davey"],
  ["edward", "ed", "eddie", "ted", "ned"],
  ["anthony", "tony"],
  ["andrew", "andy", "drew"],
  ["matthew", "matt"],
  ["nicholas", "nick", "nicky"],
  ["steven", "stephen", "steve"],
  ["benjamin", "ben", "benny"],
  ["samuel", "sam", "sammy"],
  ["alexander", "alex", "al", "xander"],
  ["gregory", "greg"],
  ["kenneth", "ken", "kenny"],
  ["ronald", "ron", "ronnie"],
  ["donald", "don", "donnie"],
  ["timothy", "tim", "timmy"],
  ["jeffrey", "jeff"],
  ["patrick", "pat", "paddy"],
  ["elizabeth", "liz", "lizzie", "beth", "betty", "eliza", "betsy"],
  ["margaret", "maggie", "meg", "peggy", "marge"],
  ["katherine", "catherine", "kathryn", "kate", "katie", "kathy", "cathy", "kat"],
  ["jennifer", "jen", "jenny"],
  ["patricia", "pat", "patty", "trish", "tricia"],
  ["susan", "sue", "susie"],
  ["deborah", "debra", "deb", "debbie"],
  ["rebecca", "becky", "becca"],
  ["jessica", "jess", "jessie"],
  ["kimberly", "kim"],
  ["christine", "christina", "chris", "tina"],
  ["victoria", "vicky", "tori"],
  ["samantha", "sam", "sammy"],
  ["alexandra", "alex", "lexi", "sandra"],
  ["abigail", "abby"],
  ["jacqueline", "jackie"],
  ["theresa", "teresa", "terry", "tess"],
];
const NICKS = new Map<string, Set<string>>();
for (const group of NICK_GROUPS) for (const n of group) {
  const set = NICKS.get(n) ?? new Set<string>();
  for (const m of group) if (m !== n) set.add(m);
  NICKS.set(n, set);
}
const isNick = (a: string, b: string) => NICKS.get(a)?.has(b) ?? false;

/** How sure we are these name the same person, and why (for display). null = not close enough. */
function compare(input: NameParts, c: NameParts): { score: number; why: string } | null {
  if (!input.last || !c.last) return null;
  // At most ONE typo across first + last name (a wrong, missing, extra, or swapped letter),
  // and never on a very short name, where one letter changes the name ("Al" vs "Ali").
  const dFirst = typoDistance(input.first, c.first);
  const dLast = typoDistance(input.last, c.last);
  if (dFirst + dLast === 1) {
    const part = dFirst ? input.first : input.last;
    if (part.length >= 4) {
      const score = 1 - 1 / (input.first.length + input.last.length);
      return { score, why: dFirst ? "first name spelling" : "last name spelling" };
    }
  }
  if (dLast === 0 && isNick(input.first, c.first)) return { score: 0.93, why: `${input.first} / ${c.first}` };
  // First and last swapped ("Smith John") with exact spelling.
  if (input.first === c.last && input.last === c.first) return { score: 0.95, why: "first and last swapped" };
  return null;
}

/**
 * Exact = same first and last name (case, accents, punctuation, middle names, and
 * "Last, First" order ignored). Several exact matches → ambiguous. Otherwise "close"
 * candidates (typo-level spelling, nickname, swapped order) for a person to approve.
 */
export function matchName<C extends Candidate>(raw: string, contacts: C[]): NameMatch<C> {
  const input = parseName(raw);
  if (!input.first || !input.last) return { kind: "none" };
  const exact: C[] = [];
  const close: { contact: C; score: number; why: string }[] = [];
  for (const c of contacts) {
    const p = contactParts(c);
    if (p.first === input.first && p.last === input.last) {
      exact.push(c);
      continue;
    }
    const cmp = compare(input, p);
    if (cmp) close.push({ contact: c, ...cmp });
  }
  if (exact.length === 1) return { kind: "exact", contact: exact[0] };
  if (exact.length > 1) return { kind: "ambiguous", options: exact };
  if (close.length) return { kind: "close", options: close.sort((a, b) => b.score - a.score).slice(0, 4) };
  return { kind: "none" };
}
