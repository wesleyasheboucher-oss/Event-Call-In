"use client";

import { memo, useCallback, useDeferredValue, useMemo, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { toast } from "sonner";
import { ArrowLeft, Check, Download, Flag, Info, RotateCcw, Search, UserPlus, X } from "lucide-react";
import { setAttendance } from "@/app/actions/registrations";
import { fetchHostAndGuestRows } from "@/app/actions/signin";
import { Avatar, Button, Chip, cx, IconButton } from "@/components/ui";
import { EventStatusChip, RsvpChip } from "@/components/status";
import { EXPECTED_RSVPS, type AttendanceStatus, type EventStatus } from "@/lib/status";
import { eventWhen, fmt } from "@/lib/time";
import { downloadCsv, slug } from "@/lib/csv";
import { formatPhone } from "@/lib/phone";
import type { SignInRow } from "./data";
import { AnimatedNumber, ProgressRing } from "./counter";
import { WalkInDrawer } from "./walk-in-drawer";
import { PersonDrawer } from "./person-drawer";
import { CloseOutModal } from "./close-out-modal";
import { ContactDivisionBadge } from "@/components/division";

export type SignInEvent = {
  id: number;
  name: string;
  start_at: string;
  end_at: string | null;
  time_zone: string;
  venue_name: string;
  status: EventStatus;
  signin_instructions: string;
  plus_ones_allowed: number;
  max_guests: number;
};

type Filter = "all" | "expected" | "checked" | "not_yet";
const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "expected", label: "Expected" },
  { key: "checked", label: "Checked in" },
  { key: "not_yet", label: "Not yet" },
];
const PAGE = 120;

