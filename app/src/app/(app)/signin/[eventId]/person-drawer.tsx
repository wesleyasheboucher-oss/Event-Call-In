"use client";

import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { toast } from "sonner";
import { Check, RotateCcw, Send, UserPlus, UserX } from "lucide-react";
import { Drawer } from "@/components/drawer";
import { addCallNote, fetchRegistrationDetail, type RegistrationDetail } from "@/app/actions/registrations";
import { GuestsPanel } from "@/components/guests-panel";
import { ContactTagsEditor } from "@/components/tags";
import { AddressBlock, ContactHeader, HistoryList, NotesList, PanelSkeleton, QuickStats, SectionTitle } from "@/components/contact-panel";
import { AttendanceChip, RsvpChip } from "@/components/status";
import { Button, Chip, Textarea } from "@/components/ui";
import type { GuestRow } from "@/lib/types";
import type { AttendanceStatus } from "@/lib/status";
import type { SignInRow } from "./data";
import type { SignInEvent } from "./sign-in-screen";

export function PersonDrawer({
  row,
  event,
  onClose,
  onMark,
  onGuestsChanged,
}: {
  row: SignInRow | null;
  event: SignInEvent;
  onClose: () => void;
  onMark: (row: SignInRow, to: AttendanceStatus) => void;
  /** Guests were added/removed for this host; the screen refreshes their rows. */
  onGuestsChanged: (hostRegistrationId: number) => void;
}) {
  const [loaded, setLoaded] = useState<{ id: number; detail: RegistrationDetail | null } | null>(null);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const regId = row?.registration_id ?? null;
  const detail = loaded && loaded.id === regId ? loaded.detail : null;
  const setDetail = (fn: (d: RegistrationDetail | null) => RegistrationDetail | null) =>
    setLoaded((l) => (l ? { ...l, detail: fn(l.detail) } : l));

  useEffect(() => {
    if (regId == null) return;
    let live = true;
    fetchRegistrationDetail(regId).then((d) => live && setLoaded({ id: regId, detail: d }));
    return () => {
      live = false;
    };
  }, [regId]);

  const updateGuests = (guests: GuestRow[]) => {
    if (!row) return;
    setDetail((d) => (d ? { ...d, guests } : d));
    onGuestsChanged(row.registration_id);
  };

  const saveNote = async () => {
    if (!row || !note.trim()) return;
    setSaving(true);
    try {
      const { note: n } = await addCallNote(row.registration_id, note);
      setDetail((d) => (d ? { ...d, registrationNotes: [n, ...d.registrationNotes] } : d));
      setNote("");
    } catch {
      toast.error("Couldn't save note");
    } finally {
      setSaving(false);
    }
  };

  const checked = row?.attendance === "attended";

  return (
    <Drawer
      open={row != null}
      onClose={onClose}
      header={detail ? <ContactHeader detail={detail} /> : <div className="h-12" />}
      footer={
        row && (
          <div className="flex items-center gap-2">
            {checked ? (
              <Button
                variant="secondary"
                size="lg"
                className="flex-1"
                icon={<RotateCcw className="size-4" />}
                onClick={() => onMark(row, "pending")}
              >
                Undo check-in
              </Button>
            ) : (
              <Button
                size="lg"
                className="flex-1 bg-emerald-600 text-white hover:bg-emerald-700"
                icon={<Check className="size-5" />}
                onClick={() => onMark(row, "attended")}
              >
                Check in
              </Button>
            )}
            {row.attendance !== "no_show" && !checked && (
              <Button variant="ghost" size="lg" icon={<UserX className="size-4" />} onClick={() => onMark(row, "no_show")}>
                No-Show
              </Button>
            )}
          </div>
        )
      }
    >
      {!detail || !row ? (
        <PanelSkeleton />
      ) : (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8 px-6 py-6">
          <div className="flex flex-wrap items-center gap-2">
            {row.walk_in ? null : <RsvpChip status={row.rsvp} />}
            <AttendanceChip status={row.attendance} />
          </div>

          <ContactTagsEditor
            contactId={detail.contact.id}
            tags={detail.tags}
            onChange={(tags) => setDetail((d) => (d ? { ...d, tags } : d))}
          />

          {detail.guestOf ? (
            <p className="flex items-center gap-2 text-sm text-ink-2">
              <Chip className="bg-violet-50 text-violet-700 ring-violet-200">
                <UserPlus className="size-3" /> Guest
              </Chip>
              Came with <span className="font-medium text-ink">{detail.guestOf.name}</span>
            </p>
          ) : (
            event.plus_ones_allowed > 0 && (
              <section>
                <SectionTitle>Guests</SectionTitle>
                <GuestsPanel
                  hostRegistrationId={row.registration_id}
                  guests={detail.guests}
                  maxGuests={event.max_guests}
                  door
                  onChange={updateGuests}
                />
              </section>
            )
          )}

          <section>
            <SectionTitle>History</SectionTitle>
            <QuickStats history={detail.history.filter((h) => h.event_id !== event.id)} />
            <div className="mt-4 -mx-3">
              <HistoryList history={detail.history} currentEventId={event.id} />
            </div>
          </section>

          <section>
            <SectionTitle>Notes for this event</SectionTitle>
            <div className="mb-4 flex gap-2">
              <Textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Add a note (e.g. needs a receipt)…"
                className="min-h-11"
                rows={1}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) saveNote();
                }}
              />
              <Button
                variant="soft"
                className="h-11 shrink-0"
                loading={saving}
                icon={<Send className="size-4" />}
                onClick={saveNote}
                disabled={!note.trim()}
              >
                Add
              </Button>
            </div>
            <NotesList notes={detail.registrationNotes} />
          </section>

          <section>
            <SectionTitle>Details</SectionTitle>
            <AddressBlock detail={detail} />
          </section>
        </motion.div>
      )}
    </Drawer>
  );
}
