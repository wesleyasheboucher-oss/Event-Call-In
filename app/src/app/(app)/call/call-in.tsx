"use client";

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { motion } from "motion/react";
import { useListLayout } from "@/components/use-layout";
import { ListSkeleton } from "@/components/list-skeleton";
import { toast } from "sonner";
import { AlertTriangle, Check, Download, FileSpreadsheet, FileText, ListFilter, Phone, Search, UserPlus, Users, X } from "lucide-react";
import type { CallInCell, CallInEvent, CallInRow, ConfirmEvent } from "@/lib/call-in";
import { RSVP, type RsvpStatus } from "@/lib/status";
import type { TagWithCount } from "@/lib/tag-colors";
import { formatPhone, normalizePhone, telHref } from "@/lib/phone";
import { ago, daysUntil, fmt, relativeDays } from "@/lib/time";
import { setRsvp } from "@/app/actions/registrations";
import { addToEventList } from "@/app/actions/call-in";
import { EventCover } from "@/components/event-cover";
import { ContactDivisionMini } from "@/components/division";
import { Avatar, cx, EmptyState, Select } from "@/components/ui";
import { StatusMenu, type MenuTarget } from "./status-menu";
import { CallInFilterSheet, confirmedWithin, countFilters, daysLabel, NO_FILTERS, statusKeyLabel, type CallInFilters } from "./call-in-filters";
import { exportExcel, exportPdf } from "./call-in-export";
import { CallInDrawer } from "./call-in-drawer";

const PAGE = 100;
type Sort = "name" | "least_recent" | "most_recent";

const shortName = (name: string) => (name.length > 22 ? `${name.slice(0, 20)}…` : name);

function lastCalled(r: CallInRow): string {
  let max = "";
  for (const c of Object.values(r.cells)) if (c.last_called_at && c.last_called_at > max) max = c.last_called_at;
  return max;
}

