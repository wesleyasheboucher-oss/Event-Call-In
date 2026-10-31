import Link from "next/link";
import { ArrowRight, CalendarDays, ClipboardCheck, PhoneCall, Upload } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { listEvents } from "@/lib/queries";
import { daysUntil, eventWhen, relativeDays } from "@/lib/time";
import { Page, Stagger, StaggerItem } from "@/components/page";
import { EventCover } from "@/components/event-cover";
import { RsvpBar } from "@/components/rsvp-bar";

export default async function HomePage() {
  const user = await requireUser();
  const events = await listEvents();
  const upcoming = events
    .filter((e) => daysUntil(e.start_at, e.time_zone) >= 0 && e.status !== "completed" && e.status !== "cancelled")
    .sort((a, b) => a.start_at.localeCompare(b.start_at));
  const today = upcoming.filter((e) => daysUntil(e.start_at, e.time_zone) === 0);
  const firstName = user.name.split(" ")[0];
  const hour = Number(new Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: false, timeZone: "America/New_York" }).format(new Date()));
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  return (
    <Page>
      <div className="mb-10">
        <h1 className="text-[28px] font-semibold tracking-tight sm:text-[32px]">
          {greeting}, {firstName}.
        </h1>
        <p className="mt-1.5 text-[15px] text-ink-2">
          {upcoming.length === 0
            ? "No upcoming events on the calendar yet."
            : `${upcoming.length} upcoming ${upcoming.length === 1 ? "event" : "events"}${today.length ? ` · ${today.length} happening today` : ""}.`}
        </p>
      </div>

      {today.length > 0 && (user.role === "admin" || user.role === "signin") && (
        <Link
          href={`/signin/${today[0].id}`}
          className="group mb-10 flex items-center gap-5 rounded-2xl bg-gradient-to-r from-indigo-600 to-violet-600 p-5 text-white shadow-lg shadow-indigo-500/20 transition-transform hover:-translate-y-0.5 sm:p-6"
        >
          <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-white/15">
            <ClipboardCheck className="size-6" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm text-white/75">Happening today</div>
            <div className="truncate text-lg font-semibold">{today[0].name}</div>
            <div className="text-sm text-white/75">
              {today[0].stats.attended} checked in ·{" "}
              {today[0].stats.rsvp.confirmed + today[0].stats.rsvp.reconfirmed + today[0].stats.rsvp.tentative} expected
            </div>
          </div>
          <span className="hidden items-center gap-1.5 rounded-xl bg-white/15 px-4 py-2 text-sm font-medium sm:flex">
            Open sign-in <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
          </span>
        </Link>
      )}

      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold tracking-tight">Upcoming</h2>
        <Link href="/events" className="text-sm font-medium text-accent hover:underline">
          All events
        </Link>
      </div>

      {upcoming.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border-strong p-10 text-center text-sm text-ink-2">
          Nothing scheduled.{" "}
          {user.role === "admin" && (
            <Link href="/events/new" className="font-medium text-accent">
              Create an event
            </Link>
          )}
        </div>
      ) : (
        <Stagger className="grid gap-5 md:grid-cols-2">
          {upcoming.slice(0, 4).map((e) => {
            const days = daysUntil(e.start_at, e.time_zone);
            const called = e.stats.rsvp.total - e.stats.rsvp.no_data;
            return (
              <StaggerItem key={e.id}>
                <div className="group overflow-hidden rounded-2xl bg-surface ring-1 ring-border transition-shadow hover:shadow-[var(--shadow-lift)]">
                  <Link href={`/events/${e.id}`} className="block">
                    <div className="relative">
                      <EventCover src={e.cover_thumb || e.cover_image} category={e.category} name={e.name} rounded="rounded-none" className="aspect-[2.6/1]" />
                      <span className="absolute top-3 left-3 rounded-full bg-white/90 px-2.5 py-1 text-xs font-semibold text-ink backdrop-blur">
                        {relativeDays(days)}
                      </span>
                    </div>
                    <div className="px-5 pt-4">
                      <div className="text-[13px] text-ink-2">{eventWhen(e.start_at, e.time_zone)}</div>
                      <div className="mt-0.5 text-[17px] font-semibold tracking-tight">{e.name}</div>
                    </div>
                  </Link>
                  <div className="px-5 pt-4 pb-5">
                    <div className="mb-2 flex justify-between text-xs text-ink-2">
                      <span>
                        {called} of {e.stats.rsvp.total} called
                      </span>
                      <span className="tabular-nums">{e.stats.expectedHeadcount} expected</span>
                    </div>
                    <RsvpBar counts={e.stats.rsvp} />
                    <div className="mt-4 flex gap-2">
                      {(user.role === "admin" || user.role === "caller") && (
                        <Link
                          href={`/call?e=${e.id}`}
                          className="inline-flex h-9 items-center gap-2 rounded-lg bg-accent-soft px-3 text-[13px] font-medium text-accent-ink transition-colors hover:bg-indigo-100"
                        >
                          <PhoneCall className="size-3.5" /> Call In
                        </Link>
                      )}
                      {days === 0 && (user.role === "admin" || user.role === "signin") && (
                        <Link
                          href={`/signin/${e.id}`}
                          className="inline-flex h-9 items-center gap-2 rounded-lg bg-surface-2 px-3 text-[13px] font-medium text-ink ring-1 ring-border"
                        >
                          <ClipboardCheck className="size-3.5" /> Sign-in
                        </Link>
                      )}
                    </div>
                  </div>
                </div>
              </StaggerItem>
            );
          })}
        </Stagger>
      )}

      {user.role === "admin" && (
        <div className="mt-12 grid gap-4 sm:grid-cols-3">
          {[
            { href: "/events/new", icon: CalendarDays, title: "New event", body: "Set up details and build a call list." },
            { href: "/contacts/import", icon: Upload, title: "Import contacts", body: "CSV or Excel, with duplicate checks." },
            { href: "/reports", icon: ArrowRight, title: "Reports", body: "Show rates, registrations, and caller activity." },
          ].map((a) => (
            <Link
              key={a.href}
              href={a.href}
              className="group rounded-2xl p-5 ring-1 ring-border transition-all hover:bg-surface hover:shadow-[var(--shadow-soft)]"
            >
              <a.icon className="mb-3 size-5 text-ink-3 transition-colors group-hover:text-accent" />
              <div className="text-sm font-semibold">{a.title}</div>
              <div className="mt-0.5 text-sm text-ink-2">{a.body}</div>
            </Link>
          ))}
        </div>
      )}
    </Page>
  );
}
