"use client";

import { useDeferredValue, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { useListLayout } from "@/components/use-layout";
import { ListSkeleton } from "@/components/list-skeleton";
import { toast } from "sonner";
import { ArrowUp, Check, Copy, Download, History, Phone, Plus, Search, Settings2, Tag as TagIcon, Upload, Users, X } from "lucide-react";
import type { ContactListRow } from "@/lib/queries";
import type { TagWithCount } from "@/lib/tag-colors";
import { TAG_STYLE } from "@/lib/tag-colors";
import { formatPhone, normalizePhone, telHref } from "@/lib/phone";
import { fmt } from "@/lib/time";
import { downloadCsv } from "@/lib/csv";
import { bulkTagContacts } from "@/app/actions/tags";
import { Page, PageHeader } from "@/components/page";
import { Modal } from "@/components/drawer";
import { TagSelector } from "@/components/tags";
import { ContactDivisionBadge, ContactDivisionMini } from "@/components/division";
import { Avatar, Button, Card, cx, EmptyState, Select } from "@/components/ui";
import { ContactDrawer } from "./contact-drawer";
import { AddContactDrawer } from "./add-contact-drawer";
import { ManageTagsDrawer } from "./manage-tags-drawer";

type SortKey = "name" | "events" | "attended" | "no_shows" | "last_event" | "added";
type FilterKey = "active" | "inactive" | "div_4" | "div_6" | "import" | "walk_in" | "manual" | "guest" | "signup" | "no_shows" | "never_attended" | "no_phone" | "no_email";

// Within "division" and "source", picking several means any of them; "flag" filters all apply.
const FILTERS: { key: FilterKey; label: string; test: (c: ContactListRow) => boolean; group: "active" | "division" | "source" | "flag" }[] = [
  { key: "active", label: "Active", test: (c) => c.active === 1, group: "active" },
  { key: "inactive", label: "Inactive", test: (c) => c.active === 0, group: "active" },
  { key: "div_4", label: "Div 4", test: (c) => c.division === 4, group: "division" },
  { key: "div_6", label: "Div 6", test: (c) => c.division === 6, group: "division" },
  { key: "import", label: "Imported", test: (c) => c.source === "import", group: "source" },
  { key: "walk_in", label: "Walk-ins", test: (c) => c.source === "walk_in", group: "source" },
  { key: "manual", label: "Added manually", test: (c) => c.source === "manual", group: "source" },
  { key: "guest", label: "Guests", test: (c) => c.source === "guest", group: "source" },
  { key: "signup", label: "Signed up online", test: (c) => c.source === "signup", group: "source" },
  { key: "no_shows", label: "Has no-shows", test: (c) => c.no_show_count > 0, group: "flag" },
  { key: "never_attended", label: "Never attended", test: (c) => c.attended_count === 0, group: "flag" },
  { key: "no_phone", label: "Missing phone", test: (c) => !c.phone, group: "flag" },
  { key: "no_email", label: "Missing email", test: (c) => !c.email, group: "flag" },
];

const PAGE = 100;
const TZ = "America/New_York";

const cmpStr = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: "base" });

type SortProps = {
  k: SortKey;
  sort: { key: SortKey; dir: 1 | -1 };
  onSort: (k: SortKey) => void;
  children: React.ReactNode;
};

function SortHead({ className, ...props }: SortProps & { className?: string }) {
  return (
    <th className={cx("px-4 py-3 font-medium", className)}>
      <SortButton {...props} />
    </th>
  );
}

function SortButton({ k, sort, onSort, children }: SortProps) {
  const active = sort.key === k;
  return (
    <>
      <button
        onClick={() => onSort(k)}
        className={cx("group inline-flex items-center gap-1 transition-colors", active ? "text-ink" : "hover:text-ink")}
      >
        {children}
        <motion.span
          initial={false}
          animate={{ rotate: active && sort.dir === -1 ? 180 : 0, opacity: active ? 1 : 0 }}
          transition={{ type: "spring", stiffness: 500, damping: 30 }}
          className="inline-flex"
        >
          <ArrowUp className="size-3.5" />
        </motion.span>
      </button>
    </>
  );
}

