"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { toast } from "sonner";
import { Archive, ArchiveRestore, Check, Copy, Pencil, Plus, Search, UserPlus } from "lucide-react";
import { addContacts, applyCallListFilter, archiveEvent, duplicateEvent, searchContacts } from "@/app/actions/events";
import { Drawer, Modal } from "@/components/drawer";
import { Avatar, Button, cx, Input, SectionTitle } from "@/components/ui";
import { CallListBuilder, type PastEventOption } from "@/components/event-form/call-list-builder";
import type { CallListFilter } from "@/components/event-form/types";
import type { ContactSearchRow } from "@/lib/events";
import { formatPhone } from "@/lib/phone";

export function AdminActions({ eventId, archived }: { eventId: number; archived: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirmArchive, setConfirmArchive] = useState(false);

  const duplicate = () =>
    start(async () => {
      const { id } = await duplicateEvent(eventId);
      toast.success("Event duplicated — opening the copy");
      router.push(`/events/${id}/edit`);
    });

  const toggleArchive = () =>
    start(async () => {
      await archiveEvent(eventId, !archived);
      setConfirmArchive(false);
      toast.success(archived ? "Event restored" : "Event archived");
    });

  return (
    <div className="flex items-center gap-2">
      <Link
        href={`/events/${eventId}/edit`}
        className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-surface px-3 text-[13px] font-medium ring-1 ring-border transition-colors hover:bg-surface-2"
      >
        <Pencil className="size-3.5" /> Edit
      </Link>
      <Button size="sm" variant="ghost" icon={<Copy className="size-3.5" />} onClick={duplicate} disabled={pending}>
        Duplicate
      </Button>
      <Button
        size="sm"
        variant="ghost"
        icon={archived ? <ArchiveRestore className="size-3.5" /> : <Archive className="size-3.5" />}
        onClick={() => (archived ? toggleArchive() : setConfirmArchive(true))}
        disabled={pending}
      >
        {archived ? "Unarchive" : "Archive"}
      </Button>
      <Modal
        open={confirmArchive}
        onClose={() => setConfirmArchive(false)}
        title="Archive this event?"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmArchive(false)}>
              Cancel
            </Button>
            <Button variant="primary" loading={pending} onClick={toggleArchive}>
              Archive
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink-2">
          It moves to the Archived tab. Its call list, attendance, and history stay intact, and you can restore it anytime.
        </p>
      </Modal>
    </div>
  );
}

export function AddPeopleButton({
  eventId,
  eventName,
  pastEvents,
}: {
  eventId: number;
  eventName: string;
  pastEvents: PastEventOption[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="ghost" icon={<UserPlus className="size-4" />} onClick={() => setOpen(true)} className="h-11">
        Add people to call list
      </Button>
      <AddPeopleDrawer open={open} onClose={() => setOpen(false)} eventId={eventId} eventName={eventName} pastEvents={pastEvents} />
    </>
  );
}

function AddPeopleDrawer({
  open,
  onClose,
  eventId,
  eventName,
  pastEvents,
}: {
  open: boolean;
  onClose: () => void;
  eventId: number;
  eventName: string;
  pastEvents: PastEventOption[];
}) {
  const [filter, setFilter] = useState<CallListFilter>({ mode: "all", excludeNoShows: false });
  const [pending, start] = useTransition();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<ContactSearchRow[]>([]);
  const [added, setAdded] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (!open) return;
    let live = true;
    const t = setTimeout(() => {
      if (!q.trim()) return setResults([]);
      searchContacts(eventId, q).then((r) => live && setResults(r));
    }, 180);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [q, eventId, open]);

  const applyFilter = () =>
    start(async () => {
      const { added } = await applyCallListFilter(eventId, filter);
      toast.success(added ? `Added ${added} ${added === 1 ? "person" : "people"} to the call list` : "Everyone matching is already on the list");
      onClose();
    });

  const addOne = (c: ContactSearchRow) =>
    start(async () => {
      await addContacts(eventId, [c.id]);
      setAdded((s) => new Set(s).add(c.id));
      toast.success(`${c.first_name} ${c.last_name} added`);
    });

  return (
    <Drawer open={open} onClose={onClose} title="Add people" subtitle={`to the ${eventName} call list`} width="md">
      <div className="space-y-10 p-6">
        <section>
          <SectionTitle>Add a group</SectionTitle>
          <CallListBuilder eventId={eventId} value={filter} onChange={setFilter} pastEvents={pastEvents} allowNone={false} />
          <Button variant="primary" className="mt-4 w-full" loading={pending} onClick={applyFilter} icon={<Plus className="size-4" />}>
            Add to call list
          </Button>
        </section>

        <section>
          <SectionTitle>Or add someone specific</SectionTitle>
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-ink-3" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, phone, or email" className="pl-10" />
          </div>
          <ul className="mt-3 space-y-1">
            <AnimatePresence initial={false}>
              {results.map((c) => {
                const onList = !!c.on_list || added.has(c.id);
                return (
                  <motion.li
                    key={c.id}
                    layout
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-surface-2"
                  >
                    <Avatar name={`${c.first_name} ${c.last_name}`} size="sm" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">
                        {c.first_name} {c.last_name}
                      </div>
                      <div className="truncate text-xs text-ink-3">{[formatPhone(c.phone), c.email].filter(Boolean).join(" · ")}</div>
                    </div>
                    {onList ? (
                      <span className={cx("inline-flex items-center gap-1 text-xs font-medium text-emerald-700")}>
                        <Check className="size-3.5" /> On list
                      </span>
                    ) : (
                      <Button size="sm" variant="soft" onClick={() => addOne(c)} disabled={pending}>
                        Add
                      </Button>
                    )}
                  </motion.li>
                );
              })}
            </AnimatePresence>
            {q.trim() && results.length === 0 && <li className="px-3 py-4 text-sm text-ink-3">No contacts match.</li>}
          </ul>
        </section>
      </div>
    </Drawer>
  );
}
