"use client";

import { useDeferredValue, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { ArrowUp, Download, Plus, Search, Upload, Users, X } from "lucide-react";
import type { ContactListRow } from "@/lib/queries";
import { formatPhone, normalizePhone, telHref } from "@/lib/phone";
import { fmt } from "@/lib/time";
import { downloadCsv } from "@/lib/csv";
import { Page, PageHeader } from "@/components/page";
import { Avatar, Button, Card, cx, EmptyState } from "@/components/ui";
import { ContactDrawer } from "./contact-drawer";
import { AddContactDrawer } from "./add-contact-drawer";

type SortKey = "name" | "events" | "attended" | "no_shows" | "last_event" | "added";
type FilterKey = "import" | "walk_in" | "manual" | "guest" | "no_shows" | "never_attended" | "no_phone" | "no_email";

const FILTERS: { key: FilterKey; label: string; test: (c: ContactListRow) => boolean; group: "source" | "flag" }[] = [
  { key: "import", label: "Imported", test: (c) => c.source === "import", group: "source" },
  { key: "walk_in", label: "Walk-ins", test: (c) => c.source === "walk_in", group: "source" },
  { key: "manual", label: "Added manually", test: (c) => c.source === "manual", group: "source" },
  { key: "guest", label: "Guests", test: (c) => c.source === "guest", group: "source" },
  { key: "no_shows", label: "Has no-shows", test: (c) => c.no_show_count > 0, group: "flag" },
  { key: "never_attended", label: "Never attended", test: (c) => c.attended_count === 0, group: "flag" },
  { key: "no_phone", label: "Missing phone", test: (c) => !c.phone, group: "flag" },
  { key: "no_email", label: "Missing email", test: (c) => !c.email, group: "flag" },
];

const PAGE = 100;
const TZ = "America/New_York";

const cmpStr = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: "base" });

function SortHead({
  k,
  sort,
  onSort,
  children,
  className,
}: {
  k: SortKey;
  sort: { key: SortKey; dir: 1 | -1 };
  onSort: (k: SortKey) => void;
  children: React.ReactNode;
  className?: string;
}) {
  const active = sort.key === k;
  return (
    <th className={cx("px-4 py-3 font-medium", className)}>
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
    </th>
  );
}

