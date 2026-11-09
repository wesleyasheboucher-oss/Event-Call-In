"use client";

import { useState, type ReactNode } from "react";
import { Check } from "lucide-react";
import type { CallInEvent, ConfirmEvent } from "@/lib/call-in";
import { RSVP, RSVP_STATUSES, type RsvpStatus } from "@/lib/status";
import { TAG_STYLE, type TagWithCount } from "@/lib/tag-colors";
import { fmt } from "@/lib/time";
import { BottomSheet } from "@/components/drawer";
import { Button, cx } from "@/components/ui";

/** "No Data" also covers people with no record for that event at all. */
export type StatusKey = RsvpStatus;
export type StatusFilters = Record<number, StatusKey[]>;
export type Scope = "listed" | "everyone";

export const statusKeyLabel = (k: StatusKey) => RSVP[k].label;

/** "Confirmed for an event in the last N days". eventId null = any event. days null = off. */
export type ConfirmedFilter = { eventId: number | null; days: number | null };

export type CallInFilters = {
  scope: Scope;
  divisions: Set<number>;
  contactsOnly: boolean;
  activeOnly: boolean;
  status: StatusFilters;
  tags: Set<number>;
  confirmed: ConfirmedFilter;
};

export const CONFIRMED_DAYS = [1, 7, 14, 30, 90];
export const daysLabel = (d: number) => (d === 1 ? "24 hours" : `${d} days`);

/** Did this person confirm (and stay confirmed) for the chosen event, or any event, within the window? */
export function confirmedWithin(confirmedAt: Record<number, string>, f: ConfirmedFilter, now = Date.now()): boolean {
  if (f.days == null) return true;
  const since = new Date(now - f.days * 864e5).toISOString();
  if (f.eventId != null) return (confirmedAt[f.eventId] ?? "") >= since;
  return Object.values(confirmedAt).some((at) => at >= since);
}

export const NO_FILTERS: CallInFilters = {
  scope: "listed",
  divisions: new Set(),
  contactsOnly: false,
  activeOnly: false,
  status: {},
  tags: new Set(),
  confirmed: { eventId: null, days: null },
};

/** How many filters differ from the defaults (shown on the Filters button). */
export function countFilters(f: CallInFilters, events: CallInEvent[]): number {
  return (
    (f.scope === "everyone" ? 1 : 0) +
    f.divisions.size +
    (f.contactsOnly ? 1 : 0) +
    (f.activeOnly ? 1 : 0) +
    events.filter((e) => f.status[e.id]?.length).length +
    f.tags.size +
    (f.confirmed.days != null ? 1 : 0)
  );
}

const toggleIn = <T,>(set: Set<T>, v: T) => {
  const next = new Set(set);
  if (next.has(v)) next.delete(v);
  else next.add(v);
  return next;
};

/**
 * Every Call In filter in one sheet from the bottom. Changes apply as you tap; the
 * button shows how many people match. Status: a person shows only if, for every
 * event with picks, their status for that event is one of the picks.
 */
