"use client";

import { useId } from "react";
import { motion } from "motion/react";
import {
  ATTENDANCE,
  EVENT_STATUS,
  RSVP,
  RSVP_STATUSES,
  type AttendanceStatus,
  type EventStatus,
  type RsvpStatus,
} from "@/lib/status";
import { Chip, cx } from "./ui";

export function RsvpChip({ status, className }: { status: RsvpStatus; className?: string }) {
  const s = RSVP[status];
  return (
    <Chip className={cx(s.chip, status === "declined" && "font-semibold", className)} dot={s.dot}>
      {s.label}
    </Chip>
  );
}

export function AttendanceChip({ status }: { status: AttendanceStatus }) {
  const s = ATTENDANCE[status];
  return (
    <Chip className={s.chip} dot={s.dot}>
      {s.label}
    </Chip>
  );
}

export function EventStatusChip({ status }: { status: EventStatus }) {
  const s = EVENT_STATUS[status];
  return (
    <Chip className={s.chip} dot={s.dot}>
      {s.label}
    </Chip>
  );
}

/** Segmented one-click RSVP setter with a sliding highlight. */
export function RsvpPicker({
  value,
  onChange,
  size = "md",
  className,
}: {
  value: RsvpStatus;
  onChange: (s: RsvpStatus) => void;
  size?: "sm" | "md";
  className?: string;
}) {
  const id = useId();
  return (
    <div
      role="radiogroup"
      className={cx("inline-flex rounded-xl bg-surface-2 p-1 ring-1 ring-inset ring-border", className)}
      onClick={(e) => e.stopPropagation()}
    >
      {RSVP_STATUSES.map((s) => {
        const active = s === value;
        return (
          <button
            key={s}
            role="radio"
            aria-checked={active}
            onClick={() => !active && onChange(s)}
            className={cx(
              "relative rounded-lg font-medium whitespace-nowrap transition-colors",
              size === "sm" ? "px-2.5 py-1 text-xs" : "px-3 py-1.5 text-[13px]",
              active ? (s === "no_data" ? "text-ink" : "text-white") : "text-ink-2 hover:text-ink",
            )}
          >
            {active && (
              <motion.span
                layoutId={`rsvp-${id}`}
                className={cx(
                  "absolute inset-0 rounded-lg shadow-sm",
                  s === "no_data" ? "bg-surface ring-1 ring-border" : RSVP[s].solid,
                )}
                transition={{ type: "spring", stiffness: 520, damping: 38 }}
              />
            )}
            <span className="relative">{RSVP[s].label}</span>
          </button>
        );
      })}
    </div>
  );
}
