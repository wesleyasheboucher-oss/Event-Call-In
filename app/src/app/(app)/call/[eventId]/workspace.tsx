"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowLeft,
  Download,
  FileText,
  MessageSquare,
  Phone,
  Search,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import type { CallListRow } from "@/lib/types";
import { RSVP, RSVP_STATUSES, type EventStatus, type RsvpStatus } from "@/lib/status";
import { formatPhone, normalizePhone, telHref } from "@/lib/phone";
import { ago, daysUntil, eventWhen, fmt, relativeDays } from "@/lib/time";
import { downloadCsv, slug } from "@/lib/csv";
import { setRsvp } from "@/app/actions/registrations";
import { Avatar, Button, cx, IconButton, Input, Select } from "@/components/ui";
import { RsvpChip, RsvpPicker } from "@/components/status";
import { AnimatedNumber } from "@/components/animated-number";
import { CallerDrawer } from "./caller-drawer";
import { Drawer } from "@/components/drawer";

export type CallEvent = {
  id: number;
  name: string;
  start_at: string;
  time_zone: string;
  status: EventStatus;
  capacity: number | null;
  rsvp_deadline: string | null;
  caller_script: string;
  plus_ones_allowed: number;
  max_guests: number;
};

type Filter = RsvpStatus | "all";
const PAGE = 120;

