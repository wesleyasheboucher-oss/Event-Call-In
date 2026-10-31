import { Suspense } from "react";
import Loading from "../loading";
import Link from "next/link";
import { clsx as cx } from "clsx";
import { ArrowRight, CalendarDays, ClipboardCheck, MapPin } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { listEvents, type EventListItem } from "@/lib/queries";
import { daysUntil, eventWhen, relativeDays } from "@/lib/time";
import { EVENT_STATUS } from "@/lib/status";
import { Page, PageHeader, Stagger, StaggerItem } from "@/components/page";
import { EventCover } from "@/components/event-cover";

function EventRow({ e }: { e: EventListItem }) {
  const days = daysUntil(e.start_at, e.time_zone);
  const st = EVENT_STATUS[e.status];
  return (
    <Link
      href={`/signin/${e.id}`}
      className="group flex items-center gap-4 rounded-2xl bg-surface p-3 pr-5 ring-1 ring-border transition-all hover:-translate-y-px hover:shadow-[var(--shadow-soft)]"
    >
      <EventCover
        src={e.cover_thumb || e.cover_image}
        category={e.category}
        name={e.name}
        rounded="rounded-xl"
        className="!w-28 shrink-0 sm:!w-36"
      />
      <div className="min-w-0 flex-1">
        <div className="text-[13px] text-ink-2">
          {relativeDays(days)} · {eventWhen(e.start_at, e.time_zone)}
        </div>
        <div className="truncate text-[15px] font-semibold">{e.name}</div>
        <div className="mt-1 flex items-center gap-3 text-xs text-ink-3">
          <span className="inline-flex items-center gap-1.5">
            <span className={cx("size-1.5 rounded-full", st.dot)} /> {st.label}
          </span>
          <span className="tabular-nums">
            {e.stats.attended} / {e.stats.expectedHeadcount} checked in
          </span>
        </div>
      </div>
      <ArrowRight className="size-4 shrink-0 text-ink-3 transition-transform group-hover:translate-x-0.5 group-hover:text-accent" />
    </Link>
  );
}

async function SignInPicker() {
  await requireUser(["signin"]);
  const events = (await listEvents()).filter((e) => e.status !== "cancelled");
  const withDays = events.map((e) => ({ e, days: daysUntil(e.start_at, e.time_zone) }));
  const today = withDays.filter((x) => x.days === 0).map((x) => x.e);
  const upcoming = withDays
    .filter((x) => x.days > 0)
    .sort((a, b) => a.e.start_at.localeCompare(b.e.start_at))
    .map((x) => x.e)
    .slice(0, 6);
  const recent = withDays
    .filter((x) => x.days < 0)
    .map((x) => x.e)
    .slice(0, 6);

  return (
    <Page>
      <PageHeader title="Event-day sign-in" description="Pick the event you're working the door for." />

      {today.length > 0 ? (
        <Stagger className="mb-12 grid gap-5">
          {today.map((e) => (
            <StaggerItem key={e.id}>
              <Link
                href={`/signin/${e.id}`}
                className="group grid overflow-hidden rounded-3xl bg-surface ring-1 ring-border transition-shadow hover:shadow-[var(--shadow-lift)] md:grid-cols-[1.1fr_1fr]"
              >
                <EventCover src={e.cover_image} category={e.category} name={e.name} rounded="rounded-none" className="h-full" />
                <div className="flex flex-col justify-between gap-6 p-6 sm:p-8">
                  <div>
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200">
                      <span className="size-1.5 animate-pulse rounded-full bg-emerald-500" /> Today
                    </span>
                    <h2 className="mt-3 text-2xl font-semibold tracking-tight">{e.name}</h2>
                    <div className="mt-2 space-y-1 text-sm text-ink-2">
                      <div className="flex items-center gap-2">
                        <CalendarDays className="size-4 text-ink-3" /> {eventWhen(e.start_at, e.time_zone)}
                      </div>
                      {e.venue_name && (
                        <div className="flex items-center gap-2">
                          <MapPin className="size-4 text-ink-3" /> {e.venue_name}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-end justify-between gap-4">
                    <div>
                      <div className="text-3xl font-semibold tabular-nums">
                        {e.stats.attended}
                        <span className="text-lg text-ink-3"> / {e.stats.expectedHeadcount}</span>
                      </div>
                      <div className="text-xs text-ink-2">checked in · expected</div>
                    </div>
                    <span className="inline-flex h-12 items-center gap-2 rounded-xl bg-accent px-5 text-[15px] font-medium text-white shadow-md shadow-indigo-500/25 transition-colors group-hover:bg-accent-hover">
                      <ClipboardCheck className="size-5" /> Start sign-in
                    </span>
                  </div>
                </div>
              </Link>
            </StaggerItem>
          ))}
        </Stagger>
      ) : (
        <div className="mb-12 rounded-3xl border border-dashed border-border-strong px-6 py-12 text-center">
          <ClipboardCheck className="mx-auto mb-3 size-6 text-ink-3" />
          <div className="font-medium">No events today</div>
          <p className="mt-1 text-sm text-ink-2">You can still open any event below to check people in.</p>
        </div>
      )}

      <div className="grid gap-10 lg:grid-cols-2">
        {[
          { title: "Upcoming", list: upcoming },
          { title: "Recent", list: recent },
        ].map((section) => (
          <section key={section.title}>
            <h2 className="mb-4 text-xs font-semibold tracking-wide text-ink-3 uppercase">{section.title}</h2>
            {section.list.length === 0 ? (
              <p className="text-sm text-ink-3">Nothing here.</p>
            ) : (
              <Stagger className="space-y-3">
                {section.list.map((e) => (
                  <StaggerItem key={e.id}>
                    <EventRow e={e} />
                  </StaggerItem>
                ))}
              </Stagger>
            )}
          </section>
        ))}
      </div>
    </Page>
  );
}

export default function SignInPickerPage() {
  return (
    <Suspense fallback={<Loading />}>
      <SignInPicker />
    </Suspense>
  );
}
