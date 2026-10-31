import { RSVP, RSVP_STATUSES } from "@/lib/status";
import type { RsvpCounts } from "@/lib/types";
import { clsx as cx } from "clsx";

/** Stacked horizontal bar of RSVP statuses. */
export function RsvpBar({ counts, className }: { counts: RsvpCounts; className?: string }) {
  const order = ["reconfirmed", "confirmed", "tentative", "declined", "no_data"] as const;
  return (
    <div className={cx("flex h-2 overflow-hidden rounded-full bg-stone-100", className)}>
      {counts.total > 0 &&
        order.map((s) =>
          counts[s] > 0 ? (
            <div
              key={s}
              title={`${RSVP[s].label}: ${counts[s]}`}
              className={cx("h-full transition-[width] duration-500", RSVP[s].dot)}
              style={{ width: `${(counts[s] / counts.total) * 100}%` }}
            />
          ) : null,
        )}
    </div>
  );
}

export function RsvpLegend({ counts }: { counts: RsvpCounts }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2">
      {RSVP_STATUSES.map((s) => (
        <span key={s} className="inline-flex items-center gap-1.5">
          <span className={cx("size-2 rounded-full", RSVP[s].dot)} />
          {RSVP[s].label} <span className="font-medium text-ink tabular-nums">{counts[s]}</span>
        </span>
      ))}
    </div>
  );
}
