"use client";

import { useEffect, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { Check, Plus } from "lucide-react";
import { RSVP, RSVP_STATUSES, type RsvpStatus } from "@/lib/status";
import { cx } from "@/components/ui";

export type MenuTarget = {
  rect: DOMRect;
  /** Window size when the menu was opened (decides popover vs. bottom sheet). */
  viewport: { width: number; height: number };
  personName: string;
  eventName: string;
  /** null = not on this event's list yet */
  current: RsvpStatus | null;
};

const noop = () => () => {};
const MENU_W = 232;
const MENU_H = 290; // header + five options (+ hint when adding)

/** Below the cell, centered, kept inside the window; flips above when near the bottom. */
function place({ rect, viewport }: MenuTarget) {
  const left = Math.max(12, Math.min(rect.left + rect.width / 2 - MENU_W / 2, viewport.width - MENU_W - 12));
  let top = rect.bottom + 6;
  if (top + MENU_H > viewport.height - 12) top = Math.max(12, rect.top - MENU_H - 6);
  return { top, left };
}

/**
 * Pick a registration status for one person on one event.
 * Popover next to the cell on desktop; bottom sheet with big targets on phones.
 */
export function StatusMenu({
  target,
  onPick,
  onClose,
}: {
  target: MenuTarget | null;
  onPick: (s: RsvpStatus) => void;
  onClose: () => void;
}) {
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  const sheet = !!target && target.viewport.width < 640;
  const pos = target && !sheet ? place(target) : null;

  useEffect(() => {
    if (!target) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      const n = Number(e.key);
      if (n >= 1 && n <= 5) onPick(RSVP_STATUSES[n - 1]);
    };
    const onScroll = () => !sheet && onClose();
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [target, sheet, onClose, onPick]);

  if (!mounted) return null;
  return createPortal(
    <AnimatePresence>
      {target && (
        <div className="fixed inset-0 z-50" onClick={onClose}>
          {sheet && (
            <motion.div
              className="absolute inset-0 bg-stone-900/25"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            />
          )}
          <motion.div
            onClick={(e) => e.stopPropagation()}
            role="menu"
            initial={sheet ? { y: "100%" } : { opacity: 0, scale: 0.96, y: -4 }}
            animate={sheet ? { y: 0 } : { opacity: 1, scale: 1, y: 0 }}
            exit={sheet ? { y: "100%" } : { opacity: 0, scale: 0.97 }}
            transition={sheet ? { type: "spring", stiffness: 420, damping: 40 } : { duration: 0.14 }}
            style={pos ? { top: pos.top, left: pos.left, width: MENU_W } : undefined}
            className={cx(
              "absolute bg-surface ring-1 ring-border",
              sheet
                ? "inset-x-0 bottom-0 rounded-t-3xl px-3 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-[var(--shadow-lift)]"
                : "rounded-2xl p-1.5 shadow-[var(--shadow-lift)]",
            )}
          >
            {sheet && <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-border-strong" />}
            <div className={cx("px-2.5 pt-1 pb-2", sheet && "px-3")}>
              <div className={cx("truncate font-semibold", sheet ? "text-base" : "text-[13px]")}>{target.personName}</div>
              <div className="truncate text-xs text-ink-3">
                {target.current === null ? `Not on the ${target.eventName} list yet` : target.eventName}
              </div>
            </div>
            {RSVP_STATUSES.map((s, i) => {
              const on = target.current === s;
              return (
                <button
                  key={s}
                  role="menuitemradio"
                  aria-checked={on}
                  onClick={() => onPick(s)}
                  className={cx(
                    "flex w-full items-center gap-3 rounded-xl px-2.5 text-left font-medium transition-colors hover:bg-surface-2",
                    sheet ? "min-h-13 px-3 text-[15px]" : "h-9 text-[13px]",
                    on && "bg-surface-2",
                  )}
                >
                  <span className={cx("size-2.5 shrink-0 rounded-full", RSVP[s].dot)} />
                  <span className={cx("flex-1", s === "declined" && "text-rose-700")}>{RSVP[s].label}</span>
                  {on ? (
                    <Check className="size-4 text-accent" />
                  ) : target.current === null ? (
                    <Plus className="size-3.5 text-ink-3" />
                  ) : (
                    !sheet && <kbd className="font-mono text-[10px] text-ink-3">{i + 1}</kbd>
                  )}
                </button>
              );
            })}
            {target.current === null && (
              <p className={cx("px-2.5 pt-1.5 pb-1 text-[11px] text-ink-3", sheet && "px-3")}>
                Picking a status adds them to this event&apos;s list.
              </p>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