export function CallInFilterSheet({
  open,
  onClose,
  events,
  confirmEvents,
  tags,
  value,
  onChange,
  resultCount,
}: {
  open: boolean;
  onClose: () => void;
  events: CallInEvent[];
  /** Events anyone confirmed for in the last year, for "Confirmed recently". */
  confirmEvents: ConfirmEvent[];
  tags: TagWithCount[];
  value: CallInFilters;
  /** Receives an updater so quick successive taps each build on the latest filters. */
  onChange: (update: (prev: CallInFilters) => CallInFilters) => void;
  resultCount: number;
}) {
  const set = (patch: (prev: CallInFilters) => Partial<CallInFilters>) => onChange((prev) => ({ ...prev, ...patch(prev) }));
  const active = countFilters(value, events) > 0;

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="Filters"
      footer={
        <div className="flex items-center justify-between gap-3">
          <Button variant="ghost" disabled={!active} onClick={() => onChange(() => NO_FILTERS)}>
            Clear all
          </Button>
          <Button variant="primary" onClick={onClose}>
            Show {resultCount.toLocaleString()} {resultCount === 1 ? "person" : "people"}
          </Button>
        </div>
      }
    >
      <div className="space-y-7 px-6 py-5">
        <Section title="Show">
          <div className="flex rounded-xl bg-surface-2 p-1 ring-1 ring-border ring-inset">
            {(
              [
                ["listed", "On these lists"],
                ["everyone", "Everyone"],
              ] as const
            ).map(([s, label]) => (
              <button
                key={s}
                type="button"
                aria-pressed={value.scope === s}
                onClick={() => set(() => ({ scope: s }))}
                className={cx(
                  "h-9 flex-1 rounded-lg text-[13px] font-medium transition-colors",
                  value.scope === s ? "bg-surface text-ink shadow-sm ring-1 ring-border" : "text-ink-2 hover:text-ink",
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-xs text-ink-3">
            {value.scope === "listed" ? "People registered for at least one selected event." : "Every contact, including people on no list yet."}
          </p>
        </Section>

        <Section title="People">
          <div className="flex flex-wrap gap-1.5">
            {[4, 6].map((d) => {
              const on = value.divisions.has(d);
              return (
                <Chip
                  key={d}
                  on={on}
                  onClick={() => set((p) => ({ divisions: toggleIn(p.divisions, d) }))}
                  onClass={d === 4 ? "bg-teal-600 text-white ring-teal-600" : "bg-violet-600 text-white ring-violet-600"}
                >
                  Div {d}
                </Chip>
              );
            })}
            <Chip on={value.contactsOnly} onClick={() => set((p) => ({ contactsOnly: !p.contactsOnly }))}>
              Contacts only
            </Chip>
            <Chip on={value.activeOnly} onClick={() => set((p) => ({ activeOnly: !p.activeOnly }))}>
              Active only
            </Chip>
          </div>
        </Section>

        {events.map((e) => {
          const picked = value.status[e.id] ?? [];
          return (
            <Section
              key={e.id}
              title={
                <>
                  Status · <span className="text-ink">{e.name}</span>
                  <span className="ml-1.5 font-normal text-ink-3">{fmt(e.start_at, e.time_zone, "MMM d")}</span>
                </>
              }
              onClear={picked.length ? () => set((p) => ({ status: { ...p.status, [e.id]: [] } })) : undefined}
            >
              <div className="flex flex-wrap gap-1.5">
                {RSVP_STATUSES.map((k) => (
                  <Chip
                    key={k}
                    on={picked.includes(k)}
                    dot={RSVP[k].dot}
                    onClick={() =>
                      set((p) => {
                        const cur = p.status[e.id] ?? [];
                        return { status: { ...p.status, [e.id]: cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k] } };
                      })
                    }
                  >
                    {statusKeyLabel(k)}
                  </Chip>
                ))}
              </div>
            </Section>
          );
        })}

        <ConfirmedSection
          value={value.confirmed}
          events={confirmEvents}
          onChange={(confirmed) => set(() => ({ confirmed }))}
        />

        {tags.length > 0 && (
          <Section title="Tags" onClear={value.tags.size ? () => set(() => ({ tags: new Set() })) : undefined}>
            <div className="flex flex-wrap gap-1.5">
              {tags.map((t) => (
                <Chip
                  key={t.id}
                  on={value.tags.has(t.id)}
                  dot={TAG_STYLE[t.color].dot}
                  onClass={cx(TAG_STYLE[t.color].chip, "ring-2")}
                  onClick={() => set((p) => ({ tags: toggleIn(p.tags, t.id) }))}
                >
                  {t.name}
                </Chip>
              ))}
            </div>
          </Section>
        )}
      </div>
    </BottomSheet>
  );
}

function ConfirmedSection({
  value,
  events,
  onChange,
}: {
  value: ConfirmedFilter;
  events: ConfirmEvent[];
  onChange: (v: ConfirmedFilter) => void;
}) {
  const custom = value.days != null && !CONFIRMED_DAYS.includes(value.days);
  const [customText, setCustomText] = useState(custom ? String(value.days) : "");
  return (
    <Section title="Confirmed recently" onClear={value.days != null ? () => onChange({ eventId: null, days: null }) : undefined}>
      <p className="-mt-1 mb-2.5 text-xs text-ink-3">People who confirmed in this time and are still confirmed.</p>
      <select
        value={value.eventId ?? ""}
        onChange={(e) => onChange({ ...value, eventId: e.target.value ? Number(e.target.value) : null, days: value.days ?? 7 })}
        className="mb-2.5 h-10 w-full rounded-xl bg-surface px-3 text-sm text-ink ring-1 ring-border ring-inset focus:ring-2 focus:ring-accent focus:outline-none"
      >
        <option value="">For any event</option>
        {events.map((e) => (
          <option key={e.id} value={e.id}>
            For {e.name} · {fmt(e.start_at, e.time_zone, "MMM d, yyyy")}
          </option>
        ))}
      </select>
      <div className="flex flex-wrap items-center gap-1.5">
        {CONFIRMED_DAYS.map((d) => (
          <Chip key={d} on={value.days === d} onClick={() => onChange({ ...value, days: value.days === d ? null : d })}>
            Last {daysLabel(d)}
          </Chip>
        ))}
        <label
          className={cx(
            "inline-flex h-9 items-center gap-1.5 rounded-full pr-3 pl-3 text-[13px] font-medium ring-1 ring-inset",
            custom ? "bg-ink text-white ring-ink" : "bg-surface text-ink-2 ring-border",
          )}
        >
          Last
          <input
            inputMode="numeric"
            value={customText}
            placeholder="#"
            onChange={(e) => {
              const t = e.target.value.replace(/\D/g, "").slice(0, 3);
              setCustomText(t);
              if (Number(t) > 0) onChange({ ...value, days: Number(t) });
            }}
            className={cx(
              "w-9 rounded-md bg-transparent text-center tabular-nums outline-none placeholder:opacity-60",
              custom ? "bg-white/15" : "bg-surface-2",
            )}
            aria-label="Number of days"
          />
          days
        </label>
      </div>
    </Section>
  );
}

function Section({ title, onClear, children }: { title: ReactNode; onClear?: () => void; children: ReactNode }) {
  return (
    <section>
      <div className="mb-2.5 flex items-baseline justify-between gap-3">
        <h3 className="min-w-0 truncate text-xs font-semibold tracking-wide text-ink-2 uppercase">{title}</h3>
        {onClear && (
          <button type="button" onClick={onClear} className="shrink-0 text-xs font-medium text-accent">
            Clear
          </button>
        )}
      </div>
      {children}
    </section>
  );
}

function Chip({
  on,
  onClick,
  dot,
  onClass = "bg-ink text-white ring-ink",
  children,
}: {
  on: boolean;
  onClick: () => void;
  dot?: string;
  onClass?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cx(
        "inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium ring-1 transition-colors ring-inset",
        on ? onClass : "bg-surface text-ink-2 ring-border hover:text-ink hover:ring-border-strong",
      )}
    >
      {on ? <Check className="size-3.5" strokeWidth={3} /> : dot && <span className={cx("size-2 rounded-full", dot)} />}
      {children}
    </button>
  );
}
