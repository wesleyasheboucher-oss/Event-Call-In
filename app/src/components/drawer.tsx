"use client";

import { useEffect, useRef, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { X } from "lucide-react";
import { cx, IconButton } from "./ui";

const SPRING = { type: "spring", stiffness: 420, damping: 40, mass: 0.9 } as const;

function useEscape(open: boolean, onClose: () => void) {
  const ref = useRef(onClose);
  useEffect(() => {
    ref.current = onClose;
  });
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && ref.current();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);
}

const noop = () => () => {};

/** Portals to <body>, but only after hydration so server and client markup match. */
function Portal({ children }: { children: ReactNode }) {
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  return mounted ? createPortal(children, document.body) : null;
}

/** Side sheet that slides in from the right. */
export function Drawer({
  open,
  onClose,
  title,
  subtitle,
  header,
  footer,
  width = "md",
  children,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  subtitle?: ReactNode;
  header?: ReactNode;
  footer?: ReactNode;
  width?: "sm" | "md" | "lg" | "xl";
  children: ReactNode;
}) {
  useEscape(open, onClose);
  const w = { sm: "max-w-md", md: "max-w-xl", lg: "max-w-2xl", xl: "max-w-4xl" }[width];
  return (
    <Portal>
      <AnimatePresence>
        {open && (
          <div className="fixed inset-0 z-50" role="dialog" aria-modal="true">
            <motion.div
              className="absolute inset-0 bg-stone-900/20 backdrop-blur-[2px]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={onClose}
            />
            <motion.aside
              className={cx(
                "absolute inset-y-0 right-0 flex w-full flex-col bg-surface shadow-[var(--shadow-drawer)] sm:inset-y-2 sm:right-2 sm:rounded-2xl sm:ring-1 sm:ring-border",
                w,
              )}
              initial={{ x: "105%" }}
              animate={{ x: 0 }}
              exit={{ x: "105%" }}
              transition={SPRING}
            >
              {(title || header) && (
                <div className="flex items-start gap-3 border-b border-border px-6 py-5">
                  <div className="min-w-0 flex-1">
                    {header ?? (
                      <>
                        <h2 className="truncate text-lg font-semibold tracking-tight text-ink">{title}</h2>
                        {subtitle && <div className="mt-0.5 text-sm text-ink-2">{subtitle}</div>}
                      </>
                    )}
                  </div>
                  <IconButton label="Close" onClick={onClose} className="-mt-1 -mr-2">
                    <X className="size-4" />
                  </IconButton>
                </div>
              )}
              <div className="flex-1 overflow-y-auto">{children}</div>
              {footer && <div className="border-t border-border bg-surface-2/50 px-6 py-4 sm:rounded-b-2xl">{footer}</div>}
            </motion.aside>
          </div>
        )}
      </AnimatePresence>
    </Portal>
  );
}

/** Centered dialog for confirmations. */
export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
}) {
  useEscape(open, onClose);
  const w = { sm: "max-w-sm", md: "max-w-lg", lg: "max-w-2xl" }[size];
  return (
    <Portal>
      <AnimatePresence>
        {open && (
          <div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center" role="dialog" aria-modal="true">
            <motion.div
              className="absolute inset-0 bg-stone-900/25 backdrop-blur-[2px]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={onClose}
            />
            <motion.div
              className={cx("relative flex max-h-[85vh] w-full flex-col rounded-2xl bg-surface shadow-[var(--shadow-lift)] ring-1 ring-border", w)}
              initial={{ opacity: 0, y: 16, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.98 }}
              transition={{ type: "spring", stiffness: 500, damping: 36 }}
            >
              <div className="flex items-center justify-between px-6 pt-5 pb-2">
                <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
                <IconButton label="Close" onClick={onClose} className="-mr-2">
                  <X className="size-4" />
                </IconButton>
              </div>
              <div className="overflow-y-auto px-6 pb-5">{children}</div>
              {footer && <div className="flex justify-end gap-2 border-t border-border px-6 py-4">{footer}</div>}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </Portal>
  );
}
