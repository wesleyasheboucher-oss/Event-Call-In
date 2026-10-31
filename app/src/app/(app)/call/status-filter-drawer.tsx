"use client";

import { Check } from "lucide-react";
import type { CallInEvent } from "@/lib/call-in";
import { RSVP, RSVP_STATUSES, type RsvpStatus } from "@/lib/status";
import { fmt } from "@/lib/time";
import { Drawer } from "@/components/drawer";
import { Button, cx } from "@/components/ui";

/** "No Data" also covers people with no record for that event at all. */
export type StatusKey = RsvpStatus;
export type StatusFilters = Record<number, StatusKey[]>;

const OPTIONS: StatusKey[] = [...RSVP_STATUSES];

export const statusKeyLabel = (k: StatusKey) => RSVP[k].label;

/**
 * Pick statuses per selected event (any number each). A person shows only if,
 * for every event with picks, their status for that event is one of the picks.
 */
export function StatusFilterDrawer({
  open,
  onClose,
  events,
  value,
  onChange,
}: {
  open: boolean;
  onClose: () => void;
  events: CallInEvent[];
  value: StatusFilters;
  /** Receives an updater so quick successive taps each build on the latest picks. */
  onChange: (update: (prev: StatusFilters) => StatusFilters) => void;
}) {
  const toggle = (eventId: number, key: StatusKey) =>
    onChange((prev) => {
      const current = prev[eventId] ?? [];
      return { ...prev, [eventId]: current.includes(key) ? current.filter((k) => k !== key) : [...current, key] };
    });
  const active = events.some((e) => (value[e.id]?.length ?? 0) > 0);

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width="sm"
      title="Filter by status"
      subtitle="Pick any statuses per event. People must match every event you filter."
      footer={
        <div className="flex items-center justify-between gap-3">
          <Button variant="ghost" disabled={!active} onClick={() => onChange(() => ({}))}>
            Clear all
          </Button>
          <Button variant="primary" onClick={onClose}>
            Show results
          </Button>
        </div>
      }
    >
      <div className="space-y-7 px-6 py-6">
        {events.length === 0 && <p className="text-sm text-ink-3">Pick at least one event first.</p>}
        {events.map((e) => {
          const picked = value[e.id] ?? [];
          return (
            <section key={e.id}>
              <div className="mb-2.5 flex items-baseline justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold">{e.name}</div>
                  <div className="text-xs text-ink-3">{fmt(e.start_at, e.time_zone, "EEE, MMM d")}</div>
                </div>
                {picked.length > 0 && (
                  <button onClick={() => onChange((prev) => ({ ...prev, [e.id]: [] }))} className="shrink-0 text-xs font-medium text-accent">
                    Clear
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {OPTIONS.map((k) => {
                  const on = picked.includes(k);
                  return (
                    <button
                      key={k}
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggle(e.id, k)}
                      className={cx(
                        "inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium ring-1 transition-colors ring-inset",
                        on ? "bg-ink text-white ring-ink" : "bg-surface text-ink-2 ring-border hover:text-ink hover:ring-border-strong",
                      )}
                    >
                      {on ? (
                        <Check className="size-3.5" strokeWidth={3} />
                      ) : (
                        <span className={cx("size-2 rounded-full", RSVP[k].dot)} />
                      )}
                      {statusKeyLabel(k)}
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </Drawer>
  );
}