export function ContactsView({ contacts }: { contacts: ContactListRow[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const openId = params.get("c") ? Number(params.get("c")) : null;

  const [query, setQuery] = useState("");
  const q = useDeferredValue(query);
  const [filters, setFilters] = useState<Set<FilterKey>>(new Set());
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "name", dir: 1 });
  const [limit, setLimit] = useState(PAGE);
  const [adding, setAdding] = useState(false);

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
    const rows = contacts.filter((c) => {
      if (sourceFilters.length && !sourceFilters.some((f) => f.test(c))) return false;
      if (!flagFilters.every((f) => f.test(c))) return false;
      if (!text) return true;
      const name = `${c.first_name} ${c.last_name}`.toLowerCase();
      return (
        name.includes(text) ||
        `${c.last_name} ${c.first_name}`.toLowerCase().includes(text) ||
        c.email.includes(text) ||
        (digits.length >= 3 && c.phone.includes(digits))
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
  }, [contacts, q, filters, sort]);

  const visible = filtered.slice(0, limit);

  function toggleFilter(k: FilterKey) {
    setLimit(PAGE);
    setFilters((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  }

  function toggleSort(key: SortKey) {
    setSort((s) => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: key === "name" ? 1 : -1 }));
  }

  function exportCsv() {
    downloadCsv(`contacts-${new Date().toISOString().slice(0, 10)}`, filtered, [
      { header: "First name", value: (c) => c.first_name },
      { header: "Last name", value: (c) => c.last_name },
      { header: "Phone", value: (c) => formatPhone(c.phone) },
      { header: "Email", value: (c) => c.email },
      { header: "Street", value: (c) => c.street },
      { header: "City", value: (c) => c.city },
      { header: "State", value: (c) => c.state },
      { header: "ZIP", value: (c) => c.zip },
      { header: "Notes", value: (c) => c.notes },
      { header: "Source", value: (c) => c.source },
      { header: "Events", value: (c) => c.events_count },
      { header: "Attended", value: (c) => c.attended_count },
      { header: "No-shows", value: (c) => c.no_show_count },
      { header: "Last event", value: (c) => (c.last_event_at ? fmt(c.last_event_at, TZ, "yyyy-MM-dd") : "") },
      { header: "Added", value: (c) => fmt(c.created_at, TZ, "yyyy-MM-dd") },
    ]);
  }

  return (
    <Page wide>
      <PageHeader
        title="Contacts"
        description={`${contacts.length.toLocaleString()} people across all your events.`}
        actions={
          <>
            <Button variant="ghost" icon={<Download className="size-4" />} onClick={exportCsv}>
              Export
            </Button>
            <Link href="/contacts/import">
              <Button variant="secondary" icon={<Upload className="size-4" />}>
                Import
              </Button>
            </Link>
            <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setAdding(true)}>
              Add contact
            </Button>
          </>
        }
      />

      <div className="mb-5 space-y-4">
        <div className="relative max-w-md">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-ink-3" />
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setLimit(PAGE);
            }}
            placeholder="Search name, phone, or email"
            className="h-11 w-full rounded-xl bg-surface pr-10 pl-10 text-sm ring-1 ring-border transition-shadow ring-inset placeholder:text-ink-3 focus:ring-2 focus:ring-accent focus:outline-none"
          />
          <AnimatePresence>
            {query && (
              <motion.button
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                onClick={() => setQuery("")}
                className="absolute top-1/2 right-3 flex size-6 -translate-y-1/2 items-center justify-center rounded-full text-ink-3 hover:bg-surface-2 hover:text-ink"
                aria-label="Clear search"
              >
                <X className="size-3.5" />
              </motion.button>
            )}
          </AnimatePresence>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {FILTERS.map((f, i) => {
            const on = filters.has(f.key);
            return (
              <span key={f.key} className="contents">
                {i > 0 && FILTERS[i - 1].group !== f.group && <span className="mx-1 h-5 w-px bg-border" />}
                <motion.button
                  layout
                  onClick={() => toggleFilter(f.key)}
                  className={cx(
                    "inline-flex h-8 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-medium ring-1 transition-colors ring-inset",
                    on ? "bg-ink text-white ring-ink" : "bg-surface text-ink-2 ring-border hover:text-ink hover:ring-border-strong",
                  )}
                >
                  {f.label}
                  <AnimatePresence>
                    {on && (
                      <motion.span
                        initial={{ width: 0, opacity: 0 }}
                        animate={{ width: "auto", opacity: 1 }}
                        exit={{ width: 0, opacity: 0 }}
                        className="inline-flex overflow-hidden"
                      >
                        <X className="size-3" />
                      </motion.span>
                    )}
                  </AnimatePresence>
                </motion.button>
              </span>
            );
          })}
          <AnimatePresence>
            {(filters.size > 0 || q) && (
              <motion.span
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="ml-2 text-[13px] text-ink-3 tabular-nums"
              >
                {filtered.length.toLocaleString()} {filtered.length === 1 ? "match" : "matches"}
                {filters.size > 0 && (
                  <button onClick={() => setFilters(new Set())} className="ml-2 font-medium text-accent hover:underline">
                    Clear filters
                  </button>
                )}
              </motion.span>
            )}
          </AnimatePresence>
        </div>
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
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-[13px] text-ink-2">
                  <SortHead sort={sort} onSort={toggleSort} k="name" className="pl-6">
                    Name
                  </SortHead>
                  <th className="px-4 py-3 font-medium">Phone</th>
                  <th className="px-4 py-3 font-medium">Email</th>
                  <SortHead sort={sort} onSort={toggleSort} k="events" className="text-right">
                    Events
                  </SortHead>
                  <SortHead sort={sort} onSort={toggleSort} k="attended" className="text-right">
                    Attended
                  </SortHead>
                  <SortHead sort={sort} onSort={toggleSort} k="no_shows" className="text-right">
                    No-shows
                  </SortHead>
                  <SortHead sort={sort} onSort={toggleSort} k="last_event">Last event</SortHead>
                  <SortHead sort={sort} onSort={toggleSort} k="added" className="pr-6">
                    Added
                  </SortHead>
                </tr>
              </thead>
              <tbody>
                {visible.map((c, i) => {
                  const name = `${c.first_name} ${c.last_name}`;
                  return (
                    <motion.tr
                      key={c.id}
                      initial={i < 30 ? { opacity: 0, y: 4 } : false}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: Math.min(i, 30) * 0.012, duration: 0.25 }}
                      onClick={() => openContact(c.id)}
                      className={cx(
                        "cursor-pointer border-b border-border/70 transition-colors last:border-0 hover:bg-surface-2/70",
                        openId === c.id && "bg-accent-soft/50 hover:bg-accent-soft/70",
                      )}
                    >
                      <td className="py-3 pr-4 pl-6">
                        <div className="flex items-center gap-3">
                          <Avatar name={name} size="sm" />
                          <span className="font-medium text-ink">{name}</span>
                          {(c.source === "walk_in" || c.source === "guest") && (
                            <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-medium text-violet-700 ring-1 ring-violet-200 ring-inset">
                              {c.source === "guest" ? "Guest" : "Walk-in"}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {c.phone ? (
                          <a
                            href={telHref(c.phone)}
                            onClick={(e) => e.stopPropagation()}
                            className="text-ink-2 tabular-nums hover:text-accent"
                          >
                            {formatPhone(c.phone)}
                          </a>
                        ) : (
                          <span className="text-ink-3">—</span>
                        )}
                      </td>
                      <td className="max-w-[240px] truncate px-4 py-3 text-ink-2">{c.email || <span className="text-ink-3">—</span>}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{c.events_count}</td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        <span className={c.attended_count ? "text-emerald-700" : "text-ink-3"}>{c.attended_count}</span>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        <span className={c.no_show_count ? "font-medium text-rose-600" : "text-ink-3"}>{c.no_show_count}</span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-ink-2">
                        {c.last_event_at ? fmt(c.last_event_at, TZ, "MMM d, yyyy") : <span className="text-ink-3">—</span>}
                      </td>
                      <td className="py-3 pr-6 pl-4 whitespace-nowrap text-ink-3">{fmt(c.created_at, TZ, "MMM d, yyyy")}</td>
                    </motion.tr>
                  );
                })}
              </tbody>
            </table>
            {filtered.length > limit && (
              <div className="flex items-center justify-center gap-3 border-t border-border py-4 text-[13px] text-ink-3">
                Showing {limit.toLocaleString()} of {filtered.length.toLocaleString()}
                <Button size="sm" variant="secondary" onClick={() => setLimit((l) => l + PAGE * 2)}>
                  Show more
                </Button>
              </div>
            )}
          </div>
        )}
      </Card>

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
    </Page>
  );
}
