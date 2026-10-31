"use client";

import { useEffect, useState, useTransition } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { fetchContactDetail, type ContactDetail } from "@/app/actions/registrations";
import { deleteContact, updateContact, type ContactInput } from "@/app/actions/contacts";
import { Drawer, Modal } from "@/components/drawer";
import {
  AddressBlock,
  ContactHeader,
  contactName,
  HistoryList,
  NotesList,
  PanelSkeleton,
  QuickStats,
} from "@/components/contact-panel";
import { Button, SectionTitle } from "@/components/ui";
import { formatPhone } from "@/lib/phone";
import { ContactFields, DuplicateWarning, useDuplicates, validateContact } from "./contact-form";

function toInput(d: ContactDetail): ContactInput {
  const c = d.contact;
  return {
    first_name: c.first_name,
    last_name: c.last_name,
    phone: formatPhone(c.phone),
    email: c.email,
    street: c.street,
    city: c.city,
    state: c.state,
    zip: c.zip,
    notes: c.notes,
  };
}

export function ContactDrawer({
  contactId,
  onClose,
  onOpenContact,
}: {
  contactId: number | null;
  onClose: () => void;
  onOpenContact: (id: number) => void;
}) {
  const [detail, setDetail] = useState<ContactDetail | null>(null);
  const [loadedId, setLoadedId] = useState<number | null>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<ContactInput | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [saving, startSave] = useTransition();
  const [deleting, startDelete] = useTransition();

  useEffect(() => {
    if (contactId == null) return;
    let live = true;
    fetchContactDetail(contactId)
      .then((d) => {
        if (!live) return;
        setDetail(d);
        setLoadedId(contactId);
        setEditing(false);
        setShowErrors(false);
        if (!d) toast.error("That contact no longer exists.");
      })
      .catch(() => live && toast.error("Couldn't load contact."));
    return () => {
      live = false;
    };
  }, [contactId]);

  const ready = detail && loadedId === contactId;
  const errors = form ? validateContact(form, { guest: detail?.contact.source === "guest" }) : {};
  const dupes = useDuplicates(editing && form ? form.phone : "", editing && form ? form.email : "", contactId ?? undefined);

  function startEdit() {
    if (!detail) return;
    setForm(toInput(detail));
    setShowErrors(false);
    setEditing(true);
  }

  function save() {
    if (!form || contactId == null) return;
    if (Object.keys(errors).length) {
      setShowErrors(true);
      return;
    }
    startSave(async () => {
      const res = await updateContact(contactId, form);
      if (!res.ok) {
        setShowErrors(true);
        toast.error("Please fix the highlighted fields.");
        return;
      }
      const fresh = await fetchContactDetail(contactId);
      setDetail(fresh);
      setEditing(false);
      toast.success("Contact saved");
    });
  }

  function remove() {
    if (contactId == null || !detail) return;
    const name = contactName(detail.contact);
    startDelete(async () => {
      await deleteContact(contactId);
      setConfirmDelete(false);
      onClose();
      toast.success(`Deleted ${name}`);
    });
  }

  return (
    <>
      <Drawer
        open={contactId != null}
        onClose={onClose}
        width="lg"
        header={ready ? <ContactHeader detail={detail} /> : <div className="h-12" />}
        footer={
          ready &&
          (editing ? (
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setEditing(false)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={save} loading={saving}>
                Save changes
              </Button>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <Button variant="ghost" size="sm" icon={<Trash2 className="size-3.5" />} className="text-rose-600 hover:bg-rose-50 hover:text-rose-700" onClick={() => setConfirmDelete(true)}>
                Delete
              </Button>
              <Button variant="secondary" icon={<Pencil className="size-3.5" />} onClick={startEdit}>
                Edit details
              </Button>
            </div>
          ))
        }
      >
        {!ready ? (
          <PanelSkeleton />
        ) : (
          <AnimatePresence mode="wait" initial={false}>
            {editing && form ? (
              <motion.div
                key="edit"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2 }}
                className="space-y-5 px-6 py-6"
              >
                <DuplicateWarning matches={dupes} onOpen={onOpenContact} />
                <ContactFields value={form} onChange={setForm} errors={errors} showErrors={showErrors} />
              </motion.div>
            ) : (
              <motion.div
                key="view"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2 }}
                className="space-y-9 px-6 py-6"
              >
                <QuickStats history={detail.history} />
                <section>
                  <SectionTitle
                    action={
                      <button onClick={startEdit} className="text-xs font-medium text-accent hover:underline">
                        Edit
                      </button>
                    }
                  >
                    Details
                  </SectionTitle>
                  <AddressBlock detail={detail} />
                </section>
                <section>
                  <SectionTitle>Event history</SectionTitle>
                  <div className="-mx-3">
                    <HistoryList history={detail.history} />
                  </div>
                </section>
                <section>
                  <SectionTitle>Call notes</SectionTitle>
                  <NotesList notes={detail.notes} showEvent />
                </section>
              </motion.div>
            )}
          </AnimatePresence>
        )}
      </Drawer>

      <Modal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Delete this contact?"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={remove} loading={deleting}>
              Delete contact
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink-2">
          {detail ? <span className="font-medium text-ink">{contactName(detail.contact)}</span> : "This contact"} and their
          event history{detail && detail.history.length ? ` (${detail.history.length} events)` : ""} and call notes will be
          removed permanently.
        </p>
      </Modal>
    </>
  );
}
