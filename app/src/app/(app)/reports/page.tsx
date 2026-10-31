import { Suspense } from "react";
import Loading from "../loading";
import Link from "next/link";
import { clsx as cx } from "clsx";
import { requireUser } from "@/lib/auth";
import { getCallerReport, getEventStats, listEvents } from "@/lib/queries";
import { ATTENDANCE, RSVP, RSVP_STATUSES } from "@/lib/status";
import { eventWhen, fmt } from "@/lib/time";
import { Page, PageHeader, StatTile } from "@/components/page";
import { RsvpBar, RsvpLegend } from "@/components/rsvp-bar";
import { EventPicker, ExportButtons } from "./report-controls";

const hasStarted = (iso: string) => Date.parse(iso) <= Date.now();
const pct = (v: number | null) => (v == null ? "—" : `${Math.round(v * 100)}%`);

async function Reports(props: PageProps<"/reports">) {
  await requireUser(["admin"]);
  const sp = await props.searchParams;
  const events = await listEvents();
  const requested = Number(Array.isArray(sp.event) ? sp.event[0] : sp.event);
  const selected =
    events.find((e) => e.id === requested) ??
    events.find((e) => e.stats.rsvp.total > 0 && hasStarted(e.start_at)) ??
    events.find((e) => e.stats.rsvp.total > 0) ??
    events[0];

  if (!selected) {
    return (
      <Page>
        <PageHeader title="Reports" description="Create an event to see reports." />
      </Page>
    );
  }

  const [stats, callers] = await Promise.all([getEventStats(selected.id), getCallerReport(selected.id)]);
  const maxCalls = Math.max(1, ...callers.map((c) => c.calls));
  const confirmed = stats.rsvp.confirmed + stats.rsvp.reconfirmed;
  const attendTotal = stats.attended + stats.noShow + stats.pending;
  const history = [...events].filter((e) => e.stats.rsvp.total > 0).sort((a, b) => a.start_at.localeCompare(b.start_at));

  return (
    <Page>
      <PageHeader
        title="Reports"
        description="Registrations, attendance, and caller activity per event."
        actions={<ExportButtons eventId={selected.id} eventName={selected.name} timeZone={selected.time_zone} />}
      />

      <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-center">
        <EventPicker
          events={events.map((e) => ({ id: e.id, label: `${e.name} · ${fmt(e.start_at, e.time_zone, "MMM d, yyyy")}` }))}
          value={selected.id}
        />
        <span className="text-sm text-ink-2">{eventWhen(selected.start_at, selected.time_zone)}</span>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="On the list" value={stats.rsvp.total} />
        <StatTile label="Expected headcount" value={stats.expectedHeadcount} sub="incl. guests" />
        <StatTile
          label="Attended"
          value={stats.attended}
          tone="bg-emerald-500"
          sub={stats.walkIns ? `${stats.walkIns} walk-ins` : undefined}
        />
        <StatTile label="Show rate" value={pct(stats.showRate)} tone="bg-indigo-500" sub={`of ${confirmed} confirmed`} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl bg-surface p-6 ring-1 ring-border">
          <h2 className="mb-5 text-[15px] font-semibold">Registration status</h2>
          <RsvpBar counts={stats.rsvp} className="h-3" />
          <div className="mt-4">
            <RsvpLegend counts={stats.rsvp} />
          </div>
          <dl className="mt-6 grid grid-cols-3 gap-2 text-center sm:grid-cols-5">
            {RSVP_STATUSES.map((s) => (
              <div key={s} className="rounded-xl bg-surface-2 py-3">
                <dd className="text-xl font-semibold tabular-nums">{stats.rsvp[s]}</dd>
                <dt className="mt-0.5 truncate px-1 text-[11px] text-ink-2">{RSVP[s].label}</dt>
              </div>
            ))}
          </dl>
        </section>

        <section className="rounded-2xl bg-surface p-6 ring-1 ring-border">
          <h2 className="mb-5 text-[15px] font-semibold">Attendance</h2>
          <div className="space-y-4">
            {(
              [
                ["attended", stats.attended],
                ["no_show", stats.noShow],
                ["pending", stats.pending],
              ] as const
            ).map(([s, n]) => (
              <div key={s}>
                <div className="mb-1.5 flex justify-between text-sm">
                  <span className="flex items-center gap-2 text-ink-2">
                    <span className={cx("size-2 rounded-full", ATTENDANCE[s].dot)} />
                    {ATTENDANCE[s].label}
                  </span>
                  <span className="font-medium tabular-nums">{n}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-stone-100">
                  <div
                    className={cx("h-full rounded-full", ATTENDANCE[s].dot)}
                    style={{ width: `${attendTotal ? (n / attendTotal) * 100 : 0}%` }}
                  />
                </div>
              </div>
            ))}
            <div className="flex justify-between border-t border-border pt-4 text-sm">
              <span className="text-ink-2">Walk-ins</span>
              <span className="font-medium tabular-nums">{stats.walkIns}</span>
            </div>
          </div>
        </section>
      </div>

      <section className="mt-6 overflow-hidden rounded-2xl bg-surface ring-1 ring-border">
        <h2 className="px-6 pt-6 pb-4 text-[15px] font-semibold">Callers</h2>
        {callers.length === 0 ? (
          <p className="px-6 pb-6 text-sm text-ink-3">No calls logged for this event yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-y border-border bg-surface-2/60 text-left text-xs text-ink-2">
                <th className="px-6 py-2.5 font-medium">Caller</th>
                <th className="px-3 py-2.5 font-medium">Calls logged</th>
                <th className="px-3 py-2.5 text-right font-medium">Confirms</th>
                <th className="px-6 py-2.5 text-right font-medium">Notes</th>
              </tr>
            </thead>
            <tbody>
              {callers.map((c) => (
                <tr key={c.user_id} className="border-b border-border last:border-0">
                  <td className="px-6 py-3 font-medium">{c.name}</td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-3">
                      <div className="hidden h-1.5 w-24 overflow-hidden rounded-full bg-stone-100 sm:block sm:w-40">
                        <div className="h-full rounded-full bg-accent" style={{ width: `${(c.calls / maxCalls) * 100}%` }} />
                      </div>
                      <span className="tabular-nums">{c.calls}</span>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">{c.confirms}</td>
                  <td className="px-6 py-3 text-right tabular-nums">{c.notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="mt-6 overflow-hidden rounded-2xl bg-surface ring-1 ring-border">
        <div className="flex items-end justify-between gap-4 px-6 pt-6 pb-4">
          <h2 className="text-[15px] font-semibold">All events</h2>
          <ShowRateBars events={history.map((e) => ({ id: e.id, name: e.name, rate: e.stats.showRate }))} />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-y border-border bg-surface-2/60 text-left text-xs text-ink-2">
                <th className="px-6 py-2.5 font-medium">Event</th>
                <th className="px-3 py-2.5 text-right font-medium">On list</th>
                <th className="px-3 py-2.5 text-right font-medium">Confirmed</th>
                <th className="px-3 py-2.5 text-right font-medium">Attended</th>
                <th className="px-3 py-2.5 text-right font-medium">No-shows</th>
                <th className="px-6 py-2.5 font-medium">Show rate</th>
              </tr>
            </thead>
            <tbody>
              {[...history].reverse().map((e) => (
                <tr key={e.id} className={cx("border-b border-border last:border-0", e.id === selected.id && "bg-accent-soft/50")}>
                  <td className="px-6 py-3">
                    <Link href={`/reports?event=${e.id}`} className="font-medium hover:text-accent">
                      {e.name}
                    </Link>
                    <div className="text-xs text-ink-3">{fmt(e.start_at, e.time_zone, "MMM d, yyyy")}</div>
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">{e.stats.rsvp.total}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{e.stats.rsvp.confirmed + e.stats.rsvp.reconfirmed}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{e.stats.attended}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{e.stats.noShow}</td>
                  <td className="px-6 py-3">
                    <div className="flex items-center gap-3">
                      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-stone-100">
                        <div className="h-full rounded-full bg-emerald-500" style={{ width: `${(e.stats.showRate ?? 0) * 100}%` }} />
                      </div>
                      <span className="w-10 text-right tabular-nums">{pct(e.stats.showRate)}</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </Page>
  );
}

/** Tiny column chart of show rate across events, oldest to newest. */
function ShowRateBars({ events }: { events: { id: number; name: string; rate: number | null }[] }) {
  const withRate = events.filter((e) => e.rate != null);
  if (withRate.length < 2) return null;
  return (
    <div className="flex items-end gap-3">
      <span className="hidden text-xs text-ink-3 sm:block">Show rate trend</span>
      <div className="flex h-10 items-end gap-1" aria-label="Show rate trend">
        {withRate.map((e) => (
          <div
            key={e.id}
            title={`${e.name}: ${pct(e.rate)}`}
            className="w-3 rounded-t bg-gradient-to-t from-emerald-500 to-emerald-300"
            style={{ height: `${Math.max(8, (e.rate ?? 0) * 100)}%` }}
          />
        ))}
      </div>
    </div>
  );
}

export default function ReportsPage(props: PageProps<"/reports">) {
  return (
    <Suspense fallback={<Loading />}>
      <Reports {...props} />
    </Suspense>
  );
}
