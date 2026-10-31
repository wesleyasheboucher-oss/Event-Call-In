"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { AnimatePresence, motion } from "motion/react";
import { toast } from "sonner";
import { ChevronDown, ChevronLeft, ChevronRight, Phone, Send } from "lucide-react";
import type { CallListRow, GuestRow } from "@/lib/types";
import { RSVP, RSVP_STATUSES, type RsvpStatus } from "@/lib/status";
import { formatPhone, telHref } from "@/lib/phone";
import { ago } from "@/lib/time";
import {
  addCallNote,
  fetchRegistrationDetail,
  type RegistrationDetail,
} from "@/app/actions/registrations";
import { Drawer } from "@/components/drawer";
import { GuestsPanel } from "@/components/guests-panel";
import { RsvpPicker } from "@/components/status";
import { Button, cx, SectionTitle, Textarea } from "@/components/ui";
import {
  AddressBlock,
  ContactHeader,
  HistoryList,
  NotesList,
  PanelSkeleton,
  QuickStats,
} from "@/components/contact-panel";
import type { CallEvent } from "./workspace";

const QUICK_NOTES = ["Left voicemail", "No answer", "Call back later", "Wrong number", "Asked to be removed"];

export function CallerDrawer({
  event,
  row,
  onClose,
  onRsvp,
  onPatch,
  hasPrev,
  hasNext,
  onPrev,
  onNext,
  nextId,
}: {
  event: CallEvent;
  row: CallListRow | null;
  onClose: () => void;
  onRsvp: (s: RsvpStatus) => void;
  onPatch: (id: number, p: Partial<CallListRow>) => void;
  hasPrev: boolean;
  hasNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  nextId?: number;
}) {
  const [cache, setCache] = useState<Record<number, RegistrationDetail>>({});
  const [note, setNote] = useState("");
  const [saving, startSaving] = useTransition();
  const [scriptOpen, setScriptOpen] = useState(false);
  const id = row?.registration_id;
  const detail = id ? cache[id] : undefined;
  const noteRef = useRef<HTMLTextAreaElement>(null);

  const load = (regId: number) =>
    fetchRegistrationDetail(regId).then((d) => d && setCache((c) => ({ ...c, [regId]: d })));

  // Clear the draft note when moving to another person.
  const [noteFor, setNoteFor] = useState(id);
  if (noteFor !== id) {
    setNoteFor(id);
    setNote("");
  }

  // Load the open person, then prefetch the next one so "Next" is instant.
  useEffect(() => {
    if (id) load(id);
  }, [id]);  

  useEffect(() => {
    if (nextId && !cache[nextId]) load(nextId);
  }, [nextId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Refresh audit trail after a status change on this person.
  const rsvp = row?.rsvp;
  useEffect(() => {
    if (id && cache[id] && rsvp !== undefined) {
      const t = setTimeout(() => load(id), 400);
      return () => clearTimeout(t);
    }
  }, [rsvp]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keyboard: 1–5 set status, J/K or arrows move, N focuses note.
  useEffect(() => {
    if (!row) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.tagName === "TEXTAREA" || t.tagName === "INPUT" || t.tagName === "SELECT") return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const n = Number(e.key);
      if (n >= 1 && n <= 5) onRsvp(RSVP_STATUSES[n - 1]);
      else if ((e.key === "j" || e.key === "ArrowDown") && hasNext) onNext();
      else if ((e.key === "k" || e.key === "ArrowUp") && hasPrev) onPrev();
      else if (e.key === "n") {
        e.preventDefault();
        noteRef.current?.focus();
      } else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [row, hasNext, hasPrev, onNext, onPrev, onRsvp]);

  const submitNote = (text: string) => {
    if (!id || !text.trim()) return;
    startSaving(async () => {
      try {
        const { note: n } = await addCallNote(id, text);
        setCache((c) =>
          c[id] ? { ...c, [id]: { ...c[id], registrationNotes: [n, ...c[id].registrationNotes] } } : c,
        );
        onPatch(id, {
          note_count: (row?.note_count ?? 0) + 1,
          last_note: n.body,
          last_called_at: n.created_at,
        });
        setNote("");
      } catch {
        toast.error("Couldn't save the note.");
      }
    });
  };

  const updateGuests = (guests: GuestRow[]) => {
    if (!id) return;
    setCache((c) => (c[id] ? { ...c, [id]: { ...c[id], guests } } : c));
    onPatch(id, {
      guest_count: guests.length,
      guest_names: guests.map((g) => `${g.first_name} ${g.last_name}`).join(", ") || null,
    });
  };

  return (
    <Drawer
      open={!!row}
      onClose={onClose}
      width="md"
      header={
        detail ? (
          <ContactHeader detail={detail} />
        ) : row ? (
          <div className="text-lg font-semibold">
            {row.first_name} {row.last_name}
          </div>
        ) : null
      }
      footer={
        <div className="flex items-center justify-between gap-3">
          <Button variant="ghost" size="sm" icon={<ChevronLeft className="size-4" />} disabled={!hasPrev} onClick={onPrev}>
            Previous
          </Button>
          <span className="hidden text-[11px] text-ink-3 sm:block">
            <kbd className="font-mono">1–5</kbd> status · <kbd className="font-mono">J/K</kbd> move · <kbd className="font-mono">N</kbd> note
          </span>
          <Button variant="primary" size="sm" disabled={!hasNext} onClick={onNext}>
            Next person <ChevronRight className="size-4" />
          </Button>
        </div>
      }
    >
      {row && (
        <AnimatePresence mode="wait">
          <motion.div
            key={row.registration_id}
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -12 }}
            transition={{ duration: 0.18 }}
            className="space-y-8 px-6 py-6"
          >
            {/* Dial */}
            {row.phone ? (
              <a
                href={telHref(row.phone)}
                className="group flex items-center justify-between rounded-2xl bg-accent px-5 py-4 text-white shadow-lg shadow-indigo-500/20 transition-transform active:scale-[0.99]"
              >
                <span>
                  <span className="block text-xs text-white/70">Tap to call</span>
                  <span className="text-xl font-semibold tracking-tight tabular-nums">{formatPhone(row.phone)}</span>
                </span>
                <span className="flex size-11 items-center justify-center rounded-full bg-white/15 transition-transform group-hover:scale-105">
                  <Phone className="size-5" />
                </span>
              </a>
            ) : (
              <div className="rounded-2xl bg-surface-2 px-5 py-4 text-sm text-ink-2">No phone on file. Try email instead.</div>
            )}

            {/* Status */}
            <section>
              <SectionTitle>RSVP for this event</SectionTitle>
              <RsvpPicker value={row.rsvp} onChange={onRsvp} className="flex w-full flex-wrap [&>button]:flex-1" />
              {row.rsvp === "declined" && (
                <p className="mt-2 text-xs text-rose-600">Declined. They can still be called and moved to another status.</p>
              )}
              <p className="mt-3 text-xs text-ink-3">
                {row.last_called_at
                  ? `Last called ${ago(row.last_called_at)}${row.called_by_name ? ` by ${row.called_by_name}` : ""}`
                  : "Not called yet for this event"}
              </p>
            </section>

            {/* Guests */}
            {event.plus_ones_allowed > 0 && (
              <section>
                <SectionTitle>Bringing guests</SectionTitle>
                {detail ? (
                  <GuestsPanel
                    hostRegistrationId={row.registration_id}
                    guests={detail.guests}
                    maxGuests={event.max_guests}
                    onChange={updateGuests}
                  />
                ) : (
                  <div className="h-10" />
                )}
                <p className="mt-2 text-xs text-ink-3">Guests are saved as contacts and follow this person&apos;s RSVP.</p>
              </section>
            )}

            {/* Script */}
            {event.caller_script && (
              <section className="rounded-2xl ring-1 ring-border">
                <button
                  onClick={() => setScriptOpen((o) => !o)}
                  className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium"
                >
                  Call script
                  <ChevronDown className={cx("size-4 text-ink-3 transition-transform", scriptOpen && "rotate-180")} />
                </button>
                <AnimatePresence initial={false}>
                  {scriptOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="px-4 pb-4 text-sm leading-relaxed whitespace-pre-wrap text-ink-2">{event.caller_script}</div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </section>
            )}

            {/* Notes */}
            <section>
              <SectionTitle>Call notes</SectionTitle>
              <div className="rounded-2xl bg-surface-2/60 p-3 ring-1 ring-border">
                <Textarea
                  ref={noteRef}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submitNote(note);
                  }}
                  placeholder="What happened on the call?"
                  className="min-h-20 bg-surface"
                />
                <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                  {QUICK_NOTES.map((q) => (
                    <button
                      key={q}
                      onClick={() => submitNote(q)}
                      disabled={saving}
                      className="rounded-full bg-surface px-2.5 py-1 text-xs text-ink-2 ring-1 ring-border transition-colors hover:text-ink hover:ring-border-strong"
                    >
                      {q}
                    </button>
                  ))}
                  <Button
                    size="sm"
                    variant="primary"
                    className="ml-auto"
                    loading={saving}
                    disabled={!note.trim()}
                    icon={<Send className="size-3.5" />}
                    onClick={() => submitNote(note)}
                  >
                    Add note
                  </Button>
                </div>
              </div>
              <div className="mt-4">
                {detail ? <NotesList notes={detail.registrationNotes} /> : <div className="h-10" />}
              </div>
            </section>

            {detail ? (
              <>
                <section>
                  <SectionTitle>Track record</SectionTitle>
                  <QuickStats history={detail.history.filter((h) => h.event_id !== event.id)} />
                </section>
                <section>
                  <SectionTitle>Event history</SectionTitle>
                  <HistoryList history={detail.history} currentEventId={event.id} />
                </section>
                {detail.changes.length > 0 && (
                  <section>
                    <SectionTitle>Status changes</SectionTitle>
                    <ul className="space-y-2">
                      {detail.changes.map((c) => (
                        <li key={c.id} className="flex items-center gap-2 text-xs text-ink-2">
                          <span className="size-1.5 shrink-0 rounded-full bg-border-strong" />
                          <span className="font-medium text-ink">{c.author}</span>
                          {c.kind === "rsvp" ? "set RSVP" : "set attendance"}
                          {c.from_value && (
                            <span className="text-ink-3 line-through">
                              {c.kind === "rsvp" ? RSVP[c.from_value as RsvpStatus]?.label : c.from_value}
                            </span>
                          )}
                          →
                          <span className="font-medium text-ink">
                            {c.kind === "rsvp" ? RSVP[c.to_value as RsvpStatus]?.label : c.to_value.replace("_", "-")}
                          </span>
                          <span className="ml-auto shrink-0 text-ink-3">{ago(c.created_at)}</span>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
                <section>
                  <SectionTitle>About</SectionTitle>
                  <AddressBlock detail={detail} />
                </section>
              </>
            ) : (
              <div className="-mx-6">
                <PanelSkeleton />
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      )}
    </Drawer>
  );
}
