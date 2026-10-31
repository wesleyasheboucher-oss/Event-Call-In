"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Loader2, Users } from "lucide-react";
import { previewList } from "@/app/actions/events";
import { fetchTags } from "@/app/actions/tags";
import { TAG_STYLE, type TagWithCount } from "@/lib/tag-colors";
import { fmt } from "@/lib/time";
import { cx, Select } from "@/components/ui";
import type { CallListFilter } from "./types";

export type PastEventOption = { id: number; name: string; start_at: string; time_zone: string };

const MODES: { key: CallListFilter["mode"]; label: string; body: string }[] = [
  { key: "all", label: "All contacts", body: "Everyone in the database." },
  { key: "attended_any", label: "Past attendees", body: "Attended at least one past event." },
  { key: "attended_event", label: "Attended a specific event", body: "Only people who came to one event." },
  { key: "none", label: "Start empty", body: "Add people individually later." },
];

/** Picks who goes on an event's call list, with a live count. */
export function CallListBuilder({
  eventId,
  value,
  onChange,
  pastEvents,
  allowNone = true,
}: {
  eventId: number | null;
  value: CallListFilter;
  onChange: (f: CallListFilter) => void;
  pastEvents: PastEventOption[];
  allowNone?: boolean;
}) {
  const [preview, setPreview] = useState<{ matched: number; added: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [tags, setTags] = useState<TagWithCount[]>([]);

  useEffect(() => {
    fetchTags().then(setTags);
  }, []);

  useEffect(() => {
    let live = true;
    const t = setTimeout(() => {
      setLoading(true);
      previewList(eventId, value)
        .then((p) => live && setPreview(p))
        .finally(() => live && setLoading(false));
    }, 150);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [eventId, value]);

  const modes = allowNone ? MODES : MODES.filter((m) => m.key !== "none");

  return (
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-2">
        {modes.map((m) => {
          const active = value.mode === m.key;
          return (
            <button
              key={m.key}
              type="button"
              onClick={() =>
                onChange({
                  ...value,
                  mode: m.key,
                  attendedEventId: m.key === "attended_event" ? value.attendedEventId ?? pastEvents[0]?.id ?? null : null,
                })
              }
              className={cx(
                "relative rounded-2xl p-4 text-left ring-1 transition-all",
                active ? "bg-accent-soft/60 ring-2 ring-accent" : "ring-border hover:bg-surface-2",
              )}
            >
              <div className="flex items-center gap-2 text-sm font-medium">
                <span
                  className={cx(
                    "flex size-4 items-center justify-center rounded-full ring-1 transition-colors",
                    active ? "bg-accent ring-accent" : "ring-border-strong",
                  )}
                >
                  {active && <span className="size-1.5 rounded-full bg-white" />}
                </span>
                {m.label}
              </div>
              <div className="mt-1 pl-6 text-xs text-ink-2">{m.body}</div>
            </button>
          );
        })}
      </div>

      <AnimatePresence initial={false}>
        {value.mode === "attended_event" && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
            <Select
              value={value.attendedEventId ?? ""}
              onChange={(e) => onChange({ ...value, attendedEventId: Number(e.target.value) || null })}
            >
              {pastEvents.length === 0 && <option value="">No past events yet</option>}
              {pastEvents.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} — {fmt(p.start_at, p.time_zone, "MMM d, yyyy")}
                </option>
              ))}
            </Select>
          </motion.div>
        )}
      </AnimatePresence>

      {value.mode !== "none" && (
        <label className="flex items-center gap-3 text-sm text-ink">
          <input
            type="checkbox"
            checked={value.excludeNoShows}
            onChange={(e) => onChange({ ...value, excludeNoShows: e.target.checked })}
            className="size-4 rounded accent-[var(--accent)]"
          />
          Leave out anyone who no-showed before
        </label>
      )}

      {value.mode !== "none" && tags.length > 0 && (
        <div>
          <div className="mb-2 text-sm text-ink">
            Only people tagged <span className="text-ink-3">(any of these, optional)</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {tags.map((t) => {
              const on = value.tagIds?.includes(t.id) ?? false;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() =>
                    onChange({
                      ...value,
                      tagIds: on ? (value.tagIds ?? []).filter((id) => id !== t.id) : [...(value.tagIds ?? []), t.id],
                    })
                  }
                  className={cx(
                    "inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium ring-1 ring-inset transition-all sm:h-8",
                    on ? cx(TAG_STYLE[t.color].chip, "ring-2") : "bg-surface text-ink-2 ring-border hover:ring-border-strong",
                  )}
                >
                  <span className={cx("size-2 rounded-full", TAG_STYLE[t.color].dot)} />
                  {t.name}
                  <span className="text-[11px] opacity-60 tabular-nums">{t.count}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex items-center gap-3 rounded-2xl bg-surface-2 px-4 py-3">
        <span className="flex size-9 items-center justify-center rounded-xl bg-surface text-accent ring-1 ring-border">
          {loading ? <Loader2 className="size-4 animate-spin" /> : <Users className="size-4" />}
        </span>
        <div className="text-sm">
          {value.mode === "none" ? (
            <span className="text-ink-2">The call list starts empty.</span>
          ) : preview ? (
            <>
              <motion.span key={preview.added} initial={{ opacity: 0.4 }} animate={{ opacity: 1 }} className="font-semibold tabular-nums">
                {preview.added.toLocaleString()}
              </motion.span>{" "}
              {eventId ? "new people will be added" : "people will be on the call list"}
              {eventId && preview.matched !== preview.added && (
                <span className="text-ink-3"> · {preview.matched - preview.added} already on it</span>
              )}
            </>
          ) : (
            <span className="text-ink-3">Counting…</span>
          )}
        </div>
      </div>
    </div>
  );
}
