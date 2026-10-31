import Link from "next/link";
import { ArrowRight, PhoneCall } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { all } from "@/lib/db";
import { listEvents } from "@/lib/queries";
import { daysUntil, eventWhen, relativeDays } from "@/lib/time";
import { Page, PageHeader, Stagger, StaggerItem } from "@/components/page";
import { EventCover } from "@/components/event-cover";
import { RsvpBar } from "@/components/rsvp-bar";

export default async function CallPickerPage() {
  const user = await requireUser(["caller"]);
  const assigned = new Set(
    (await all<{ event_id: number }>("SELECT event_id FROM event_staff WHERE user_id = ? AND role = 'caller'", [user.id])).map(
      (r) => r.event_id,
    ),
  );
  const events = (await listEvents())
    .filter((e) => daysUntil(e.start_at, e.time_zone) >= 0 && !["completed", "cancelled"].includes(e.status))
    .sort((a, b) => {
      const aa = assigned.has(a.id) ? 0 : 1;
      const bb = assigned.has(b.id) ? 0 : 1;
      return aa - bb || a.start_at.localeCompare(b.start_at);
    });

  return (
    <Page>
      <PageHeader title="Calling" description="Pick an upcoming event to work its call list." />
      {events.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border-strong p-12 text-center text-sm text-ink-2">
          No upcoming events need calls right now.
        </div>
      ) : (
        <Stagger className="space-y-3">
          {events.map((e) => {
            const remaining = e.stats.rsvp.no_data;
            const pct = e.stats.rsvp.total ? Math.round(((e.stats.rsvp.total - remaining) / e.stats.rsvp.total) * 100) : 0;
            return (
              <StaggerItem key={e.id}>
                <Link
                  href={`/call/${e.id}`}
                  className="group flex items-center gap-5 rounded-2xl bg-surface p-4 ring-1 ring-border transition-all hover:shadow-[var(--shadow-lift)] sm:p-5"
                >
                  <EventCover
                    src={e.cover_thumb || e.cover_image}
                    category={e.category}
                    name={e.name}
                    rounded="rounded-xl"
                    className="hidden w-40 shrink-0 sm:block"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 text-[13px] text-ink-2">
                      <span className="font-medium text-ink">{relativeDays(daysUntil(e.start_at, e.time_zone))}</span>·
                      <span>{eventWhen(e.start_at, e.time_zone)}</span>
                      {assigned.has(e.id) && (
                        <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-semibold text-accent-ink">
                          Assigned to you
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 truncate text-[17px] font-semibold tracking-tight">{e.name}</div>
                    <div className="mt-3 flex items-center gap-3">
                      <RsvpBar counts={e.stats.rsvp} className="flex-1" />
                      <span className="shrink-0 text-xs text-ink-2 tabular-nums">{pct}% called</span>
                    </div>
                    <div className="mt-1.5 text-xs text-ink-3">
                      {remaining} not yet contacted · {e.stats.rsvp.total} on list
                    </div>
                  </div>
                  <span className="hidden size-10 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent transition-transform group-hover:translate-x-0.5 sm:flex">
                    <ArrowRight className="size-4" />
                  </span>
                </Link>
              </StaggerItem>
            );
          })}
        </Stagger>
      )}
      <p className="mt-8 flex items-center gap-2 text-xs text-ink-3">
        <PhoneCall className="size-3.5" /> Phone numbers open your device&apos;s dialer or softphone.
      </p>
    </Page>
  );
}