export function CallIn({
  events,
  selectedIds,
  everyone,
  initialRows,
  tags,
  confirmEvents,
}: {
  events: CallInEvent[];
  selectedIds: number[];
  everyone: boolean;
  initialRows: CallInRow[];
  tags: TagWithCount[];
  confirmEvents: ConfirmEvent[];
}) {
  const router = useRouter();
  const layout = useListLayout();
  const pathname = usePathname();
  const [switching, startSwitch] = useTransition();
  const [rows, setRows] = useState(initialRows);
  const [prevInitial, setPrevInitial] = useState(initialRows);
  if (prevInitial !== initialRows) {
    setPrevInitial(initialRows);
    setRows(initialRows);
  }

  const selected = useMemo(() => events.filter((e) => selectedIds.includes(e.id)), [events, selectedIds]);
  const [query, setQuery] = useState("");
  const q = useDeferredValue(query);
  const [filters, setFilters] = useState<CallInFilters>(() => ({ ...NO_FILTERS, scope: everyone ? "everyone" : "listed" }));
  const { scope, divisions, contactsOnly, activeOnly, status: statusFilters, tags: tagFilter, confirmed } = filters;
  const [filtersOpen, setFiltersOpen] = useState(false);
  // Latest filters for back-to-back taps that land before a re-render.
  const filtersRef = useRef(filters);
  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting] = useState<null | "xlsx" | "pdf">(null);
  const [sort, setSort] = useState<Sort>("name");
  const [limit, setLimit] = useState(PAGE);
  const [openId, setOpenId] = useState<number | null>(null);
  const [menu, setMenu] = useState<(MenuTarget & { contactId: number; eventId: number }) | null>(null);

  // Changing which events are included (or Everyone) updates the URL; the server sends fresh rows.
  const navigate = (ids: number[], all: boolean) =>
    startSwitch(() => {
      router.replace(`${pathname}?e=${ids.length ? ids.join(",") : "none"}${all ? "&all=1" : ""}`, { scroll: false });
    });
  const setSelected = (ids: number[]) => navigate(ids, scope === "everyone");
  const toggleEvent = (id: number) =>
    setSelected(selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id]);

  const filtered = useMemo(() => {
    const text = q.trim().toLowerCase();
    const digits = normalizePhone(text);
    const list = rows.filter((r) => {
      const cells = selected.map((e) => r.cells[e.id]).filter(Boolean) as CallInCell[];
      if (scope === "listed" && cells.length === 0) return false;
      if (divisions.size && (r.division == null || !divisions.has(r.division))) return false;
      // "Contacts only": leave out anyone who is someone's plus-one.
      if (contactsOnly && (r.source === "guest" || cells.some((c) => c.guest_of_name))) return false;
      if (activeOnly && r.active === 0) return false;
      for (const e of selected) {
        const picks = statusFilters[e.id];
        if (picks?.length && !picks.includes(r.cells[e.id]?.status ?? "no_data")) return false;
      }
      if (tagFilter.size && !r.tag_ids.some((id) => tagFilter.has(id))) return false;
      if (!confirmedWithin(r.confirmed_at, confirmed)) return false;
      if (!text) return true;
      return (
        `${r.first_name} ${r.last_name}`.toLowerCase().includes(text) ||
        `${r.last_name} ${r.first_name}`.toLowerCase().includes(text) ||
        r.email.includes(text) ||
        (digits.length >= 3 && (r.phone.includes(digits) || r.alt_phone.includes(digits)))
      );
    });
    const byName = (a: CallInRow, b: CallInRow) =>
      a.last_name.localeCompare(b.last_name, undefined, { sensitivity: "base" }) ||
      a.first_name.localeCompare(b.first_name, undefined, { sensitivity: "base" });
    if (sort === "name") list.sort(byName);
    else list.sort((a, b) => (sort === "least_recent" ? 1 : -1) * lastCalled(a).localeCompare(lastCalled(b)) || byName(a, b));
    return list;
  }, [rows, selected, scope, statusFilters, divisions, contactsOnly, activeOnly, tagFilter, confirmed, q, sort]);

  // Per-event counts for the column headers / event chips.
  const counts = useMemo(() => {
    const out: Record<number, Record<RsvpStatus, number> & { total: number }> = {};
    for (const e of selected) {
      const c = { total: 0, no_data: 0, confirmed: 0, tentative: 0, reconfirmed: 0, declined: 0 };
      for (const r of rows) {
        const cell = r.cells[e.id];
        if (cell) {
          c.total++;
          c[cell.status]++;
        }
      }
      out[e.id] = c;
    }
    return out;
  }, [rows, selected]);

  const patchCell = useCallback((contactId: number, eventId: number, p: Partial<CallInCell> | null, full?: CallInCell) => {
    setRows((rs) =>
      rs.map((r) => {
        if (r.contact_id !== contactId) return r;
        const cells = { ...r.cells };
        if (full) cells[eventId] = full;
        else if (p === null) delete cells[eventId];
        else if (cells[eventId]) cells[eventId] = { ...cells[eventId], ...p };
        // A confirmation made here counts for "Confirmed recently" right away; a change away from it removes it.
        const status = (full ?? p)?.status ?? (p === null ? "no_data" : undefined);
        let confirmed_at = r.confirmed_at;
        if (status) {
          confirmed_at = { ...r.confirmed_at };
          const was = r.cells[eventId]?.status;
          if (status === "confirmed" || status === "reconfirmed") {
            if (was !== "confirmed" && was !== "reconfirmed") confirmed_at[eventId] = new Date().toISOString();
          } else delete confirmed_at[eventId];
        }
        return { ...r, cells, confirmed_at };
      }),
    );
  }, []);

  const rowsRef = useRef(rows);
  useEffect(() => {
    rowsRef.current = rows;
  });

  type SetStatus = (contactId: number, eventId: number, status: RsvpStatus, opts?: { silent?: boolean }) => Promise<void>;
  const undoRef = useRef<SetStatus>(null);

  /** Set one person's status on one event (adds them to the list if needed). Undo-able. */
  const setStatus: SetStatus = useCallback(
    async (contactId: number, eventId: number, status: RsvpStatus, opts: { silent?: boolean } = {}) => {
      const row = rowsRef.current.find((r) => r.contact_id === contactId);
      const event = events.find((e) => e.id === eventId);
      if (!row || !event) return;
      const cell = row.cells[eventId];
      const name = `${row.first_name} ${row.last_name}`;
      if (cell?.guest_of_name) {
        toast(`${name} is ${cell.guest_of_name}'s guest. Their status follows ${cell.guest_of_name}.`);
        return;
      }
      try {
        // No registration yet is shown as No Data; recording any other status adds them to the list.
        if (!cell) {
          if (status === "no_data") return;
          const created = await addToEventList(eventId, contactId, status);
          patchCell(contactId, eventId, null, created);
          if (!opts.silent) toast(`${name} → ${RSVP[status].label}`, { description: event.name });
          return;
        }
        if (cell.status === status) return;
        const prev = cell.status;
        patchCell(contactId, eventId, { status });
        const res = await setRsvp(cell.registration_id, status);
        patchCell(contactId, eventId, res);
        if (!opts.silent) {
          toast(`${name} → ${RSVP[status].label}`, {
            description: event.name,
            action: { label: "Undo", onClick: () => undoRef.current?.(contactId, eventId, prev, { silent: true }) },
          });
        }
      } catch {
        if (cell) patchCell(contactId, eventId, { status: cell.status });
        toast.error("Couldn't save that. Try again.");
      }
    },
    [events, patchCell],
  );
  useEffect(() => {
    undoRef.current = setStatus;
  }, [setStatus]);

  const openMenu = (e: React.MouseEvent, row: CallInRow, event: CallInEvent) => {
    e.stopPropagation();
    const cell = row.cells[event.id];
    if (cell?.guest_of_name) {
      setOpenId(row.contact_id);
      return;
    }
    setMenu({
      rect: (e.currentTarget as HTMLElement).getBoundingClientRect(),
      viewport: { width: window.innerWidth, height: window.innerHeight },
      personName: `${row.first_name} ${row.last_name}`,
      eventName: event.name,
      current: cell?.status ?? "no_data",
      contactId: row.contact_id,
      eventId: event.id,
    });
  };

  // Infinite scroll
  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => entries[0].isIntersecting && setLimit((l) => l + PAGE));
    io.observe(el);
    return () => io.disconnect();
  }, [filtered.length]);

  const setDivision = (contactId: number, division: number | null) =>
    setRows((rs) => rs.map((r) => (r.contact_id === contactId ? { ...r, division } : r)));

  const openIndex = filtered.findIndex((r) => r.contact_id === openId);
  const openRow = rows.find((r) => r.contact_id === openId) ?? null;

  const activeStatusFilters = selected.filter((e) => statusFilters[e.id]?.length);
  const filterSummary = [
    divisions.size ? [...divisions].sort().map((d) => `Div ${d}`).join(" or ") : "",
    contactsOnly ? "Contacts only" : "",
    activeOnly ? "Active only" : "",
    ...activeStatusFilters.map((e) => `${e.name}: ${statusFilters[e.id].map(statusKeyLabel).join(", ")}`),
  ]
    .filter(Boolean)
    .join(" · ");

  const filterCount = countFilters(filters, selected);
  // "Everyone" needs rows the server didn't send at first, so it goes through the URL.
  const changeFilters = (update: (prev: CallInFilters) => CallInFilters) => {
    const prev = filtersRef.current;
    const next = update(prev);
    filtersRef.current = next;
    setFilters(next);
    setLimit(PAGE);
    if (next.scope !== prev.scope) navigate(selectedIds, next.scope === "everyone");
  };
  const tagName = new Map(tags.map((t) => [t.id, t.name]));
  const activeChips: { key: string; label: string; clear: (f: CallInFilters) => Partial<CallInFilters> }[] = [
    ...(scope === "everyone" ? [{ key: "scope", label: "Everyone", clear: () => ({ scope: "listed" as const }) }] : []),
    ...[...divisions].sort().map((d) => ({
      key: `div${d}`,
      label: `Div ${d}`,
      clear: (f: CallInFilters) => ({ divisions: new Set([...f.divisions].filter((x) => x !== d)) }),
    })),
    ...(contactsOnly ? [{ key: "contacts", label: "Contacts only", clear: () => ({ contactsOnly: false }) }] : []),
    ...(activeOnly ? [{ key: "active", label: "Active only", clear: () => ({ activeOnly: false }) }] : []),
    ...activeStatusFilters.map((e) => ({
      key: `st${e.id}`,
      label: `${shortName(e.name)}: ${statusFilters[e.id].map(statusKeyLabel).join(", ")}`,
      clear: (f: CallInFilters) => ({ status: { ...f.status, [e.id]: [] } }),
    })),
    ...(confirmed.days != null
      ? [
          {
            key: "confirmed",
            label: `Confirmed${confirmed.eventId != null ? ` for ${shortName(confirmEvents.find((e) => e.id === confirmed.eventId)?.name ?? "event")}` : ""} in last ${daysLabel(confirmed.days)}`,
            clear: () => ({ confirmed: { eventId: null, days: null } }),
          },
        ]
      : []),
    ...[...tagFilter].map((id) => ({
      key: `tag${id}`,
      label: tagName.get(id) ?? "Tag",
      clear: (f: CallInFilters) => ({ tags: new Set([...f.tags].filter((x) => x !== id)) }),
    })),
  ];

  const runExport = async (kind: "xlsx" | "pdf") => {
    setExportOpen(false);
    setExporting(kind);
    try {
      if (kind === "xlsx") await exportExcel(filtered, selected);
      else await exportPdf(filtered, selected, filterSummary ? `Filters: ${filterSummary}` : "");
    } catch {
      toast.error("Couldn't create the file. Try again.");
    } finally {
      setExporting(null);
    }
  };

  return (
    <div className="mx-auto max-w-[1500px] px-4 py-6 sm:px-8 lg:py-10">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-[28px]">Call In</h1>
        <p className="mt-1 text-[15px] text-ink-2">Pick the events you&apos;re calling for. Each one becomes a column.</p>
      </motion.div>

      {/* Event picker */}
      {events.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border-strong p-10 text-center text-sm text-ink-2">
          No upcoming events need calls right now.
        </div>
      ) : (
        <div className="-mx-4 mb-6 flex snap-x gap-3 overflow-x-auto px-4 pt-1 pb-3 [scrollbar-width:none] sm:-mx-8 sm:px-8">
          {events.map((e) => {
            const on = selectedIds.includes(e.id);
            const days = daysUntil(e.start_at, e.time_zone);
            const pct = e.list_size ? Math.round(((e.list_size - e.not_contacted) / e.list_size) * 100) : 0;
            // Live counts for selected events (they change as you call); the server's otherwise.
            const live = counts[e.id];
            const confirms = live ? live.confirmed + live.reconfirmed : e.confirms;
            return (
              <button
                key={e.id}
                onClick={() => toggleEvent(e.id)}
                aria-pressed={on}
                className={cx(
                  "group relative flex w-64 shrink-0 snap-start items-center gap-3 rounded-2xl bg-surface p-2.5 pr-9 text-left transition-all sm:w-72",
                  on ? "shadow-[var(--shadow-lift)] ring-2 ring-accent" : "ring-1 ring-border hover:ring-border-strong",
                )}
              >
                <span className="w-16 shrink-0">
                  <EventCover src={e.cover_thumb} category={e.category} name={e.name} rounded="rounded-xl" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{e.name}</span>
                  <span className="block truncate text-xs text-ink-2">
                    {relativeDays(days)} · {fmt(e.start_at, e.time_zone, "MMM d")}
                  </span>
                  <span className="mt-0.5 block text-xs font-semibold text-emerald-700 tabular-nums">
                    {confirms.toLocaleString()} {confirms === 1 ? "confirm" : "confirms"}
                    {e.capacity ? <span className="font-normal text-ink-3"> / {e.capacity.toLocaleString()}</span> : null}
                  </span>
                  <span className="mt-1.5 flex items-center gap-2">
                    <span className="h-1 flex-1 overflow-hidden rounded-full bg-stone-100">
                      <span className="block h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
                    </span>
                    <span className="text-[10px] text-ink-3 tabular-nums" title="Share of the list contacted">
                      {pct}% called
                    </span>
                  </span>
                </span>
                <span
                  className={cx(
                    "absolute top-2 right-2 flex size-5 items-center justify-center rounded-full transition-colors",
                    on ? "bg-accent text-white" : "ring-1 ring-border-strong",
                  )}
                >
                  {on && <Check className="size-3" strokeWidth={3} />}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Toolbar */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 basis-full sm:basis-64">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-ink-3" />
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setLimit(PAGE);
            }}
            placeholder="Search name, phone, or email"
            className="h-11 w-full rounded-xl bg-surface pr-10 pl-10 text-base ring-1 ring-border ring-inset placeholder:text-ink-3 focus:ring-2 focus:ring-accent focus:outline-none sm:h-10 sm:text-sm"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              className="absolute top-1/2 right-2 flex size-8 -translate-y-1/2 items-center justify-center rounded-lg text-ink-3 hover:bg-surface-2"
              aria-label="Clear search"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
        <button
          onClick={() => setFiltersOpen(true)}
          className={cx(
            "flex h-10 min-w-0 flex-1 items-center justify-center gap-2 rounded-xl px-3.5 text-sm font-medium ring-1 transition-colors ring-inset sm:flex-none",
            filterCount ? "bg-ink text-white ring-ink" : "bg-surface text-ink-2 ring-border hover:text-ink",
          )}
        >
          <ListFilter className="size-4 shrink-0" />
          Filters
          {filterCount > 0 && <span className="rounded-full bg-white/20 px-1.5 text-[11px] tabular-nums">{filterCount}</span>}
        </button>
        <Select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="h-10 w-auto min-w-0 flex-1 sm:flex-none" aria-label="Sort">
          <option value="name">Sort: Name</option>
          <option value="least_recent">Sort: Oldest call</option>
          <option value="most_recent">Sort: Latest call</option>
        </Select>
        <div className="relative">
          <button
            onClick={() => setExportOpen((o) => !o)}
            disabled={!!exporting || selected.length === 0}
            className="flex size-10 items-center justify-center rounded-xl text-ink-2 ring-1 ring-border ring-inset hover:bg-surface-2 disabled:opacity-50"
            aria-label="Download list"
            aria-expanded={exportOpen}
            title="Download list"
          >
            <Download className={cx("size-4", exporting && "animate-pulse")} />
          </button>
          {exportOpen && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setExportOpen(false)} />
              <motion.div
                initial={{ opacity: 0, y: -4, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                className="absolute top-12 right-0 z-40 w-60 rounded-2xl bg-surface p-1.5 shadow-[var(--shadow-lift)] ring-1 ring-border"
              >
                <div className="px-3 pt-1.5 pb-2 text-xs text-ink-3">
                  {filtered.length.toLocaleString()} {filtered.length === 1 ? "person" : "people"}: name, division, phone, and a status per event
                </div>
                {(
                  [
                    ["xlsx", "Excel (.xlsx)", FileSpreadsheet],
                    ["pdf", "PDF", FileText],
                  ] as const
                ).map(([kind, label, Icon]) => (
                  <button
                    key={kind}
                    onClick={() => runExport(kind)}
                    className="flex h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-medium hover:bg-surface-2"
                  >
                    <Icon className={cx("size-4", kind === "xlsx" ? "text-emerald-600" : "text-rose-600")} />
                    {label}
                  </button>
                ))}
              </motion.div>
            </>
          )}
        </div>
      </div>

      {activeChips.length > 0 && (
        <div className="-mx-4 mb-3 flex items-center gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0">
          {activeChips.map((c) => (
            <span
              key={c.key}
              className="inline-flex h-8 shrink-0 items-center gap-1 rounded-full bg-accent-soft pr-1 pl-3 text-[13px] text-accent-ink"
            >
              <button onClick={() => setFiltersOpen(true)} className="max-w-[260px] truncate">
                {c.label}
              </button>
              <button
                onClick={() => changeFilters((f) => ({ ...f, ...c.clear(f) }))}
                className="flex size-6 items-center justify-center rounded-full hover:bg-indigo-100"
                aria-label={`Remove filter: ${c.label}`}
              >
                <X className="size-3.5" />
              </button>
            </span>
          ))}
          <button onClick={() => changeFilters(() => NO_FILTERS)} className="shrink-0 px-2 text-xs font-medium text-accent">
            Clear all
          </button>
        </div>
      )}

      <div className="mb-2 flex items-center justify-between px-1 text-xs text-ink-3">
        <span>
          {filtered.length.toLocaleString()} {filtered.length === 1 ? "person" : "people"}
          {switching && " · updating…"}
        </span>
        <span className="hidden lg:inline">Click a status to change it · press 1–5 in the menu</span>
      </div>

      {selected.length === 0 ? (
        <div className="rounded-2xl bg-surface ring-1 ring-border">
          <EmptyState icon={<Users className="size-5" />} title="Pick at least one event" body="Tap an event above to add it as a column." />
        </div>
      ) : (
        <motion.div
          animate={{ opacity: switching ? 0.55 : 1 }}
          className="overflow-hidden rounded-2xl bg-surface ring-1 ring-border"
        >
          {filtered.length === 0 ? (
            <EmptyState
              icon={<Users className="size-5" />}
              title="Nobody here"
              body={
                activeStatusFilters.length && activeStatusFilters.every((e) => statusFilters[e.id].join() === "no_data")
                  ? "Everyone on these lists has been contacted. Nice work."
                  : "Try a different filter or search."
              }
            />
          ) : (
            <>
              {/* Desktop grid */}
              {layout === "table" && (
<div className="overflow-x-auto">
                <table className="w-full text-sm" style={{ minWidth: 520 + selected.length * 170 }}>
                  <thead>
                    <tr className="border-b border-border text-left align-bottom">
                      <th className="sticky left-0 z-10 w-[300px] min-w-[260px] bg-surface py-3 pr-4 pl-5 text-[13px] font-medium text-ink-2">Person</th>
                      <th className="px-3 py-3 text-[13px] font-medium text-ink-2">Phone</th>
                      {selected.map((e) => (
                        <EventHeader key={e.id} event={e} counts={counts[e.id]} onRemove={() => toggleEvent(e.id)} />
                      ))}
                      <th className="py-3 pr-5 pl-3 text-right text-[13px] font-medium text-ink-2">Last called</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.slice(0, limit).map((r) => {
                      const name = `${r.first_name} ${r.last_name}`;
                      const lc = lastCalled(r);
                      const declined = selected.some((e) => r.cells[e.id]?.status === "declined");
                      return (
                        <tr
                          key={r.contact_id}
                          onClick={() => setOpenId(r.contact_id)}
                          className={cx(
                            "group cursor-pointer border-b border-border/70 transition-colors last:border-0 hover:bg-surface-2/60",
                            openId === r.contact_id && "bg-accent-soft/50",
                            r.active === 0 && "[&_td]:opacity-60",
                          )}
                        >
                          <td
                            className={cx(
                              "sticky left-0 z-10 bg-surface py-3 pr-4 pl-5 transition-colors group-hover:bg-[#f9f8f7]",
                              openId === r.contact_id && "bg-accent-soft",
                            )}
                          >
                            {/* Name on the left, division toggle pinned to the column's right edge so it lines up on every row */}
                            <div className="flex items-center gap-3">
                              <Avatar name={name} size="sm" />
                              <div className="flex min-w-0 flex-1 items-center gap-2">
                                <span className="truncate font-medium">{name}</span>
                                {declined && <span className="size-1.5 shrink-0 rounded-full bg-rose-500" title="Declined an event" />}
                              </div>
                              <ContactDivisionMini compact contactId={r.contact_id} value={r.division} onChange={(d) => setDivision(r.contact_id, d)} />
                            </div>
                          </td>
                          <td className="px-3 py-3 whitespace-nowrap">
                            {r.phone ? (
                              <a
                                href={telHref(r.phone)}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setOpenId(r.contact_id);
                                }}
                                className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 font-medium tabular-nums transition-colors hover:bg-accent-soft hover:text-accent-ink"
                              >
                                <Phone className="size-3.5 text-accent" />
                                {formatPhone(r.phone)}
                              </a>
                            ) : (
                              <span className="px-2 text-ink-3">No phone</span>
                            )}
                          </td>
                          {selected.map((e) => (
                            <td key={e.id} className="px-3 py-3">
                              <StatusCell cell={r.cells[e.id]} onClick={(ev) => openMenu(ev, r, e)} />
                            </td>
                          ))}
                          <td className="py-3 pr-5 pl-3 text-right text-xs whitespace-nowrap text-ink-3">{lc ? ago(lc) : "Never"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
)}

{/* Phone cards */}
              {layout === "cards" && (
<ul className="divide-y divide-border">
                {filtered.slice(0, limit).map((r) => {
                  const name = `${r.first_name} ${r.last_name}`;
                  return (
                    <li
                      key={r.contact_id}
                      onClick={() => setOpenId(r.contact_id)}
                      className={cx("px-4 py-4 active:bg-surface-2", r.active === 0 && "opacity-60")}
                    >
                      <div className="flex items-center gap-3">
                        <Avatar name={name} size="md" />
                        <div className="min-w-0 flex-1">
                          <div className="flex min-w-0 items-center gap-2">
                            <span className="truncate text-[15px] font-semibold">{name}</span>
                          </div>
                        </div>
                        {r.phone && (
                          <a
                            href={telHref(r.phone)}
                            onClick={(e) => {
                              e.stopPropagation();
                              setOpenId(r.contact_id);
                            }}
                            className="flex size-11 shrink-0 items-center justify-center rounded-full bg-accent text-white shadow-md shadow-indigo-500/20"
                            aria-label={`Call ${name}`}
                          >
                            <Phone className="size-4" />
                          </a>
                        )}
                      </div>
                      <div className="mt-3 space-y-1.5 pl-12">
                        <ContactDivisionMini contactId={r.contact_id} value={r.division} onChange={(d) => setDivision(r.contact_id, d)} />
                        {selected.map((e) => (
                          <div key={e.id} className="flex items-center gap-2">
                            <span className="min-w-0 flex-1 truncate text-xs text-ink-2">{shortName(e.name)}</span>
                            <StatusCell cell={r.cells[e.id]} onClick={(ev) => openMenu(ev, r, e)} />
                          </div>
                        ))}
                      </div>
                    </li>
                  );
                })}
              </ul>
)}

              {layout === null && <ListSkeleton />}
              {limit < filtered.length && <div ref={sentinel} className="h-16" />}
            </>
          )}
        </motion.div>
      )}

      <CallInFilterSheet
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        events={selected}
        confirmEvents={confirmEvents}
        tags={tags}
        value={filters}
        onChange={changeFilters}
        resultCount={filtered.length}
      />

      <StatusMenu
        target={menu}
        onClose={() => setMenu(null)}
        onPick={(s) => {
          if (menu) setStatus(menu.contactId, menu.eventId, s);
          setMenu(null);
        }}
      />

      <CallInDrawer
        row={openRow}
        events={selected}
        onClose={() => setOpenId(null)}
        onStatus={(eventId, s) => openRow && setStatus(openRow.contact_id, eventId, s)}
        onPatchCell={(eventId, p) => openRow && patchCell(openRow.contact_id, eventId, p)}
        onDivision={(division) => openRow && setDivision(openRow.contact_id, division)}
        onOpenContact={setOpenId}
        onActive={(active) =>
          openRow && setRows((rs) => rs.map((r) => (r.contact_id === openRow.contact_id ? { ...r, active } : r)))
        }
        hasPrev={openIndex > 0}
        hasNext={openIndex >= 0 && openIndex < filtered.length - 1}
        onPrev={() => openIndex > 0 && setOpenId(filtered[openIndex - 1].contact_id)}
        onNext={() => openIndex < filtered.length - 1 && setOpenId(filtered[openIndex + 1].contact_id)}
      />
    </div>
  );
}

function EventHeader({
  event: e,
  counts,
  onRemove,
}: {
  event: CallInEvent;
  counts: Record<RsvpStatus, number> & { total: number };
  onRemove: () => void;
}) {
  const deadlinePassed = e.deadline_passed;
  const confirmed = counts.confirmed + counts.reconfirmed;
  const atCapacity = e.capacity != null && e.capacity > 0 && confirmed >= e.capacity;
  const order = ["reconfirmed", "confirmed", "tentative", "declined", "no_data"] as const;
  return (
    <th className="w-[170px] min-w-[170px] px-3 py-3 font-normal">
      <div className="group/h flex items-start gap-1">
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-semibold text-ink" title={e.name}>
            {e.name}
          </div>
          <div className="mt-0.5 flex items-center gap-1 text-[11px] text-ink-3">
            {fmt(e.start_at, e.time_zone, "EEE MMM d")}
            {(deadlinePassed || atCapacity) && (
              <span
                className="inline-flex items-center gap-0.5 text-amber-600"
                title={[atCapacity && `At capacity (${confirmed}/${e.capacity})`, deadlinePassed && "Registration deadline passed"]
                  .filter(Boolean)
                  .join(" · ")}
              >
                <AlertTriangle className="size-3" />
                {atCapacity ? "Full" : "Past deadline"}
              </span>
            )}
          </div>
        </div>
        <button
          onClick={onRemove}
          className="flex size-6 shrink-0 items-center justify-center rounded-md text-ink-3 opacity-0 transition-opacity group-hover/h:opacity-100 hover:bg-surface-2 hover:text-ink"
          aria-label={`Hide ${e.name}`}
          title="Remove this event column"
        >
          <X className="size-3.5" />
        </button>
      </div>
      <div className="mt-2 flex h-1.5 overflow-hidden rounded-full bg-stone-100">
        {counts.total > 0 &&
          order.map((s) =>
            counts[s] ? (
              <div key={s} className={cx("h-full", RSVP[s].dot)} style={{ width: `${(counts[s] / counts.total) * 100}%` }} />
            ) : null,
          )}
      </div>
      <div className="mt-1 text-[11px] text-ink-3 tabular-nums">
        {counts.no_data} to call · {confirmed} {confirmed === 1 ? "confirm" : "confirms"}
      </div>
    </th>
  );
}

function StatusCell({ cell, onClick }: { cell: CallInCell | undefined; onClick: (e: React.MouseEvent) => void }) {
  if (cell?.guest_of_name) {
    return (
      <button
        onClick={onClick}
        title={`Guest of ${cell.guest_of_name}. Their status follows the host.`}
        className="inline-flex h-8 max-w-[160px] items-center gap-1 rounded-full bg-violet-50 px-2.5 text-xs font-medium text-violet-700 ring-1 ring-violet-200 ring-inset md:h-7"
      >
        <UserPlus className="size-3 shrink-0" />
        <span className="truncate">Guest · {RSVP[cell.status].label}</span>
      </button>
    );
  }
  const status = cell?.status ?? "no_data";
  const s = RSVP[status];
  return (
    <button
      onClick={onClick}
      className={cx(
        "inline-flex h-8 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium ring-1 ring-inset transition-[transform,box-shadow] hover:shadow-sm active:scale-95 md:h-7",
        s.chip,
        status === "declined" && "font-semibold",
      )}
    >
      <motion.span
        key={status}
        initial={{ scale: 0.4 }}
        animate={{ scale: 1 }}
        transition={{ type: "spring", stiffness: 700, damping: 20 }}
        className={cx("size-1.5 rounded-full", s.dot)}
      />
      {s.label}
      {cell && cell.guest_count > 0 && <span className="text-[10px] opacity-70">+{cell.guest_count}</span>}
    </button>
  );
}