function Checkbox({ checked, indeterminate, onChange, label }: { checked: boolean; indeterminate?: boolean; onChange: () => void; label: string }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={indeterminate ? "mixed" : checked}
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation();
        onChange();
      }}
      className="flex size-11 shrink-0 items-center justify-center md:size-8"
    >
      <span
        className={cx(
          "flex size-5 items-center justify-center rounded-md ring-1 transition-colors",
          checked || indeterminate ? "bg-accent text-white ring-accent" : "bg-surface ring-border-strong",
        )}
      >
        {checked && <Check className="size-3.5" strokeWidth={3} />}
        {indeterminate && !checked && <span className="h-0.5 w-2.5 rounded bg-white" />}
      </span>
    </button>
  );
}

/** Up to `max` tag chips, then "+n". */
export function ContactsView({ contacts, tags }: { contacts: ContactListRow[]; tags: TagWithCount[] }) {
  const router = useRouter();
  const layout = useListLayout();
  const pathname = usePathname();
  const params = useSearchParams();
  const openId = params.get("c") ? Number(params.get("c")) : null;

  const [query, setQuery] = useState("");
  const q = useDeferredValue(query);
  const [filters, setFilters] = useState<Set<FilterKey>>(new Set());
  const [tagFilter, setTagFilter] = useState<Set<number>>(new Set());
  const [profile, setProfile] = useState({ training: "", processing: "", fsm: "" });
  // Distinct values present in the data, for the level / FSM dropdowns.
  const profileOptions = useMemo(() => {
    const uniq = (k: "training_level" | "processing_level" | "fsm_name") =>
      [...new Set(contacts.map((c) => c[k]).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    return { training: uniq("training_level"), processing: uniq("processing_level"), fsm: uniq("fsm_name") };
  }, [contacts]);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "name", dir: 1 });
  const [limit, setLimit] = useState(PAGE);
  const [adding, setAdding] = useState(false);
  const [managing, setManaging] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  // Division taps from the rows apply instantly; the server copy catches up on the next refresh.
  const [divOverrides, setDivOverrides] = useState<Record<number, number | null>>({});
  const people = useMemo(
    () => contacts.map((c) => (c.id in divOverrides ? { ...c, division: divOverrides[c.id] } : c)),
    [contacts, divOverrides],
  );
  const setDivision = (id: number, division: number | null) => setDivOverrides((o) => ({ ...o, [id]: division }));
  const [selecting, setSelecting] = useState(false); // phones: checkboxes only shown in select mode
  const [bulk, setBulk] = useState<null | "add" | "remove">(null);
  const [bulkBusy, startBulk] = useTransition();

  const tagsById = useMemo(() => new Map(tags.map((t) => [t.id, t])), [tags]);

  function openContact(id: number | null) {
    const next = new URLSearchParams(params.toString());
    if (id == null) next.delete("c");
    else next.set("c", String(id));
    const qs = next.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  const filtered = useMemo(() => {
    const text = q.trim().toLowerCase();
    const digits = normalizePhone(text);
    const sourceFilters = FILTERS.filter((f) => f.group === "source" && filters.has(f.key));
    const flagFilters = FILTERS.filter((f) => f.group === "flag" && filters.has(f.key));
    const divisionFilters = FILTERS.filter((f) => f.group === "division" && filters.has(f.key));
    const activeFilters = FILTERS.filter((f) => f.group === "active" && filters.has(f.key));
    const rows = people.filter((c) => {
      if (sourceFilters.length && !sourceFilters.some((f) => f.test(c))) return false;
      if (!flagFilters.every((f) => f.test(c))) return false;
      if (divisionFilters.length && !divisionFilters.some((f) => f.test(c))) return false;
      if (activeFilters.length && !activeFilters.some((f) => f.test(c))) return false;
      if (profile.training && c.training_level !== profile.training) return false;
      if (profile.processing && c.processing_level !== profile.processing) return false;
      if (profile.fsm && c.fsm_name !== profile.fsm) return false;
      if (tagFilter.size && !c.tag_ids.some((id) => tagFilter.has(id))) return false;
      if (!text) return true;
      const name = `${c.first_name} ${c.last_name}`.toLowerCase();
      return (
        name.includes(text) ||
        `${c.last_name} ${c.first_name}`.toLowerCase().includes(text) ||
        c.email.includes(text) ||
        (digits.length >= 3 && (c.phone.includes(digits) || c.alt_phone.includes(digits)))
      );
    });
    const { key, dir } = sort;
    const by: Record<SortKey, (a: ContactListRow, b: ContactListRow) => number> = {
      name: (a, b) => cmpStr(a.last_name, b.last_name) || cmpStr(a.first_name, b.first_name),
      events: (a, b) => a.events_count - b.events_count,
      attended: (a, b) => a.attended_count - b.attended_count,
      no_shows: (a, b) => a.no_show_count - b.no_show_count,
      last_event: (a, b) => (a.last_event_at ?? "").localeCompare(b.last_event_at ?? ""),
      added: (a, b) => a.created_at.localeCompare(b.created_at),
    };
    return rows.sort((a, b) => by[key](a, b) * dir || by.name(a, b));
  }, [people, q, filters, tagFilter, sort, profile]);

  const visible = filtered.slice(0, limit);
  const filtersActive = filters.size > 0 || tagFilter.size > 0 || !!(profile.training || profile.processing || profile.fsm);
  const allFilteredSelected = filtered.length > 0 && filtered.every((c) => selected.has(c.id));
  const someSelected = selected.size > 0;

  function toggleFilter(k: FilterKey) {
    setLimit(PAGE);
    setFilters((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  }

  function toggleTagFilter(id: number) {
    setLimit(PAGE);
    setTagFilter((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelected(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected(allFilteredSelected ? new Set() : new Set(filtered.map((c) => c.id)));
  }

  function clearSelection() {
    setSelected(new Set());
    setSelecting(false);
  }

  function toggleSort(key: SortKey) {
    setSort((s) => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: key === "name" ? 1 : -1 }));
  }

  function runBulk(tag: { id: number } | { name: string }) {
    if (!bulk) return;
    const mode = bulk;
    startBulk(async () => {
      const res = await bulkTagContacts([...selected], tag, mode);
      if (!res.ok) return void toast.error(res.error);
      const n = res.changed;
      toast.success(
        mode === "add"
          ? `Tagged ${n} ${n === 1 ? "person" : "people"} “${res.tag.name}”`
          : `Removed “${res.tag.name}” from ${n} ${n === 1 ? "person" : "people"}`,
      );
      setBulk(null);
    });
  }

  function exportCsv(rows: ContactListRow[], name: string) {
    downloadCsv(`${name}-${new Date().toISOString().slice(0, 10)}`, rows, [
      { header: "First name", value: (c) => c.first_name },
      { header: "Last name", value: (c) => c.last_name },
      { header: "Phone", value: (c) => formatPhone(c.phone) },
      { header: "Email", value: (c) => c.email },
      { header: "Street", value: (c) => c.street },
      { header: "City", value: (c) => c.city },
      { header: "State", value: (c) => c.state },
      { header: "ZIP", value: (c) => c.zip },
      { header: "Division", value: (c) => c.division },
      { header: "Active", value: (c) => (c.active ? "Yes" : "No") },
      { header: "Alt phone", value: (c) => formatPhone(c.alt_phone) },
      { header: "Training level", value: (c) => c.training_level },
      { header: "Processing level", value: (c) => c.processing_level },
      { header: "FSM", value: (c) => c.fsm_name },
      { header: "Tags", value: (c) => c.tag_ids.map((id) => tagsById.get(id)?.name).filter(Boolean).join(", ") },
      { header: "Notes", value: (c) => c.notes },
      { header: "Source", value: (c) => c.source },
      { header: "Events", value: (c) => c.events_count },
      { header: "Attended", value: (c) => c.attended_count },
      { header: "No-shows", value: (c) => c.no_show_count },
      { header: "Last event", value: (c) => (c.last_event_at ? fmt(c.last_event_at, TZ, "yyyy-MM-dd") : "") },
      { header: "Added", value: (c) => fmt(c.created_at, TZ, "yyyy-MM-dd") },
    ]);
  }

  const pill = (on: boolean) =>
    cx(
      "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-medium ring-1 transition-colors ring-inset md:h-8",
      on ? "bg-ink text-white ring-ink" : "bg-surface text-ink-2 ring-border hover:text-ink hover:ring-border-strong",
    );

  return (
    <Page wide className={cx(someSelected && "pb-32")}>
      <PageHeader
        title="Contacts"
        description={`${contacts.length.toLocaleString()} people across all your events.`}
        actions={
          <>
            <Button variant="ghost" icon={<Download className="size-4" />} onClick={() => exportCsv(filtered, "contacts")}>
              <span className="hidden sm:inline">Export</span>
            </Button>
            <Link href="/contacts/duplicates" title="Find duplicate contacts">
              <Button variant="ghost" icon={<Copy className="size-4" />}>
                <span className="hidden sm:inline">Duplicates</span>
              </Button>
            </Link>
            <Link href="/contacts/imports" title="Import history">
              <Button variant="ghost" icon={<History className="size-4" />}>
                <span className="hidden sm:inline">History</span>
              </Button>
            </Link>
            <Link href="/contacts/import">
              <Button variant="secondary" icon={<Upload className="size-4" />}>
                Import
              </Button>
            </Link>
            <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setAdding(true)}>
              Add<span className="hidden sm:inline"> contact</span>
            </Button>
          </>
        }
      />

      <div className="mb-5 space-y-3">
        <div className="flex items-center gap-2">
          <div className="relative min-w-0 flex-1 md:max-w-md">
            <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-ink-3" />
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setLimit(PAGE);
              }}
              placeholder="Search name, phone, or email"
              className="h-11 w-full rounded-xl bg-surface pr-10 pl-10 text-base ring-1 ring-border transition-shadow ring-inset placeholder:text-ink-3 focus:ring-2 focus:ring-accent focus:outline-none md:text-sm"
            />
            <AnimatePresence>
              {query && (
                <motion.button
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  onClick={() => setQuery("")}
                  className="absolute top-1/2 right-2 flex size-8 -translate-y-1/2 items-center justify-center rounded-full text-ink-3 hover:bg-surface-2 hover:text-ink"
                  aria-label="Clear search"
                >
                  <X className="size-3.5" />
                </motion.button>
              )}
            </AnimatePresence>
          </div>
          <Button
            variant={selecting ? "soft" : "secondary"}
            className="h-11 md:hidden"
            onClick={() => (selecting ? clearSelection() : setSelecting(true))}
          >
            {selecting ? "Done" : "Select"}
          </Button>
        </div>

        {/* Filters scroll sideways on phones instead of wrapping into a wall of pills */}
        <div className="-mx-4 flex items-center gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] md:mx-0 md:flex-wrap md:overflow-visible md:px-0">
          {FILTERS.map((f, i) => (
            <span key={f.key} className="contents">
              {i > 0 && FILTERS[i - 1].group !== f.group && <span className="mx-1 h-5 w-px shrink-0 bg-border" />}
              <button onClick={() => toggleFilter(f.key)} className={pill(filters.has(f.key))}>
                {f.label}
                {filters.has(f.key) && <X className="size-3" />}
              </button>
            </span>
          ))}
        </div>

        {(profileOptions.training.length > 0 || profileOptions.processing.length > 0 || profileOptions.fsm.length > 0) && (
          <div className="grid gap-2 sm:grid-cols-3 md:max-w-3xl">
            {(
              [
                ["training", "Training level", profileOptions.training],
                ["processing", "Processing level", profileOptions.processing],
                ["fsm", "FSM", profileOptions.fsm],
              ] as const
            ).map(([k, label, opts]) =>
              opts.length ? (
                <Select
                  key={k}
                  value={profile[k]}
                  onChange={(e) => {
                    setProfile((p) => ({ ...p, [k]: e.target.value }));
                    setLimit(PAGE);
                  }}
                  aria-label={label}
                  className={cx("h-10 min-w-0", profile[k] && "ring-2 ring-ink")}
                >
                  <option value="">{`Any ${label.toLowerCase()}`}</option>
                  {opts.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </Select>
              ) : null,
            )}
          </div>
        )}

        <div className="-mx-4 flex items-center gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] md:mx-0 md:flex-wrap md:overflow-visible md:px-0">
          <span className="flex shrink-0 items-center gap-1.5 text-[13px] text-ink-3">
            <TagIcon className="size-3.5" /> Tags
          </span>
          {tags.map((t) => {
            const on = tagFilter.has(t.id);
            return (
              <button
                key={t.id}
                onClick={() => toggleTagFilter(t.id)}
                className={cx(
                  "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium ring-1 transition-all ring-inset md:h-8",
                  on ? cx(TAG_STYLE[t.color].chip, "ring-2") : "bg-surface text-ink-2 ring-border hover:ring-border-strong",
                )}
              >
                <span className={cx("size-2 rounded-full", TAG_STYLE[t.color].dot)} />
                {t.name}
                <span className="text-[11px] opacity-60 tabular-nums">{t.count}</span>
              </button>
            );
          })}
          <button
            onClick={() => setManaging(true)}
            className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium text-accent hover:bg-accent-soft md:h-8"
          >
            <Settings2 className="size-3.5" /> {tags.length ? "Manage" : "Create tags"}
          </button>
        </div>

        <AnimatePresence>
          {(filtersActive || q) && (
            <motion.p
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="text-[13px] text-ink-3 tabular-nums"
            >
              {filtered.length.toLocaleString()} {filtered.length === 1 ? "match" : "matches"}
              {filtersActive && (
                <button
                  onClick={() => {
                    setFilters(new Set());
                    setTagFilter(new Set());
                    setProfile({ training: "", processing: "", fsm: "" });
                  }}
                  className="ml-2 font-medium text-accent hover:underline"
                >
                  Clear filters
                </button>
              )}
            </motion.p>
          )}
        </AnimatePresence>
      </div>

      <Card className="overflow-hidden">
        {filtered.length === 0 ? (
          <EmptyState
            icon={<Users className="size-5" />}
            title={contacts.length === 0 ? "No contacts yet" : "No one matches"}
            body={contacts.length === 0 ? "Import a spreadsheet or add people one at a time." : "Try a different search or clear the filters."}
            action={
              contacts.length === 0 ? (
                <Link href="/contacts/import">
                  <Button variant="primary" icon={<Upload className="size-4" />}>
                    Import contacts
                  </Button>
                </Link>
              ) : undefined
            }
          />
        ) : (
          <>
            {/* Phones and small tablets: stacked cards */}
            {layout === "cards" && (
<ul className="divide-y divide-border">
              {selecting && (
                <li className="flex items-center gap-1 bg-surface-2/60 px-2 py-1 text-[13px] text-ink-2">
                  <Checkbox checked={allFilteredSelected} indeterminate={someSelected} onChange={toggleAll} label="Select all" />
                  Select all {filtered.length.toLocaleString()}
                </li>
              )}
              {visible.map((c) => {
                const name = `${c.first_name} ${c.last_name}`;
                const isSel = selected.has(c.id);
                return (
                  <li
                    key={c.id}
                    onClick={() => (selecting ? toggleSelected(c.id) : openContact(c.id))}
                    className={cx(
                      "flex min-h-[72px] items-center gap-3 px-4 py-3 transition-colors active:bg-surface-2",
                      isSel && "bg-accent-soft/60",
                      selecting && "pl-1",
                      c.active === 0 && "opacity-55",
                    )}
                  >
                    {selecting && <Checkbox checked={isSel} onChange={() => toggleSelected(c.id)} label={`Select ${name}`} />}
                    <Avatar name={name} size="md" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-[15px] font-medium">{name}</span>
                        {selecting && <ContactDivisionBadge division={c.division} />}
                        {(c.source === "walk_in" || c.source === "guest") && (
                          <span className="shrink-0 rounded-full bg-violet-50 px-1.5 text-[10px] font-medium text-violet-700 ring-1 ring-violet-200 ring-inset">
                            {c.source === "guest" ? "Guest" : "Walk-in"}
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 text-xs text-ink-3">
                        {c.events_count} event{c.events_count === 1 ? "" : "s"} · {c.attended_count} attended
                        {c.no_show_count > 0 && <span className="text-rose-600"> · {c.no_show_count} no-show</span>}
                      </div>
                      {!selecting && (
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          <ContactDivisionMini contactId={c.id} value={c.division} onChange={(d) => setDivision(c.id, d)} />
                        </div>
                      )}
                    </div>
                    {c.phone && !selecting && (
                      <a
                        href={telHref(c.phone)}
                        onClick={(e) => e.stopPropagation()}
                        className="flex size-11 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent"
                        aria-label={`Call ${name}`}
                      >
                        <Phone className="size-4" />
                      </a>
                    )}
                  </li>
                );
              })}
            </ul>
)}

{/* Desktop table */}
            {layout === "table" && (
<div className="overflow-x-auto">
              <table className="w-full min-w-[920px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-[13px] text-ink-2">
                    <th className="py-3 pr-3 pl-3 font-medium">
                      <span className="flex items-center gap-1">
                        <Checkbox checked={allFilteredSelected} indeterminate={someSelected} onChange={toggleAll} label="Select all" />
                        <SortButton k="name" sort={sort} onSort={toggleSort}>
                          Name
                        </SortButton>
                      </span>
                    </th>
                    <th className="px-2 py-3 font-medium">Div</th>
                    <th className="px-2 py-3 font-medium">Phone</th>
                    <th className="px-3 py-3 font-medium">Email</th>
                    <SortHead sort={sort} onSort={toggleSort} k="events" className="px-2 text-right">
                      Events
                    </SortHead>
                    <SortHead sort={sort} onSort={toggleSort} k="attended" className="px-2 text-right">
                      Attended
                    </SortHead>
                    <SortHead sort={sort} onSort={toggleSort} k="no_shows" className="px-2 text-right whitespace-nowrap">
                      No-shows
                    </SortHead>
                    <SortHead sort={sort} onSort={toggleSort} k="last_event">
                      Last event
                    </SortHead>
                    <SortHead sort={sort} onSort={toggleSort} k="added" className="pr-5">
                      Added
                    </SortHead>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((c, i) => {
                    const name = `${c.first_name} ${c.last_name}`;
                    const isSel = selected.has(c.id);
                    return (
                      <motion.tr
                        key={c.id}
                        initial={i < 30 ? { opacity: 0, y: 4 } : false}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: Math.min(i, 30) * 0.012, duration: 0.25 }}
                        onClick={() => openContact(c.id)}
                        className={cx(
                          "cursor-pointer border-b border-border/70 transition-colors last:border-0 hover:bg-surface-2/70",
                          (openId === c.id || isSel) && "bg-accent-soft/50 hover:bg-accent-soft/70",
                          c.active === 0 && "text-ink-3 [&_td]:opacity-60",
                        )}
                      >
                        <td className="py-3 pr-3 pl-3">
                          <div className="flex items-center gap-1">
                            <Checkbox checked={isSel} onChange={() => toggleSelected(c.id)} label={`Select ${name}`} />
                            <Avatar name={name} size="sm" className="mr-2" />
                            <div className="flex max-w-[160px] min-w-0 items-center gap-2 whitespace-nowrap">
                              <span className="truncate font-medium text-ink" title={name}>
                                {name}
                              </span>
                              {(c.source === "walk_in" || c.source === "guest") && (
                                <span className="shrink-0 rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-medium text-violet-700 ring-1 ring-violet-200 ring-inset">
                                  {c.source === "guest" ? "Guest" : "Walk-in"}
                                </span>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-2 py-3">
                          <ContactDivisionMini compact contactId={c.id} value={c.division} onChange={(d) => setDivision(c.id, d)} />
                        </td>
                        <td className="px-2 py-3 whitespace-nowrap">
                          {c.phone ? (
                            <a href={telHref(c.phone)} onClick={(e) => e.stopPropagation()} className="text-ink-2 tabular-nums hover:text-accent">
                              {formatPhone(c.phone)}
                            </a>
                          ) : (
                            <span className="text-ink-3">—</span>
                          )}
                        </td>
                        <td className="max-w-[160px] truncate px-3 py-3 text-ink-2" title={c.email || undefined}>{c.email || <span className="text-ink-3">—</span>}</td>
                        <td className="px-2 py-3 text-right tabular-nums">{c.events_count}</td>
                        <td className="px-2 py-3 text-right tabular-nums">
                          <span className={c.attended_count ? "text-emerald-700" : "text-ink-3"}>{c.attended_count}</span>
                        </td>
                        <td className="px-2 py-3 text-right tabular-nums">
                          <span className={c.no_show_count ? "font-medium text-rose-600" : "text-ink-3"}>{c.no_show_count}</span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-ink-2">
                          {c.last_event_at ? fmt(c.last_event_at, TZ, "MMM d, yyyy") : <span className="text-ink-3">—</span>}
                        </td>
                        <td className="py-3 pr-5 pl-4 whitespace-nowrap text-ink-3">{fmt(c.created_at, TZ, "MMM d, yyyy")}</td>
                      </motion.tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
)}

            {layout === null && <ListSkeleton />}
            {filtered.length > limit && (
              <div className="flex items-center justify-center gap-3 border-t border-border py-4 text-[13px] text-ink-3">
                Showing {limit.toLocaleString()} of {filtered.length.toLocaleString()}
                <Button size="sm" variant="secondary" onClick={() => setLimit((l) => l + PAGE * 2)}>
                  Show more
                </Button>
              </div>
            )}
          </>
        )}
      </Card>

      {/* Bulk action bar */}
      <AnimatePresence>
        {someSelected && (
          <motion.div
            initial={{ y: 120, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 120, opacity: 0 }}
            transition={{ type: "spring", stiffness: 420, damping: 36 }}
            className="fixed inset-x-0 bottom-[var(--bottom-nav)] z-40 px-3 pb-3 md:left-[var(--sidebar-w)]"
          >
            <div className="mx-auto flex max-w-2xl items-center gap-1 rounded-2xl bg-ink p-2 text-white shadow-[var(--shadow-lift)]">
              <span className="px-3 text-sm font-medium tabular-nums">{selected.size.toLocaleString()} selected</span>
              <div className="ml-auto flex items-center gap-1">
                <button onClick={() => setBulk("add")} className="flex h-10 items-center gap-1.5 rounded-xl px-3 text-sm font-medium hover:bg-white/10">
                  <TagIcon className="size-4" /> <span>Tag</span>
                </button>
                <button onClick={() => setBulk("remove")} className="flex h-10 items-center gap-1.5 rounded-xl px-3 text-sm font-medium hover:bg-white/10">
                  <X className="size-4" /> <span className="hidden sm:inline">Remove tag</span>
                  <span className="sm:hidden">Untag</span>
                </button>
                <button
                  onClick={() => exportCsv(contacts.filter((c) => selected.has(c.id)), "contacts-selected")}
                  className="hidden h-10 items-center gap-1.5 rounded-xl px-3 text-sm font-medium hover:bg-white/10 sm:flex"
                >
                  <Download className="size-4" /> Export
                </button>
                <button
                  onClick={clearSelection}
                  className="flex size-10 items-center justify-center rounded-xl hover:bg-white/10"
                  aria-label="Clear selection"
                >
                  <X className="size-4" />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <Modal
        open={bulk !== null}
        onClose={() => setBulk(null)}
        title={bulk === "remove" ? `Remove a tag from ${selected.size}` : `Tag ${selected.size} ${selected.size === 1 ? "person" : "people"}`}
        size="sm"
      >
        <p className="mb-1 text-sm text-ink-2">
          {bulk === "remove" ? "Pick the tag to take off everyone selected." : "Pick a tag, or type a new name to create it."}
        </p>
        <TagSelector
          allTags={tags}
          selectedIds={new Set()}
          busy={bulkBusy}
          onPick={(t) => runBulk({ id: t.id })}
          onCreate={(name) => (bulk === "add" ? runBulk({ name }) : toast.error("That tag doesn't exist."))}
          onClose={() => setBulk(null)}
          placeholder={bulk === "remove" ? "Find a tag" : "Find or create a tag"}
        />
      </Modal>

      <ContactDrawer contactId={openId} onClose={() => openContact(null)} onOpenContact={openContact} />
      <AddContactDrawer
        open={adding}
        onClose={() => setAdding(false)}
        onCreated={(id) => {
          setAdding(false);
          openContact(id);
        }}
        onOpenExisting={(id) => {
          setAdding(false);
          openContact(id);
        }}
      />
      <ManageTagsDrawer open={managing} onClose={() => setManaging(false)} tags={tags} />
    </Page>
  );
}
