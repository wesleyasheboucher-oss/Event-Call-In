"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { AnimatePresence, motion } from "motion/react";
import { toast } from "sonner";
import { ChevronDown, ChevronLeft, ChevronRight, Phone, Plus, Send, UserPlus } from "lucide-react";
import type { CallInCell, CallInEvent, CallInRow } from "@/lib/call-in";
import type { GuestRow } from "@/lib/types";
import type { RsvpStatus } from "@/lib/status";
import { formatPhone, telHref } from "@/lib/phone";
import { ago, fmt } from "@/lib/time";
import { addCallNote, fetchContactDetail, type ContactDetail } from "@/app/actions/registrations";
import { fetchGuests } from "@/app/actions/call-in";
import { Drawer } from "@/components/drawer";
import { GuestsPanel } from "@/components/guests-panel";
import { RsvpPicker } from "@/components/status";
import { ContactTagsEditor } from "@/components/tags";
import { Button, cx, SectionTitle, Textarea } from "@/components/ui";
import { AddressBlock, ContactHeader, HistoryList, NotesList, PanelSkeleton, QuickStats } from "@/components/contact-panel";

const QUICK_NOTES = ["Left voicemail", "No answer", "Call back later", "Wrong number"];

export function CallInDrawer({
  row,
  events,
  onClose,
  onStatus,
  onPatchCell,
  hasPrev,
  hasNext,
  onPrev,
  onNext,
}: {
  row: CallInRow | null;
  events: CallInEvent[];
  onClose: () => void;
  onStatus: (eventId: number, s: RsvpStatus) => void;
  onPatchCell: (eventId: number, p: Partial<CallInCell>) => void;
  hasPrev: boolean;
  hasNext: boolean;
  onPrev: () => void;
  onNext: () => void;
}) {
  const id = row?.contact_id;
  const [cache, setCache] = useState<Record<number, ContactDetail>>({});
  const detail = id ? cache[id] : undefined;
  const [note, setNote] = useState("");
  const [noteEvent, setNoteEvent] = useState<number | null>(null);
  const [saving, startSaving] = useTransition();
  const noteRef = useRef<HTMLTextAreaElement>(null);

  // Reset per-person state when moving between people.
  const [shownFor, setShownFor] = useState(id);
  if (shownFor !== id) {
    setShownFor(id);
    setNote("");
    setNoteEvent(null);
  }

  useEffect(() => {
    if (!id) return;
    let live = true;
    fetchContactDetail(id).then((d) => live && d && setCache((c) => ({ ...c, [id]: d })));
    return () => {
      live = false;
    };
  }, [id]);

  // J/K or arrows move between people (when not typing).
  useEffect(() => {
    if (!row) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (["TEXTAREA", "INPUT", "SELECT"].includes(t.tagName) || e.metaKey || e.ctrlKey) return;
      if ((e.key === "j" || e.key === "ArrowDown") && hasNext) onNext();
      else if ((e.key === "k" || e.key === "ArrowUp") && hasPrev) onPrev();
      else if (e.key === "n") noteRef.current?.focus();
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [row, hasNext, hasPrev, onNext, onPrev]);

  const registered = row ? events.filter((e) => row.cells[e.id]) : [];
  const targetEvent = registered.find((e) => e.id === noteEvent) ?? registered[0];

  const submitNote = (text: string) => {
    if (!row || !targetEvent || !text.trim()) return;
    const cell = row.cells[targetEvent.id];
    startSaving(async () => {
      try {
        const { note: n } = await addCallNote(cell.registration_id, text);
        setCache((c) =>
          c[row.contact_id]
            ? { ...c, [row.contact_id]: { ...c[row.contact_id], notes: [{ ...n, event_name: targetEvent.name }, ...c[row.contact_id].notes] } }
            : c,
        );
        onPatchCell(targetEvent.id, { note_count: cell.note_count + 1, last_called_at: n.created_at });
        setNote("");
      } catch {
        toast.error("Couldn't save the note.");
      }
    });
  };

  const selectedIds = new Set(events.map((e) => e.id));
  const scripts = events.filter((e) => e.caller_script);

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
            <kbd className="font-mono">J/K</kbd> move · <kbd className="font-mono">N</kbd> note
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
            key={row.contact_id}
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -12 }}
            transition={{ duration: 0.18 }}
            className="space-y-8 px-5 py-6 sm:px-6"
          >
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

            {detail ? (
              <ContactTagsEditor
                contactId={row.contact_id}
                tags={detail.tags}
                onChange={(tags) => setCache((c) => ({ ...c, [row.contact_id]: { ...c[row.contact_id], tags } }))}
              />
            ) : (
              <div className="h-7" />
            )}

            {/* One card per event being worked */}
            <section>
              <SectionTitle>Registration status</SectionTitle>
              <div className="space-y-3">
                {events.map((e) => (
                  <EventStatusCard
                    key={e.id}
                    event={e}
                    cell={row.cells[e.id]}
                    onStatus={(s) => onStatus(e.id, s)}
                    onGuestsChanged={(n) => onPatchCell(e.id, { guest_count: n })}
                  />
                ))}
              </div>
            </section>

            {/* Notes */}
            <section>
              <SectionTitle>Call notes</SectionTitle>
              {registered.length === 0 ? (
                <p className="text-sm text-ink-3">Add them to an event above to log notes for it.</p>
              ) : (
                <div className="rounded-2xl bg-surface-2/60 p-3 ring-1 ring-border">
                  {registered.length > 1 && (
                    <div className="mb-2.5 flex flex-wrap items-center gap-1.5">
                      <span className="text-xs text-ink-3">For</span>
                      {registered.map((e) => (
                        <button
                          key={e.id}
                          onClick={() => setNoteEvent(e.id)}
                          className={cx(
                            "h-7 max-w-[180px] truncate rounded-full px-2.5 text-xs font-medium ring-1 transition-colors ring-inset",
                            targetEvent?.id === e.id ? "bg-ink text-white ring-ink" : "bg-surface text-ink-2 ring-border",
                          )}
                        >
                          {e.name}
                        </button>
                      ))}
                    </div>
                  )}
                  <Textarea
                    ref={noteRef}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && (e.metaKey || e.ctrlKey) && submitNote(note)}
                    placeholder={`What happened on the call?${registered.length > 1 ? "" : ` (${registered[0].name})`}`}
                    className="min-h-20 bg-surface text-base sm:text-sm"
                  />
                  <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                    {QUICK_NOTES.map((qn) => (
                      <button
                        key={qn}
                        onClick={() => submitNote(qn)}
                        disabled={saving}
                        className="h-8 rounded-full bg-surface px-3 text-xs text-ink-2 ring-1 ring-border transition-colors hover:text-ink"
                      >
                        {qn}
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
              )}
              <div className="mt-4">
                {detail ? (
                  <NotesList notes={detail.notes.filter((n) => events.some((e) => e.name === n.event_name))} showEvent />
                ) : (
                  <div className="h-10" />
                )}
              </div>
            </section>

            {scripts.length > 0 && <Scripts events={scripts} />}

            {detail ? (
              <>
                <section>
                  <SectionTitle>Track record</SectionTitle>
                  <QuickStats history={detail.history.filter((h) => !selectedIds.has(h.event_id))} />
                </section>
                <section>
                  <SectionTitle>Event history</SectionTitle>
                  <div className="-mx-3">
                    <HistoryList history={detail.history} />
                  </div>
                </section>
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

function EventStatusCard({
  event: e,
  cell,
  onStatus,
  onGuestsChanged,
}: {
  event: CallInEvent;
  cell: CallInCell | undefined;
  onStatus: (s: RsvpStatus) => void;
  onGuestsChanged: (n: number) => void;
}) {
  const [guestsOpen, setGuestsOpen] = useState(false);
  const [guests, setGuests] = useState<GuestRow[] | null>(null);

  const openGuests = () => {
    setGuestsOpen((o) => !o);
    if (!guests && cell) fetchGuests(cell.registration_id).then(setGuests);
  };

  return (
    <div className="rounded-2xl p-4 ring-1 ring-border">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{e.name}</div>
          <div className="text-xs text-ink-3">{fmt(e.start_at, e.time_zone, "EEE, MMM d · h:mm a")}</div>
        </div>
        {cell?.last_called_at && (
          <span className="shrink-0 text-right text-[11px] text-ink-3">
            Called {ago(cell.last_called_at)}
            {cell.called_by_name && <span className="block">by {cell.called_by_name}</span>}
          </span>
        )}
      </div>

      {!cell ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-ink-2">Not on this list yet.</span>
          <Button size="sm" variant="soft" icon={<Plus className="size-3.5" />} onClick={() => onStatus("no_data")}>
            Add to list
          </Button>
        </div>
      ) : cell.guest_of_name ? (
        <p className="flex items-center gap-2 text-sm text-ink-2">
          <UserPlus className="size-4 text-violet-600" />
          Coming as <span className="font-medium text-ink">{cell.guest_of_name}</span>&apos;s guest. Their status follows the host.
        </p>
      ) : (
        <>
          {/* Phones: 3 + 2 grid with full-size tap targets; wider: one row */}
          <RsvpPicker
            value={cell.status}
            onChange={onStatus}
            size="sm"
            className="grid w-full grid-cols-3 gap-0.5 sm:flex [&>button]:min-h-10 sm:[&>button]:min-h-0 sm:[&>button]:flex-1"
          />
          {e.plus_ones_allowed > 0 && (
            <div className="mt-3">
              <button onClick={openGuests} className="flex items-center gap-1.5 text-xs font-medium text-ink-2 hover:text-ink">
                <UserPlus className="size-3.5" />
                Guests{cell.guest_count > 0 && ` (${cell.guest_count})`}
                <ChevronDown className={cx("size-3.5 transition-transform", guestsOpen && "rotate-180")} />
              </button>
              <AnimatePresence initial={false}>
                {guestsOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="pt-3">
                      {guests ? (
                        <GuestsPanel
                          hostRegistrationId={cell.registration_id}
                          guests={guests}
                          maxGuests={e.max_guests}
                          onChange={(g) => {
                            setGuests(g);
                            onGuestsChanged(g.length);
                          }}
                        />
                      ) : (
                        <p className="text-sm text-ink-3">Loading guests…</p>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Scripts({ events }: { events: CallInEvent[] }) {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <section>
      <SectionTitle>Call scripts</SectionTitle>
      <div className="space-y-2">
        {events.map((e) => (
          <div key={e.id} className="rounded-2xl ring-1 ring-border">
            <button
              onClick={() => setOpen((o) => (o === e.id ? null : e.id))}
              className="flex min-h-11 w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-sm font-medium"
            >
              <span className="truncate">{e.name}</span>
              <ChevronDown className={cx("size-4 shrink-0 text-ink-3 transition-transform", open === e.id && "rotate-180")} />
            </button>
            <AnimatePresence initial={false}>
              {open === e.id && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <div className="px-4 pb-4 text-sm leading-relaxed whitespace-pre-wrap text-ink-2">{e.caller_script}</div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ))}
      </div>
    </section>
  );
}

