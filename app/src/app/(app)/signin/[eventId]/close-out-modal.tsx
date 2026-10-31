"use client";

import { useMemo, useState } from "react";
import { motion } from "motion/react";
import { toast } from "sonner";
import { Check, PartyPopper } from "lucide-react";
import { Modal } from "@/components/drawer";
import { RsvpChip } from "@/components/status";
import { Button, cx } from "@/components/ui";
import { closeOutEvent, type CloseOutSummary } from "@/app/actions/signin";
import { EXPECTED_RSVPS } from "@/lib/status";
import type { SignInRow } from "./data";
import type { SignInEvent } from "./sign-in-screen";

export function CloseOutModal({
  open,
  onClose,
  event,
  rows,
  onClosed,
}: {
  open: boolean;
  onClose: () => void;
  event: SignInEvent;
  rows: SignInRow[];
  onClosed: (noShowIds: number[]) => void;
}) {
  const candidates = useMemo(() => rows.filter((r) => EXPECTED_RSVPS.includes(r.rsvp) && r.attendance === "pending"), [rows]);
  // Everyone is selected by default; staff opt people out.
  const [excluded, setExcluded] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<CloseOutSummary | null>(null);
  const selected = useMemo(
    () => new Set(candidates.map((c) => c.registration_id).filter((id) => !excluded.has(id))),
    [candidates, excluded],
  );

  const close = () => {
    onClose();
    setTimeout(() => {
      setExcluded(new Set());
      setSummary(null);
    }, 250);
  };

  const toggle = (id: number) =>
    setExcluded((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const confirm = async () => {
    setBusy(true);
    try {
      const ids = [...selected];
      const res = await closeOutEvent(event.id, ids);
      onClosed(ids);
      setSummary(res);
    } catch {
      toast.error("Couldn't close out the event");
    } finally {
      setBusy(false);
    }
  };

  if (summary) {
    return (
      <Modal
        open={open}
        onClose={close}
        title="Event closed out"
        size="sm"
        footer={
          <Button variant="primary" onClick={close}>
            Done
          </Button>
        }
      >
        <div className="flex flex-col items-center py-4 text-center">
          <motion.div
            initial={{ scale: 0, rotate: -20 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: "spring", stiffness: 400, damping: 14 }}
            className="mb-4 flex size-16 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-indigo-500 text-white shadow-lg shadow-indigo-500/30"
          >
            <PartyPopper className="size-7" />
          </motion.div>
          <p className="text-[15px] text-ink-2">{event.name} is marked Completed. Nice work at the door.</p>
          <div className="mt-6 grid w-full grid-cols-2 gap-2">
            {[
              { label: "Attended", value: summary.attended, tone: "text-emerald-600" },
              { label: "No-shows", value: summary.noShow, tone: "text-rose-600" },
              { label: "Walk-ins", value: summary.walkIns, tone: "text-violet-600" },
              { label: "Show rate", value: summary.showRate == null ? "—" : `${Math.round(summary.showRate * 100)}%`, tone: "text-accent" },
            ].map((s, i) => (
              <motion.div
                key={s.label}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 + i * 0.06 }}
                className="rounded-xl bg-surface-2 px-4 py-3"
              >
                <div className={cx("text-2xl font-semibold tabular-nums", s.tone)}>{s.value}</div>
                <div className="text-xs text-ink-2">{s.label}</div>
              </motion.div>
            ))}
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title="Close out event"
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button variant="primary" loading={busy} onClick={confirm}>
            {selected.size ? `Mark ${selected.size} No-Show & complete` : "Complete event"}
          </Button>
        </>
      }
    >
      <p className="mb-4 text-sm text-ink-2">
        {candidates.length === 0
          ? "Everyone expected has been checked in. Completing the event locks in the results."
          : `${candidates.length} expected ${candidates.length === 1 ? "person hasn't" : "people haven't"} checked in. Uncheck anyone who shouldn't be marked No-Show.`}
      </p>
      {candidates.length > 0 && (
        <>
          <div className="mb-2 flex justify-between text-xs text-ink-3">
            <span>{selected.size} selected</span>
            <button
              className="font-medium text-accent"
              onClick={() =>
                setExcluded(selected.size === candidates.length ? new Set(candidates.map((c) => c.registration_id)) : new Set())
              }
            >
              {selected.size === candidates.length ? "Select none" : "Select all"}
            </button>
          </div>
          <ul className="max-h-[45vh] space-y-1 overflow-y-auto rounded-xl ring-1 ring-border">
            {candidates.map((c) => {
              const on = selected.has(c.registration_id);
              return (
                <li key={c.registration_id}>
                  <button
                    onClick={() => toggle(c.registration_id)}
                    className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-surface-2"
                  >
                    <span
                      className={cx(
                        "flex size-5 shrink-0 items-center justify-center rounded-md ring-1 transition-colors",
                        on ? "bg-accent text-white ring-accent" : "bg-surface ring-border-strong",
                      )}
                    >
                      {on && <Check className="size-3.5" strokeWidth={3} />}
                    </span>
                    <span className="flex-1 truncate text-sm font-medium">
                      {c.first_name} {c.last_name}
                    </span>
                    <RsvpChip status={c.rsvp} />
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
      {event.status === "completed" && (
        <p className="mt-4 text-xs text-ink-3">This event is already completed — closing out again only updates anyone still pending.</p>
      )}
    </Modal>
  );
}
