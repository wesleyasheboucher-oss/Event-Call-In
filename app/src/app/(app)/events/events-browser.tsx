"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { CalendarDays, Globe, MapPin, Plus, Search, Users } from "lucide-react";
import { Page, PageHeader } from "@/components/page";
import { EventCover } from "@/components/event-cover";
import { RsvpBar } from "@/components/rsvp-bar";
import { EventStatusChip } from "@/components/status";
import { cx, EmptyState, Input } from "@/components/ui";
import { daysUntil, eventWhen, fmt, relativeDays } from "@/lib/time";
import type { EventStatus } from "@/lib/status";
import type { EventStats } from "@/lib/types";

export type EventCardData = {
  id: number;
  name: string;
  tagline: string;
  category: string;
  tags: string[];
  status: EventStatus;
  start_at: string;
  time_zone: string;
  venue_name: string;
  city: string;
  location_type: "in_person" | "online" | "hybrid";
  cover: string;
  archived: boolean;
  capacity: number | null;
  stats: EventStats;
};

const TABS = [
  { key: "upcoming", label: "Upcoming" },
  { key: "past", label: "Past" },
  { key: "drafts", label: "Drafts" },
  { key: "archived", label: "Archived" },
] as const;
type Tab = (typeof TABS)[number]["key"];

function bucket(e: EventCardData): Tab {
  if (e.archived) return "archived";
  if (e.status === "draft") return "drafts";
  return daysUntil(e.start_at, e.time_zone) >= 0 && e.status !== "completed" ? "upcoming" : "past";
}

export function EventsBrowser({ events, isAdmin }: { events: EventCardData[]; isAdmin: boolean }) {
  const [tab, setTab] = useState<Tab>("upcoming");
  const [q, setQ] = useState("");

  const counts = useMemo(() => {
    const c: Record<Tab, number> = { upcoming: 0, past: 0, drafts: 0, archived: 0 };
    for (const e of events) c[bucket(e)]++;
    return c;
  }, [events]);

  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    const list = events.filter((e) => {
      if (bucket(e) !== tab) return false;
      if (!term) return true;
      return [e.name, e.tagline, e.category, e.venue_name, e.city, ...e.tags].join(" ").toLowerCase().includes(term);
    });
    // Upcoming and drafts: soonest first. Past and archived: most recent first.
    return tab === "upcoming" || tab === "drafts" ? list.sort((a, b) => a.start_at.localeCompare(b.start_at)) : list;
  }, [events, tab, q]);

  return (
    <Page>
      <PageHeader
        title="Events"
        description="Everything a caller or sign-in volunteer needs to know, in one place."
        actions={
          isAdmin && (
            <Link
              href="/events/new"
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-accent px-4 text-sm font-medium text-white shadow-sm transition-colors hover:bg-accent-hover"
            >
              <Plus className="size-4" /> New event
            </Link>
          )
        }
      />

      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-1 overflow-x-auto rounded-xl bg-surface-2 p-1 ring-1 ring-inset ring-border">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cx(
                "relative flex h-8 shrink-0 items-center gap-2 rounded-lg px-3.5 text-[13px] font-medium transition-colors",
                tab === t.key ? "text-ink" : "text-ink-2 hover:text-ink",
              )}
            >
              {tab === t.key && (
                <motion.span
                  layoutId="events-tab"
                  className="absolute inset-0 rounded-lg bg-surface shadow-sm ring-1 ring-border"
                  transition={{ type: "spring", stiffness: 500, damping: 38 }}
                />
              )}
              <span className="relative">{t.label}</span>
              <span className="relative text-xs text-ink-3 tabular-nums">{counts[t.key]}</span>
            </button>
          ))}
        </div>
        <div className="relative sm:w-72">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-ink-3" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search events" className="pl-10" />
        </div>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={tab}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.2 }}
        >
          {shown.length === 0 ? (
            <EmptyState
              icon={<CalendarDays className="size-5" />}
              title={q ? "No events match that search" : `No ${TABS.find((t) => t.key === tab)!.label.toLowerCase()} events`}
              body={tab === "upcoming" && isAdmin && !q ? "Create an event to start building a call list." : undefined}
            />
          ) : (
            <motion.div
              className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3"
              initial="hidden"
              animate="show"
              variants={{ show: { transition: { staggerChildren: 0.045 } } }}
            >
              {shown.map((e) => (
                <EventCard key={e.id} e={e} />
              ))}
            </motion.div>
          )}
        </motion.div>
      </AnimatePresence>
    </Page>
  );
}

function EventCard({ e }: { e: EventCardData }) {
  const days = daysUntil(e.start_at, e.time_zone);
  const upcoming = days >= 0 && e.status !== "completed";
  const where = e.location_type === "online" ? "Online" : [e.venue_name, e.city].filter(Boolean).join(" · ");
  return (
    <motion.div
      variants={{
        hidden: { opacity: 0, y: 12 },
        show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] } },
      }}
    >
      <Link
        href={`/events/${e.id}`}
        className="group block overflow-hidden rounded-2xl bg-surface ring-1 ring-border transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[var(--shadow-lift)]"
      >
        <div className="relative overflow-hidden">
          <EventCover
            src={e.cover}
            category={e.category}
            name={e.name}
            rounded="rounded-none"
            className="transition-transform duration-500 group-hover:scale-[1.03]"
          />
          <div className="absolute top-3 left-3 flex flex-col items-center rounded-xl bg-white/95 px-2.5 py-1.5 shadow-sm backdrop-blur">
            <span className="text-[10px] leading-none font-semibold tracking-wide text-rose-500 uppercase">
              {fmt(e.start_at, e.time_zone, "MMM")}
            </span>
            <span className="text-lg leading-tight font-semibold">{fmt(e.start_at, e.time_zone, "d")}</span>
          </div>
          {upcoming && (
            <span className="absolute top-3 right-3 rounded-full bg-stone-900/70 px-2.5 py-1 text-xs font-medium text-white backdrop-blur">
              {relativeDays(days)}
            </span>
          )}
        </div>
        <div className="p-5">
          <div className="mb-2 flex items-center gap-2">
            <EventStatusChip status={e.status} />
            {e.category && <span className="text-xs text-ink-3">{e.category}</span>}
          </div>
          <h3 className="text-[17px] leading-snug font-semibold tracking-tight">{e.name}</h3>
          {e.tagline && <p className="mt-1 line-clamp-2 text-sm text-ink-2">{e.tagline}</p>}
          <div className="mt-4 space-y-1.5 text-[13px] text-ink-2">
            <div className="flex items-center gap-2">
              <CalendarDays className="size-3.5 text-ink-3" /> {eventWhen(e.start_at, e.time_zone)}
            </div>
            {where && (
              <div className="flex items-center gap-2 truncate">
                {e.location_type === "online" ? <Globe className="size-3.5 text-ink-3" /> : <MapPin className="size-3.5 text-ink-3" />}
                <span className="truncate">{where}</span>
              </div>
            )}
          </div>
          <div className="mt-5">
            <div className="mb-2 flex items-center justify-between text-xs text-ink-2">
              <span className="inline-flex items-center gap-1.5">
                <Users className="size-3.5 text-ink-3" />
                {upcoming
                  ? `${e.stats.expectedHeadcount} expected`
                  : `${e.stats.attended} attended`}
                {e.capacity ? <span className="text-ink-3"> / {e.capacity} cap</span> : null}
              </span>
              <span className="text-ink-3 tabular-nums">{e.stats.rsvp.total} on list</span>
            </div>
            <RsvpBar counts={e.stats.rsvp} />
          </div>
        </div>
      </Link>
    </motion.div>
  );
}