const isExpected = (r: SignInRow) => EXPECTED_RSVPS.includes(r.rsvp);
const noopSubscribe = () => () => {};
function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function SignInScreen({ event, initialRows }: { event: SignInEvent; initialRows: SignInRow[] }) {
  const [rows, setRows] = useState(initialRows);
  const [status, setStatus] = useState(event.status);
  const [query, setQuery] = useState("");
  const deferred = useDeferredValue(query);
  const [filter, setFilter] = useState<Filter>("all");
  const [limit, setLimit] = useState(PAGE);
  const [highlight, setHighlight] = useState<number | null>(null);
  const [openId, setOpenId] = useState<number | null>(null);
  const [walkInOpen, setWalkInOpen] = useState(false);
  const [closeOutOpen, setCloseOutOpen] = useState(false);
  const [tipsDismissed, setTipsDismissed] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const tipsKey = `signin-tips-${event.id}`;
  const tipsHiddenBefore = useSyncExternalStore(
    noopSubscribe,
    () => readStorage(tipsKey) === "hidden",
    () => true,
  );
  const showTips = !!event.signin_instructions && !tipsDismissed && !tipsHiddenBefore;

  const dismissTips = () => {
    setTipsDismissed(true);
    try {
      localStorage.setItem(tipsKey, "hidden");
    } catch {}
  };

  const changeQuery = (q: string) => {
    setQuery(q);
    setLimit(PAGE);
  };
  const changeFilter = (f: Filter) => {
    setFilter(f);
    setLimit(PAGE);
  };

  // Precomputed search keys keep filtering cheap for thousands of rows.
  const index = useMemo(
    () =>
      rows.map((r) => ({
        row: r,
        name: `${r.first_name} ${r.last_name}`.toLowerCase(),
        rev: `${r.last_name} ${r.first_name}`.toLowerCase(),
        email: r.email,
      })),
    [rows],
  );

  const counts = useMemo(() => {
    let checked = 0;
    let expected = 0;
    let expectedChecked = 0;
    for (const r of rows) {
      const exp = isExpected(r);
      if (exp) expected++;
      if (r.attendance === "attended") {
        checked++;
        if (exp) expectedChecked++;
      }
    }
    return { checked, expected, expectedChecked, total: rows.length };
  }, [rows]);

  const filtered = useMemo(() => {
    const q = deferred.trim().toLowerCase();
    const digits = q.replace(/\D/g, "");
    const textQ = q.replace(/[^a-z@.\s'-]/g, "").trim();
    return index
      .filter(({ row, name, rev, email }) => {
        if (filter === "expected" && !isExpected(row)) return false;
        if (filter === "checked" && row.attendance !== "attended") return false;
        if (filter === "not_yet" && row.attendance === "attended") return false;
        if (!q) return true;
        if (digits.length >= 3 && row.phone.includes(digits)) return true;
        if (textQ && (name.includes(textQ) || rev.includes(textQ) || (textQ.includes("@") && email.includes(textQ)))) return true;
        return false;
      })
      .map((x) => x.row);
  }, [index, deferred, filter]);

  const patch = useCallback((id: number, p: Partial<SignInRow>) => {
    setRows((rs) => rs.map((r) => (r.registration_id === id ? { ...r, ...p } : r)));
  }, []);

  const mark = useCallback(
    async (row: SignInRow, to: AttendanceStatus) => {
      const prev = { attendance: row.attendance, checked_in_at: row.checked_in_at };
      patch(row.registration_id, { attendance: to, checked_in_at: to === "attended" ? new Date().toISOString() : null });
      try {
        const res = await setAttendance(row.registration_id, to);
        patch(row.registration_id, { checked_in_at: res.checked_in_at });
        const name = `${row.first_name} ${row.last_name}`;
        if (to === "attended") {
          toast.success(`${name} checked in`, {
            action: {
              label: "Undo",
              onClick: () => {
                patch(row.registration_id, { attendance: "pending", checked_in_at: null });
                setAttendance(row.registration_id, "pending").catch(() => toast.error("Couldn't undo — try again."));
              },
            },
          });
          // Ready for the next person.
          changeQuery("");
          searchRef.current?.focus();
        } else {
          toast(`${name} set back to pending`);
        }
      } catch {
        patch(row.registration_id, prev);
        toast.error("Couldn't save — check your connection and try again.");
      }
    },
    [patch],
  );

  const onWalkInAdded = useCallback((row: SignInRow) => {
    setRows((rs) => [row, ...rs.filter((r) => r.registration_id !== row.registration_id)]);
    setHighlight(row.registration_id);
    changeFilter("all");
    changeQuery("");
    setTimeout(() => setHighlight((h) => (h === row.registration_id ? null : h)), 2400);
  }, []);

  // Guests added/removed in the person drawer: merge their rows in, newest highlighted.
  const onGuestsChanged = useCallback(async (hostId: number) => {
    const fresh = await fetchHostAndGuestRows(hostId);
    setRows((rs) => {
      const known = new Set(rs.map((r) => r.registration_id));
      const freshIds = new Set(fresh.map((r) => r.registration_id));
      const added = fresh.filter((r) => !known.has(r.registration_id));
      const kept = rs
        .filter((r) => r.guest_of !== hostId || freshIds.has(r.registration_id))
        .map((r) => fresh.find((f) => f.registration_id === r.registration_id) ?? r);
      if (added.length) {
        const id = added[added.length - 1].registration_id;
        setHighlight(id);
        setTimeout(() => setHighlight((h) => (h === id ? null : h)), 2400);
      }
      return [...added, ...kept];
    });
  }, []);

  const exportCsv = () =>
    downloadCsv(`${slug(event.name)}-attendance`, rows, [
      { header: "First name", value: (r) => r.first_name },
      { header: "Last name", value: (r) => r.last_name },
      { header: "Phone", value: (r) => formatPhone(r.phone) },
      { header: "Email", value: (r) => r.email },
      { header: "Status", value: (r) => r.rsvp },
      { header: "Attendance", value: (r) => r.attendance },
      { header: "Walk-in", value: (r) => (r.walk_in ? "yes" : "") },
      { header: "Guest of", value: (r) => r.guest_of_name },
      { header: "Checked in at", value: (r) => (r.checked_in_at ? fmt(r.checked_in_at, event.time_zone, "yyyy-MM-dd h:mm a") : "") },
    ]);

  const openRow = rows.find((r) => r.registration_id === openId) ?? null;
  const visible = filtered.slice(0, limit);
  const filterCount = (k: Filter) =>
    k === "all" ? counts.total : k === "expected" ? counts.expected : k === "checked" ? counts.checked : counts.total - counts.checked;

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-8 lg:py-10">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
        <Link href="/signin" className="mb-4 inline-flex items-center gap-1.5 text-sm text-ink-2 hover:text-ink">
          <ArrowLeft className="size-4" /> All events
        </Link>
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="mb-2 flex items-center gap-2">
              <EventStatusChip status={status} />
            </div>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-[28px]">{event.name}</h1>
            <p className="mt-1 text-[15px] text-ink-2">
              {eventWhen(event.start_at, event.time_zone)}
              {event.venue_name && <> · {event.venue_name}</>}
            </p>
          </div>
          <div className="flex items-center gap-5 rounded-2xl bg-surface p-4 pr-6 ring-1 ring-border">
            <ProgressRing value={counts.expectedChecked} total={counts.expected} size={84} />
            <div>
              <div className="text-3xl font-semibold tracking-tight tabular-nums">
                <AnimatedNumber value={counts.checked} />
                <span className="text-lg text-ink-3">
                  {" "}
                  / <AnimatedNumber value={counts.expected} />
                </span>
              </div>
              <div className="text-[13px] text-ink-2">checked in · expected</div>
            </div>
          </div>
        </div>
      </motion.div>

      <AnimatePresence>
        {showTips && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="mt-6 flex gap-3 rounded-2xl bg-accent-soft px-5 py-4 text-sm text-accent-ink">
              <Info className="mt-0.5 size-4 shrink-0" />
              <p className="flex-1 whitespace-pre-wrap">{event.signin_instructions}</p>
              <IconButton label="Dismiss" onClick={dismissTips} className="-my-1.5 -mr-2 size-8 text-accent-ink hover:bg-indigo-100">
                <X className="size-4" />
              </IconButton>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Toolbar */}
      <div className="sticky top-14 z-20 -mx-4 mt-6 bg-bg/85 px-4 pt-2 pb-3 backdrop-blur sm:-mx-8 sm:px-8 md:top-0">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-ink-3" />
            <input
              ref={searchRef}
              autoFocus
              value={query}
              onChange={(e) => changeQuery(e.target.value)}
              placeholder="Search name or phone…"
              inputMode="search"
              autoComplete="off"
              className="h-14 w-full rounded-2xl bg-surface pr-12 pl-12 text-[17px] ring-1 ring-border transition-shadow placeholder:text-ink-3 focus:ring-2 focus:ring-accent focus:outline-none"
            />
            {query && (
              <button
                onClick={() => {
                  changeQuery("");
                  searchRef.current?.focus();
                }}
                className="absolute top-1/2 right-3 flex size-8 -translate-y-1/2 items-center justify-center rounded-full text-ink-3 hover:bg-surface-2"
                aria-label="Clear search"
              >
                <X className="size-4" />
              </button>
            )}
          </div>
          <Button
            variant="primary"
            size="lg"
            className="h-14 rounded-2xl px-5"
            icon={<UserPlus className="size-5" />}
            onClick={() => setWalkInOpen(true)}
          >
            <span className="hidden sm:inline">Walk-in</span>
          </Button>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <div className="flex gap-1 overflow-x-auto rounded-xl bg-surface-2 p-1 ring-1 ring-inset ring-border">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => changeFilter(f.key)}
                className={cx(
                  "relative flex h-9 items-center gap-1.5 rounded-lg px-3.5 text-sm font-medium whitespace-nowrap transition-colors",
                  filter === f.key ? "text-ink" : "text-ink-2 hover:text-ink",
                )}
              >
                {filter === f.key && (
                  <motion.span
                    layoutId="signin-filter"
                    className="absolute inset-0 rounded-lg bg-surface shadow-sm ring-1 ring-border"
                    transition={{ type: "spring", stiffness: 500, damping: 38 }}
                  />
                )}
                <span className="relative">{f.label}</span>
                <span className="relative text-xs text-ink-3 tabular-nums">{filterCount(f.key)}</span>
              </button>
            ))}
          </div>
          <div className="ml-auto flex gap-2">
            <Button size="sm" variant="ghost" icon={<Download className="size-4" />} onClick={exportCsv}>
              Export
            </Button>
            <Button size="sm" variant="secondary" icon={<Flag className="size-4" />} onClick={() => setCloseOutOpen(true)}>
              {status === "completed" ? "Closed out" : "Close out event"}
            </Button>
          </div>
        </div>
      </div>

      {/* List */}
      <div className="mt-2 space-y-2">
        <AnimatePresence initial={false} mode="popLayout">
          {visible.map((r) => (
            <PersonRow
              key={r.registration_id}
              row={r}
              tz={event.time_zone}
              highlight={highlight === r.registration_id}
              onCheckIn={mark}
              onOpen={setOpenId}
            />
          ))}
        </AnimatePresence>
        {filtered.length === 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="rounded-2xl border border-dashed border-border-strong px-6 py-12 text-center"
          >
            <div className="font-medium">No one matches “{query || FILTERS.find((f) => f.key === filter)?.label}”</div>
            <p className="mt-1 text-sm text-ink-2">Not on the list? Add them as a walk-in.</p>
            <Button variant="soft" className="mt-4" icon={<UserPlus className="size-4" />} onClick={() => setWalkInOpen(true)}>
              Add walk-in
            </Button>
          </motion.div>
        )}
        {filtered.length > limit && (
          <div className="pt-2 text-center">
            <Button variant="ghost" onClick={() => setLimit((l) => l + PAGE)}>
              Show more ({filtered.length - limit} remaining)
            </Button>
          </div>
        )}
      </div>

      <PersonDrawer
        row={openRow}
        event={event}
        onClose={() => setOpenId(null)}
        onMark={mark}
        onGuestsChanged={onGuestsChanged}
        onDivision={(id, division) => patch(id, { division })}
      />
      <WalkInDrawer
        open={walkInOpen}
        eventId={event.id}
        initialQuery={query}
        onClose={() => setWalkInOpen(false)}
        onAdded={(row) => {
          onWalkInAdded(row);
          setWalkInOpen(false);
        }}
      />
      <CloseOutModal
        open={closeOutOpen}
        onClose={() => setCloseOutOpen(false)}
        event={{ ...event, status }}
        rows={rows}
        onClosed={(ids) => {
          setRows((rs) => rs.map((r) => (ids.includes(r.registration_id) ? { ...r, attendance: "no_show" } : r)));
          setStatus("completed");
        }}
      />
    </div>
  );
}

