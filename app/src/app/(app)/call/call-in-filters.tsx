"use client";

import type { ReactNode } from "react";
import { Check } from "lucide-react";
import type { CallInEvent } from "@/lib/call-in";
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

export type CallInFilters = {
  scope: Scope;
  divisions: Set<number>;
  contactsOnly: boolean;
  activeOnly: boolean;
  status: StatusFilters;
  tags: Set<number>;
};

export const NO_FILTERS: CallInFilters = {
  scope: "listed",
  divisions: new Set(),
  contactsOnly: false,
  activeOnly: false,
  status: {},
  tags: new Set(),
};

/** How many filters differ from the defaults (shown on the Filters button). */
export function countFilters(f: CallInFilters, events: CallInEvent[]): number {
  return (
    (f.scope === "everyone" ? 1 : 0) +
    f.divisions.size +
    (f.contactsOnly ? 1 : 0) +
    (f.activeOnly ? 1 : 0) +
    events.filter((e) => f.status[e.id]?.length).length +
    f.tags.size
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
  tags,
  value,
  onChange,
  resultCount,
}: {
  open: boolean;
  onClose: () => void;
  events: CallInEvent[];
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