export function CallWorkspace({ event, initialRows }: { event: CallEvent; initialRows: CallListRow[] }) {
  const [rows, setRows] = useState(initialRows);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [staleDays, setStaleDays] = useState(0);
  const [sort, setSort] = useState<"name" | "last_called" | "never_first">("name");
  const [openId, setOpenId] = useState<number | null>(null);
  const [scriptOpen, setScriptOpen] = useState(false);
  const [limit, setLimit] = useState(PAGE);
  // Rows changed while a filter is active stay visible (dimmed) until the filter changes,
  // so a caller's row doesn't vanish from under the cursor.
  const [pinned, setPinned] = useState<Set<number>>(new Set());
  // Reference time for "not called in X days" and the deadline banner, fixed at page load.
  const [now] = useState(() => Date.now());

  const [prevInitial, setPrevInitial] = useState(initialRows);
  if (prevInitial !== initialRows) {
    setPrevInitial(initialRows);
    setRows(initialRows);
  }

  const resetView = (fn: () => void) => {
    fn();
    setPinned(new Set());
    setLimit(PAGE);
  };

  const counts = useMemo(() => {
    const c = { all: rows.length } as Record<Filter, number>;
    for (const s of RSVP_STATUSES) c[s] = 0;
    for (const r of rows) c[r.rsvp]++;
    return c;
  }, [rows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const qDigits = normalizePhone(q);
    const cutoff = staleDays ? now - staleDays * 864e5 : 0;
    const list = rows.filter((r) => {
      if (!pinned.has(r.registration_id)) {
        if (filter !== "all" && r.rsvp !== filter) return false;
        if (cutoff && r.last_called_at && Date.parse(r.last_called_at) > cutoff) return false;
      }
      if (q) {
        const name = `${r.first_name} ${r.last_name}`.toLowerCase();
        const guests = r.guest_names?.toLowerCase() ?? "";
        if (!name.includes(q) && !guests.includes(q) && !r.email.includes(q) && !(qDigits.length >= 3 && r.phone.includes(qDigits)))
          return false;
      }
      return true;
    });
    if (sort === "last_called") list.sort((a, b) => (b.last_called_at ?? "").localeCompare(a.last_called_at ?? ""));
    if (sort === "never_first") list.sort((a, b) => (a.last_called_at ?? "").localeCompare(b.last_called_at ?? ""));
    return list;
  }, [rows, filter, query, staleDays, sort, pinned, now]);

  const patch = useCallback((id: number, p: Partial<CallListRow>) => {
    setRows((rs) => rs.map((r) => (r.registration_id === id ? { ...r, ...p } : r)));
  }, []);

  type Update = (row: CallListRow, status: RsvpStatus, opts?: { silent?: boolean }) => Promise<void>;
  const undoRef = useRef<Update>(null);

  const updateRsvp: Update = useCallback(
    async (row: CallListRow, status: RsvpStatus, opts: { silent?: boolean } = {}) => {
      const prev = row.rsvp;
      if (filter !== "all") setPinned((p) => new Set(p).add(row.registration_id));
      patch(row.registration_id, { rsvp: status });
      try {
        const res = await setRsvp(row.registration_id, status);
        patch(row.registration_id, res);
        if (!opts.silent) {
          toast(`${row.first_name} ${row.last_name} → ${RSVP[status].label}`, {
            action: { label: "Undo", onClick: () => undoRef.current?.({ ...row, rsvp: status }, prev, { silent: true }) },
          });
        }
      } catch {
        patch(row.registration_id, { rsvp: prev });
        toast.error("Couldn't save that status. Try again.");
      }
    },
    [filter, patch],
  );
  useEffect(() => {
    undoRef.current = updateRsvp;
  }, [updateRsvp]);

  const days = daysUntil(event.start_at, event.time_zone);
  const deadlinePassed = event.rsvp_deadline ? Date.parse(event.rsvp_deadline) < now : false;
  const confirmedTotal = counts.confirmed + counts.reconfirmed;
  const atCapacity = event.capacity != null && event.capacity > 0 && confirmedTotal >= event.capacity;
  const openIndex = filtered.findIndex((r) => r.registration_id === openId);
  const openRow = rows.find((r) => r.registration_id === openId) ?? null;

  // Infinite scroll for long lists
  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) setLimit((l) => l + PAGE);
    });
    io.observe(el);
    return () => io.disconnect();
  }, [filtered.length]);

  const exportCsv = () =>
    downloadCsv(`call-list-${slug(event.name)}`, filtered, [
      { header: "First name", value: (r) => r.first_name },
      { header: "Last name", value: (r) => r.last_name },
      { header: "Phone", value: (r) => formatPhone(r.phone) },
      { header: "Email", value: (r) => r.email },
      { header: "RSVP", value: (r) => RSVP[r.rsvp].label },
      { header: "Guests", value: (r) => r.guest_names },
      { header: "Last called", value: (r) => (r.last_called_at ? fmt(r.last_called_at, event.time_zone, "yyyy-MM-dd HH:mm") : "") },
      { header: "Called by", value: (r) => r.called_by_name },
      { header: "Last note", value: (r) => r.last_note },
    ]);

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-8 sm:px-8 lg:py-10">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
        <Link href="/call" className="mb-3 inline-flex items-center gap-1.5 text-sm text-ink-3 transition-colors hover:text-ink">
          <ArrowLeft className="size-4" /> All events
        </Link>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-[28px]">{event.name}</h1>
            <p className="mt-1 text-[15px] text-ink-2">
              {eventWhen(event.start_at, event.time_zone)} · <span className="font-medium text-ink">{relativeDays(days)}</span>
              {event.rsvp_deadline && !deadlinePassed && (
                <> · RSVP by {fmt(event.rsvp_deadline, event.time_zone, "MMM d")}</>
              )}
            </p>
          </div>
          <div className="flex gap-2">
            {event.caller_script && (
              <Button icon={<FileText className="size-4" />} onClick={() => setScriptOpen(true)}>
                Script
              </Button>
            )}
            <Link
              href={`/events/${event.id}`}
              className="inline-flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-medium text-ink-2 ring-1 ring-border transition-colors ring-inset hover:bg-surface-2 hover:text-ink"
            >
              Event page
            </Link>
          </div>
        </div>
      </motion.div>

      {/* Warnings */}
      <AnimatePresence>
        {(deadlinePassed || atCapacity) && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mb-6 space-y-2 overflow-hidden"
          >
            {atCapacity && (
              <div className="flex items-center gap-3 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-amber-200">
                <Users className="size-4 shrink-0" />
                <span>
                  <strong className="font-semibold">At capacity.</strong> {confirmedTotal} confirmed for {event.capacity} spots.
                </span>
              </div>
            )}
            {deadlinePassed && (
              <div className="flex items-center gap-3 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-800 ring-1 ring-rose-200">
                <AlertTriangle className="size-4 shrink-0" />
                <span>
                  <strong className="font-semibold">RSVP deadline passed</strong> on{" "}
                  {fmt(event.rsvp_deadline, event.time_zone, "MMM d 'at' h:mm a")}.
                </span>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Count tiles double as filters */}
      <div className="mb-6 grid grid-cols-3 gap-2 sm:grid-cols-6 sm:gap-3">
        {(["all", ...RSVP_STATUSES] as Filter[]).map((f) => {
          const active = filter === f;
          return (
            <button
              key={f}
              onClick={() => resetView(() => setFilter(f))}
              className={cx(
                "relative rounded-2xl px-4 py-3.5 text-left transition-all",
                active ? "bg-surface shadow-[var(--shadow-lift)] ring-2 ring-accent" : "bg-surface ring-1 ring-border hover:ring-border-strong",
              )}
            >
              <div className="flex items-center gap-1.5 text-[12px] font-medium text-ink-2">
                {f !== "all" && <span className={cx("size-2 rounded-full", RSVP[f].dot)} />}
                {f === "all" ? "Total" : RSVP[f].label}
              </div>
              <div className={cx("mt-1 text-2xl font-semibold tracking-tight tabular-nums", f === "declined" && counts[f] > 0 && "text-rose-600")}>
                <AnimatedNumber value={counts[f]} />
              </div>
            </button>
          );
        })}
      </div>

      {/* Toolbar */}
      <div className="z-20 -mx-4 mb-3 flex flex-wrap items-center gap-2 bg-bg/85 px-4 py-3 backdrop-blur sm:-mx-8 sm:px-8 lg:sticky lg:top-0">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-ink-3" />
          <Input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setLimit(PAGE);
            }}
            placeholder="Search name, phone, or email"
            className="pl-10"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              className="absolute top-1/2 right-2 flex size-6 -translate-y-1/2 items-center justify-center rounded-md text-ink-3 hover:bg-surface-2"
              aria-label="Clear search"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
        <Select value={staleDays} onChange={(e) => resetView(() => setStaleDays(Number(e.target.value)))} className="w-auto">
          <option value={0}>Any call date</option>
          <option value={1}>Not called today</option>
          <option value={3}>Not called in 3 days</option>
          <option value={7}>Not called in 7 days</option>
          <option value={14}>Not called in 14 days</option>
        </Select>
        <Select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className="w-auto">
          <option value="name">Sort: Name</option>
          <option value="never_first">Sort: Least recently called</option>
          <option value="last_called">Sort: Recently called</option>
        </Select>
        <IconButton label="Export CSV" onClick={exportCsv} className="ring-1 ring-border ring-inset">
          <Download className="size-4" />
        </IconButton>
      </div>

      <div className="mb-3 flex items-center justify-between px-1 text-xs text-ink-3">
        <span>
          Showing {Math.min(limit, filtered.length)} of {filtered.length}
          {pinned.size > 0 && " · updated rows stay until you change filters"}
        </span>
        <span className="hidden md:inline">Tip: click a phone number to dial. The person&apos;s card opens so you can log the result.</span>
      </div>

      {/* List */}
      <div className="overflow-hidden rounded-2xl bg-surface ring-1 ring-border">
        {filtered.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <div className="text-[15px] font-semibold">Nobody here</div>
            <p className="mt-1 text-sm text-ink-2">
              {filter === "no_data" ? "Everyone on this list has been contacted. Nice work." : "Try a different filter or search."}
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {filtered.slice(0, limit).map((r) => (
              <CallRow
                key={r.registration_id}
                row={r}
                dimmed={pinned.has(r.registration_id) && filter !== "all" && r.rsvp !== filter}
                active={r.registration_id === openId}
                onOpen={() => setOpenId(r.registration_id)}
                onRsvp={(s) => updateRsvp(r, s)}
              />
            ))}
          </ul>
        )}
        {limit < filtered.length && <div ref={sentinel} className="h-16" />}
      </div>

      <CallerDrawer
        event={event}
        row={openRow}
        onClose={() => setOpenId(null)}
        onRsvp={(s) => openRow && updateRsvp(openRow, s)}
        onPatch={patch}
        hasPrev={openIndex > 0}
        hasNext={openIndex >= 0 && openIndex < filtered.length - 1}
        onPrev={() => openIndex > 0 && setOpenId(filtered[openIndex - 1].registration_id)}
        onNext={() => openIndex < filtered.length - 1 && setOpenId(filtered[openIndex + 1].registration_id)}
        nextId={openIndex >= 0 ? filtered[openIndex + 1]?.registration_id : undefined}
      />

      <Drawer open={scriptOpen} onClose={() => setScriptOpen(false)} title="Call script" subtitle={event.name} width="sm">
        <div className="px-6 py-6 text-[15px] leading-relaxed whitespace-pre-wrap text-ink">{event.caller_script}</div>
      </Drawer>
    </div>
  );
}

