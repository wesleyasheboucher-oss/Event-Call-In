"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { CalendarDays, Mail, MapPin, MessageSquare, Phone, UserPlus } from "lucide-react";
import type { ContactDetail } from "@/app/actions/registrations";
import type { HistoryRow, NoteRow } from "@/lib/types";
import { formatPhone, telHref } from "@/lib/phone";
import { ago, fmt } from "@/lib/time";
import { AttendanceChip, RsvpChip } from "./status";
import { Avatar, Chip, cx, SectionTitle, Skeleton } from "./ui";

export function contactName(c: { first_name: string; last_name: string }) {
  return `${c.first_name} ${c.last_name}`.trim();
}

export function ContactHeader({ detail }: { detail: ContactDetail }) {
  const c = detail.contact;
  return (
    <div className="flex items-center gap-4">
      <Avatar name={contactName(c)} size="lg" />
      <div className="min-w-0">
        <h2 className="truncate text-lg font-semibold tracking-tight">{contactName(c)}</h2>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-2">
          {c.phone && (
            <a href={telHref(c.phone)} className="inline-flex items-center gap-1.5 hover:text-accent">
              <Phone className="size-3.5" /> {formatPhone(c.phone)}
            </a>
          )}
          {c.alt_phone && (
            <a href={telHref(c.alt_phone)} className="inline-flex items-center gap-1.5 hover:text-accent" title="Alt phone">
              <Phone className="size-3.5" /> {formatPhone(c.alt_phone)} <span className="text-xs text-ink-3">alt</span>
            </a>
          )}
          {c.active === 0 && (
            <span className="rounded-md bg-stone-100 px-1.5 py-px text-[11px] font-semibold text-stone-600 ring-1 ring-stone-200">
              Inactive
            </span>
          )}
          {c.email && (
            <a href={`mailto:${c.email}`} className="inline-flex min-w-0 items-center gap-1.5 hover:text-accent">
              <Mail className="size-3.5 shrink-0" /> <span className="truncate">{c.email}</span>
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

export function QuickStats({ history }: { history: HistoryRow[] }) {
  const attended = history.filter((h) => h.attendance === "attended").length;
  const noShows = history.filter((h) => h.attendance === "no_show").length;
  const lastPast = history.find((h) => h.attendance !== "pending");
  const items = [
    { label: "Events", value: history.length },
    { label: "Attended", value: attended, tone: "text-emerald-600" },
    { label: "No-shows", value: noShows, tone: noShows ? "text-rose-600" : undefined },
  ];
  return (
    <div>
      <div className="grid grid-cols-3 gap-2">
        {items.map((i) => (
          <div key={i.label} className="rounded-xl bg-surface-2 px-3 py-2.5">
            <div className={cx("text-xl font-semibold tabular-nums", i.tone)}>{i.value}</div>
            <div className="text-xs text-ink-2">{i.label}</div>
          </div>
        ))}
      </div>
      {lastPast && (
        <p className="mt-2.5 text-[13px] text-ink-2">
          Last time ({lastPast.event_name}):{" "}
          <span className={cx("font-medium", lastPast.attendance === "attended" ? "text-emerald-700" : "text-rose-700")}>
            {lastPast.attendance === "attended" ? "attended" : "no-showed"}
          </span>
        </p>
      )}
    </div>
  );
}

export function HistoryList({ history, currentEventId }: { history: HistoryRow[]; currentEventId?: number }) {
  if (history.length === 0) {
    return <p className="text-sm text-ink-3">Not registered for any events yet.</p>;
  }
  return (
    <ol className="relative space-y-1">
      {history.map((h, i) => (
        <motion.li
          key={h.registration_id}
          initial={{ opacity: 0, x: 8 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: i * 0.03 }}
        >
          <Link
            href={`/events/${h.event_id}`}
            className={cx(
              "flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-surface-2",
              h.event_id === currentEventId && "bg-accent-soft/60 hover:bg-accent-soft",
            )}
          >
            <span className="flex size-9 shrink-0 flex-col items-center justify-center rounded-lg bg-surface ring-1 ring-border">
              <span className="text-[9px] leading-none font-semibold text-rose-500 uppercase">{fmt(h.start_at, h.time_zone, "MMM")}</span>
              <span className="text-sm leading-tight font-semibold">{fmt(h.start_at, h.time_zone, "d")}</span>
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">
                {h.event_name}
                {h.event_id === currentEventId && <span className="ml-1.5 text-xs font-normal text-accent">this event</span>}
              </span>
              <span className="block text-xs text-ink-3">{fmt(h.start_at, h.time_zone, "yyyy")}</span>
            </span>
            <span className="flex shrink-0 flex-col items-end gap-1">
              {h.guest_of_name ? (
                <Chip className="bg-violet-50 text-violet-700 ring-violet-200">
                  <UserPlus className="size-3" /> Guest of {h.guest_of_name}
                </Chip>
              ) : h.walk_in ? (
                <Chip className="bg-violet-50 text-violet-700 ring-violet-200">
                  <UserPlus className="size-3" /> Walk-in
                </Chip>
              ) : (
                <RsvpChip status={h.rsvp} />
              )}
              {h.attendance !== "pending" && <AttendanceChip status={h.attendance} />}
            </span>
          </Link>
        </motion.li>
      ))}
    </ol>
  );
}

export function NotesList({ notes, showEvent }: { notes: NoteRow[]; showEvent?: boolean }) {
  if (notes.length === 0) return <p className="text-sm text-ink-3">No notes yet.</p>;
  return (
    <ul className="space-y-3">
      {notes.map((n) => (
        <motion.li key={n.id} layout initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className="flex gap-3">
          <Avatar name={n.author} size="sm" className="mt-0.5" />
          <div className="min-w-0 flex-1">
            <div className="text-xs text-ink-3">
              <span className="font-medium text-ink-2">{n.author}</span> · {ago(n.created_at)}
              {showEvent && n.event_name && <> · {n.event_name}</>}
            </div>
            <p className="mt-0.5 text-sm whitespace-pre-wrap text-ink">{n.body}</p>
          </div>
        </motion.li>
      ))}
    </ul>
  );
}

export function AddressBlock({ detail }: { detail: ContactDetail }) {
  const c = detail.contact;
  const line = [c.street, [c.city, c.state].filter(Boolean).join(", "), c.zip].filter(Boolean).join(" · ");
  const profile = [
    ["Training", c.training_level],
    ["Processing", c.processing_level],
    ["FSM", c.fsm_name],
  ].filter(([, v]) => v);
  return (
    <div className="space-y-2 text-sm">
      {profile.length > 0 && (
        <dl className="mb-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 rounded-xl bg-surface-2/60 px-4 py-3">
          {profile.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-xs text-ink-3">{k}</dt>
              <dd className="text-[13px] font-medium text-ink">{v}</dd>
            </div>
          ))}
        </dl>
      )}
      {line && (
        <div className="flex gap-2 text-ink-2">
          <MapPin className="mt-0.5 size-4 shrink-0 text-ink-3" /> {line}
        </div>
      )}
      {c.notes && (
        <div className="flex gap-2 text-ink-2">
          <MessageSquare className="mt-0.5 size-4 shrink-0 text-ink-3" /> <span className="whitespace-pre-wrap">{c.notes}</span>
        </div>
      )}
      <div className="flex gap-2 text-xs text-ink-3">
        <CalendarDays className="size-4 shrink-0" /> Added {fmt(c.created_at, "America/New_York", "MMM d, yyyy")} ·{" "}
        {{ walk_in: "Walk-in", import: "Import", manual: "Manual", guest: "Came as a guest" }[c.source]}
      </div>
    </div>
  );
}

export function PanelSkeleton() {
  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center gap-4">
        <Skeleton className="size-12 rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-56" />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Skeleton className="h-16" />
        <Skeleton className="h-16" />
        <Skeleton className="h-16" />
      </div>
      <Skeleton className="h-40" />
    </div>
  );
}

export { SectionTitle };