const PersonRow = memo(function PersonRow({
  row,
  tz,
  highlight,
  onCheckIn,
  onOpen,
}: {
  row: SignInRow;
  tz: string;
  highlight: boolean;
  onCheckIn: (row: SignInRow, to: AttendanceStatus) => void;
  onOpen: (id: number) => void;
}) {
  const checked = row.attendance === "attended";
  const name = `${row.first_name} ${row.last_name}`;
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: highlight ? -12 : 0, scale: highlight ? 0.98 : 1 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ type: "spring", stiffness: 500, damping: 40 }}
      className={cx(
        "flex min-h-[72px] items-center gap-3 rounded-2xl px-3 py-2.5 ring-1 transition-colors duration-300 sm:gap-4 sm:px-4",
        checked ? "bg-emerald-50/70 ring-emerald-200" : "bg-surface ring-border",
        highlight && "ring-2 ring-accent",
      )}
    >
      <button onClick={() => onOpen(row.registration_id)} className="flex min-w-0 flex-1 items-center gap-3 text-left sm:gap-4">
        <div className="relative">
          <Avatar name={name} size="lg" />
          <AnimatePresence>
            {checked && (
              <motion.span
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0 }}
                transition={{ type: "spring", stiffness: 600, damping: 22 }}
                className="absolute -right-0.5 -bottom-0.5 flex size-5 items-center justify-center rounded-full bg-emerald-500 text-white ring-2 ring-white"
              >
                <Check className="size-3" strokeWidth={3} />
              </motion.span>
            )}
          </AnimatePresence>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate text-[16px] font-semibold">{name}</span>
            <ContactDivisionBadge division={row.division} />
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[13px] text-ink-2">
            {row.guest_of_name ? (
              <Chip className="bg-violet-50 text-violet-700 ring-violet-200">
                <UserPlus className="size-3" /> Guest of {row.guest_of_name}
              </Chip>
            ) : row.walk_in ? (
              <Chip className="bg-violet-50 text-violet-700 ring-violet-200">
                <UserPlus className="size-3" /> Walk-in
              </Chip>
            ) : (
              <RsvpChip status={row.rsvp} />
            )}
            {row.phone && <span className="font-mono text-xs text-ink-3">···{row.phone.slice(-4)}</span>}
            {row.guest_count > 0 && (
              <span className="text-xs">
                +{row.guest_count} guest{row.guest_count > 1 ? "s" : ""}
              </span>
            )}
            {row.attendance === "no_show" && <Chip className="bg-rose-50 text-rose-700 ring-rose-200">No-Show</Chip>}
          </div>
        </div>
      </button>
      <AnimatePresence mode="wait" initial={false}>
        {checked ? (
          <motion.div
            key="done"
            initial={{ opacity: 0, x: 8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -8 }}
            className="flex shrink-0 items-center gap-1 sm:gap-2"
          >
            <span className="hidden text-right text-[13px] text-emerald-700 sm:block">
              <span className="block font-semibold">Checked in</span>
              <span className="text-xs text-emerald-600/80">{row.checked_in_at ? fmt(row.checked_in_at, tz, "h:mm a") : ""}</span>
            </span>
            <IconButton
              label="Undo check-in"
              onClick={() => onCheckIn(row, "pending")}
              className="size-11 text-emerald-700 hover:bg-emerald-100"
            >
              <RotateCcw className="size-4" />
            </IconButton>
          </motion.div>
        ) : (
          <motion.button
            key="checkin"
            initial={{ opacity: 0, x: 8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -8 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => onCheckIn(row, "attended")}
            className="flex h-12 shrink-0 items-center gap-2 rounded-xl bg-emerald-600 px-4 text-[15px] font-semibold text-white shadow-sm shadow-emerald-900/10 transition-colors hover:bg-emerald-700 sm:px-5"
          >
            <Check className="size-5" strokeWidth={2.5} />
            <span className="hidden min-[420px]:inline">Check in</span>
          </motion.button>
        )}
      </AnimatePresence>
    </motion.div>
  );
});
