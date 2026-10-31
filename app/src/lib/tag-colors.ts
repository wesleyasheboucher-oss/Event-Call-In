// Shared between server and client: the fixed palette tags can use.

export const TAG_COLORS = ["slate", "red", "orange", "amber", "green", "teal", "sky", "indigo", "violet", "pink"] as const;
export type TagColor = (typeof TAG_COLORS)[number];

export type Tag = { id: number; name: string; color: TagColor };
export type TagWithCount = Tag & { count: number };

/** Chip classes per color (literal strings so Tailwind keeps them). */
export const TAG_STYLE: Record<TagColor, { chip: string; dot: string }> = {
  slate: { chip: "bg-slate-100 text-slate-700 ring-slate-200", dot: "bg-slate-400" },
  red: { chip: "bg-red-50 text-red-700 ring-red-200", dot: "bg-red-500" },
  orange: { chip: "bg-orange-50 text-orange-700 ring-orange-200", dot: "bg-orange-500" },
  amber: { chip: "bg-amber-50 text-amber-800 ring-amber-200", dot: "bg-amber-400" },
  green: { chip: "bg-emerald-50 text-emerald-700 ring-emerald-200", dot: "bg-emerald-500" },
  teal: { chip: "bg-teal-50 text-teal-700 ring-teal-200", dot: "bg-teal-500" },
  sky: { chip: "bg-sky-50 text-sky-700 ring-sky-200", dot: "bg-sky-500" },
  indigo: { chip: "bg-indigo-50 text-indigo-700 ring-indigo-200", dot: "bg-indigo-500" },
  violet: { chip: "bg-violet-50 text-violet-700 ring-violet-200", dot: "bg-violet-500" },
  pink: { chip: "bg-pink-50 text-pink-700 ring-pink-200", dot: "bg-pink-500" },
};

export function isTagColor(c: string): c is TagColor {
  return (TAG_COLORS as readonly string[]).includes(c);
}

/** New tags cycle through the palette so neighbors look different. */
export function nextTagColor(existing: number): TagColor {
  const cycle: TagColor[] = ["indigo", "green", "amber", "sky", "pink", "teal", "orange", "violet", "red", "slate"];
  return cycle[existing % cycle.length];
}