function CallRow({
  row: r,
  dimmed,
  active,
  onOpen,
  onRsvp,
}: {
  row: CallListRow;
  dimmed: boolean;
  active: boolean;
  onOpen: () => void;
  onRsvp: (s: RsvpStatus) => void;
}) {
  const declined = r.rsvp === "declined";
  const name = `${r.first_name} ${r.last_name}`;
  return (
    <li
      onClick={onOpen}
      className={cx(
        "group relative flex cursor-pointer items-center gap-4 px-4 py-3.5 transition-[background-color,opacity] duration-300 sm:px-5",
        declined ? "bg-rose-50/50 hover:bg-rose-50" : "hover:bg-surface-2/70",
        active && "bg-accent-soft/50",
        dimmed && "opacity-45",
      )}
    >
      {/* Status rail */}
      <span className={cx("absolute inset-y-0 left-0 w-1 transition-colors duration-300", declined ? "bg-rose-500" : "bg-transparent")} />

      <Avatar name={name} size="md" />

      <div className="min-w-0 flex-1 md:w-60 md:flex-none lg:w-72">
        <div className="flex items-center gap-2">
          <span className="truncate text-[15px] font-medium">{name}</span>
          {r.note_count > 0 && (
            <span className="inline-flex shrink-0 items-center gap-0.5 text-xs text-ink-3" title={r.last_note ?? ""}>
              <MessageSquare className="size-3" />
              {r.note_count}
            </span>
          )}
          {r.guest_count > 0 && (
            <span
              className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-violet-50 px-1.5 text-[11px] font-medium text-violet-700 ring-1 ring-violet-200"
              title={`Bringing ${r.guest_names}`}
            >
              <UserPlus className="size-3" />
              {r.guest_count}
            </span>
          )}
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-xs text-ink-3">
          {r.attended_count + r.no_show_count === 0 ? (
            <span>New: no past events</span>
          ) : (
            <span>
              Attended {r.attended_count}
              {r.no_show_count > 0 && <span className="text-rose-600"> · {r.no_show_count} no-show{r.no_show_count > 1 ? "s" : ""}</span>}
            </span>
          )}
          <span className="md:hidden">
            <RsvpChip status={r.rsvp} />
          </span>
        </div>
      </div>

      <div className="hidden w-44 shrink-0 md:block">
        {r.phone ? (
          <a
            href={telHref(r.phone)}
            onClick={(e) => {
              e.stopPropagation();
              onOpen();
            }}
            className="inline-flex items-center gap-2 rounded-lg px-2 py-1 text-sm font-medium text-ink tabular-nums transition-colors hover:bg-accent-soft hover:text-accent-ink"
          >
            <Phone className="size-3.5 text-accent" />
            {formatPhone(r.phone)}
          </a>
        ) : (
          <span className="px-2 text-sm text-ink-3">No phone</span>
        )}
      </div>

      <div className="hidden min-w-0 flex-1 truncate text-sm text-ink-2 2xl:block">{r.email}</div>

      <div className="hidden shrink-0 xl:block">
        <RsvpPicker value={r.rsvp} onChange={onRsvp} size="sm" />
      </div>
      <div className="hidden shrink-0 md:block xl:hidden">
        <RsvpChip status={r.rsvp} />
      </div>

      <div className="hidden w-32 shrink-0 text-right text-xs text-ink-3 lg:block">
        {r.last_called_at ? (
          <>
            <div className="text-ink-2">{ago(r.last_called_at)}</div>
            {r.called_by_name && <div className="truncate">by {r.called_by_name}</div>}
          </>
        ) : (
          "Never called"
        )}
      </div>

      {/* Mobile call button */}
      {r.phone && (
        <a
          href={telHref(r.phone)}
          onClick={(e) => {
            e.stopPropagation();
            onOpen();
          }}
          className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent md:hidden"
          aria-label={`Call ${name}`}
        >
          <Phone className="size-4" />
        </a>
      )}
    </li>
  );
}
