"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { createContact, type ContactInput } from "@/app/actions/contacts";
import { Drawer } from "@/components/drawer";
import { Button } from "@/components/ui";
import { ContactFields, DuplicateWarning, EMPTY_CONTACT, useDuplicates, validateContact } from "./contact-form";

export function AddContactDrawer({
  open,
  onClose,
  onCreated,
  onOpenExisting,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (id: number) => void;
  onOpenExisting: (id: number) => void;
}) {
  const [form, setForm] = useState<ContactInput>(EMPTY_CONTACT);
  const [showErrors, setShowErrors] = useState(false);
  const [pending, start] = useTransition();
  const errors = validateContact(form);
  const dupes = useDuplicates(open ? form.phone : "", open ? form.email : "");

  function reset() {
    setForm(EMPTY_CONTACT);
    setShowErrors(false);
  }

  function submit() {
    if (Object.keys(errors).length) {
      setShowErrors(true);
      return;
    }
    start(async () => {
      const res = await createContact(form);
      if (!res.ok) {
        setShowErrors(true);
        return;
      }
      toast.success(`Added ${form.first_name} ${form.last_name}`);
      reset();
      onCreated(res.id);
    });
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Add contact"
      subtitle="Stored once and reused across every event."
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} loading={pending}>
            {dupes.length ? "Add anyway" : "Add contact"}
          </Button>
        </div>
      }
    >
      <form
        className="space-y-5 px-6 py-6"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <DuplicateWarning
          matches={dupes}
          onOpen={(id) => {
            reset();
            onOpenExisting(id);
          }}
        />
        <ContactFields value={form} onChange={setForm} errors={errors} showErrors={showErrors} />
        <button type="submit" className="hidden" />
      </form>
    </Drawer>
  );
}
