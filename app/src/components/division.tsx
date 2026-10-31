"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { toast } from "sonner";
import { setContactActive, setContactDivision } from "@/app/actions/contacts";
import { CONTACT_DIVISIONS } from "@/lib/status";
import { cx } from "./ui";

/** Distinct tints so Div 4 and Div 6 are easy to tell apart when scanning a list. */
const TONE: Record<number, string> = {
  1: "bg-stone-100 text-stone-700 ring-stone-200",
  2: "bg-rose-50 text-rose-700 ring-rose-200",
  3: "bg-amber-50 text-amber-800 ring-amber-200",
  4: "bg-teal-50 text-teal-700 ring-teal-200",
  5: "bg-sky-50 text-sky-700 ring-sky-200",
  6: "bg-violet-50 text-violet-700 ring-violet-200",
  7: "bg-pink-50 text-pink-700 ring-pink-200",
};

export function ContactDivisionBadge({ division, className }: { division: number | null | undefined; className?: string }) {
  if (division == null) return null;
  return (
    <span
      className={cx(
        "inline-flex shrink-0 items-center rounded-md px-1.5 py-px text-[11px] font-semibold tabular-nums ring-1 ring-inset",
        TONE[division] ?? TONE[1],
        className,
      )}
      title={`Division ${division}`}
    >
      Div {division}
    </span>
  );
}

/** Tappable Div 4 / Div 6 switch. Tapping the selected one clears it. */
export function ContactDivisionToggle({
  contactId,
  value,
  onChange,
}: {
  contactId: number;
  value: number | null;
  onChange: (division: number | null) => void;
}) {
  const [saving, setSaving] = useState(false);

  const pick = async (d: number) => {
    const next = value === d ? null : d;
    const prev = value;
    onChange(next);
    setSaving(true);
    try {
      await setContactDivision(contactId, next);
    } catch {
      onChange(prev);
      toast.error("Couldn't save the division.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div role="radiogroup" aria-label="Division" className={cx("inline-flex rounded-xl bg-surface-2 p-1 ring-1 ring-border ring-inset", saving && "opacity-80")}>
      {CONTACT_DIVISIONS.map((d) => {
        const on = value === d;
        return (
          <button
            key={d}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => pick(d)}
            className={cx(
              "relative h-9 min-w-[72px] rounded-lg px-3 text-[13px] font-semibold tabular-nums transition-colors",
              on ? "text-white" : "text-ink-2 hover:text-ink",
            )}
          >
            {on && (
              <motion.span
                layoutId={`div-toggle-${contactId}`}
                className={cx("absolute inset-0 rounded-lg shadow-sm", d === 4 ? "bg-teal-600" : "bg-violet-600")}
                transition={{ type: "spring", stiffness: 520, damping: 36 }}
              />
            )}
            <span className="relative">Div {d}</span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * Compact Div 4 | Div 6 switch for list rows: saves on tap without opening the
 * contact. Clicks don't bubble, so the row itself doesn't open.
 */
export function ContactDivisionMini({
  contactId,
  value,
  onChange,
  compact,
  className,
}: {
  contactId: number;
  value: number | null;
  onChange: (division: number | null) => void;
  /** Just "4 | 6", for tight table columns headed "Div". */
  compact?: boolean;
  className?: string;
}) {
  const pick = async (e: React.MouseEvent, d: number) => {
    e.stopPropagation();
    const next = value === d ? null : d;
    const prev = value;
    onChange(next);
    try {
      await setContactDivision(contactId, next);
    } catch {
      onChange(prev);
      toast.error("Couldn't save the division.");
    }
  };

  return (
    <span
      role="radiogroup"
      aria-label="Division"
      onClick={(e) => e.stopPropagation()}
      className={cx("inline-flex shrink-0 rounded-lg bg-surface-2 p-0.5 ring-1 ring-border ring-inset", className)}
    >
      {CONTACT_DIVISIONS.map((d) => {
        const on = value === d;
        return (
          <button
            key={d}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={`Division ${d}`}
            title={on ? `Division ${d} (tap to clear)` : `Set division ${d}`}
            onClick={(e) => pick(e, d)}
            className={cx(
              "h-7 rounded-md text-[11px] font-semibold whitespace-nowrap tabular-nums transition-colors md:h-6",
              compact ? "w-7" : "px-2",
              on ? (d === 4 ? "bg-teal-600 text-white shadow-sm" : "bg-violet-600 text-white shadow-sm") : "text-ink-3 hover:text-ink",
            )}
          >
            {compact ? d : `Div ${d}`}
          </button>
        );
      })}
    </span>
  );
}

/** Active Yes / No switch for a contact (saves immediately). */
export function ContactActiveToggle({
  contactId,
  value,
  onChange,
}: {
  contactId: number;
  value: boolean;
  onChange: (active: boolean) => void;
}) {
  const pick = async (next: boolean) => {
    if (next === value) return;
    onChange(next);
    try {
      await setContactActive(contactId, next);
    } catch {
      onChange(!next);
      toast.error("Couldn't save. Try again.");
    }
  };
  return (
    <div role="radiogroup" aria-label="Active" className="inline-flex items-center gap-2">
      <span className="text-[13px] font-medium text-ink-2">Active</span>
      <span className="inline-flex rounded-xl bg-surface-2 p-1 ring-1 ring-border ring-inset">
        {[true, false].map((v) => {
          const on = value === v;
          return (
            <button
              key={String(v)}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => pick(v)}
              className={cx(
                "relative h-9 min-w-[52px] rounded-lg px-3 text-[13px] font-semibold transition-colors",
                on ? (v ? "text-white" : "text-white") : "text-ink-2 hover:text-ink",
              )}
            >
              {on && (
                <motion.span
                  layoutId={`active-toggle-${contactId}`}
                  className={cx("absolute inset-0 rounded-lg shadow-sm", v ? "bg-emerald-600" : "bg-stone-500")}
                  transition={{ type: "spring", stiffness: 520, damping: 36 }}
                />
              )}
              <span className="relative">{v ? "Yes" : "No"}</span>
            </button>
          );
        })}
      </span>
    </div>
  );
}
