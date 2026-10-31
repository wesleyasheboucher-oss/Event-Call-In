"use client";

import { useState, useTransition } from "react";
import { AnimatePresence, motion } from "motion/react";
import { toast } from "sonner";
import { Check, Plus, UserPlus, X } from "lucide-react";
import { addGuest, findGuestMatches, removeGuest } from "@/app/actions/registrations";
import type { Contact, GuestRow } from "@/lib/types";
import { formatPhone } from "@/lib/phone";
import { AttendanceChip } from "./status";
import { Avatar, Button, Field, Input } from "./ui";

const EMPTY = { first_name: "", last_name: "", phone: "", email: "" };

/**
 * Named plus-ones for one person on one event. Each guest is a real contact
 * with their own registration; `door` adds an "Add & check in" option.
 */
export function GuestsPanel({
  hostRegistrationId,
  guests,
  maxGuests,
  door,
  onChange,
}: {
  hostRegistrationId: number;
  guests: GuestRow[];
  /** 0 = no limit */
  maxGuests: number;
  door?: boolean;
  onChange: (guests: GuestRow[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState("");
  const [matches, setMatches] = useState<Contact[]>([]);
  const [pending, start] = useTransition();
  const full = maxGuests > 0 && guests.length >= maxGuests;

  const set = (k: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const checkMatches = async () => {
    if (!form.phone.trim() && !form.email.trim()) return setMatches([]);
    const found = await findGuestMatches(form.phone, form.email);
    setMatches(found.filter((c) => !guests.some((g) => g.contact_id === c.id)));
  };

  const submit = (opts: { contactId?: number; checkIn?: boolean } = {}) =>
    start(async () => {
      setError("");
      const res = await addGuest(hostRegistrationId, { ...form, ...opts });
      if (!res.ok) return setError(res.error);
      onChange(res.guests);
      const added = res.guests[res.guests.length - 1];
      toast.success(`${added.first_name} ${added.last_name} added as a guest${opts.checkIn ? " and checked in" : ""}`);
      setForm(EMPTY);
      setMatches([]);
      setOpen(false);
    });

  const remove = (g: GuestRow) =>
    start(async () => {
      try {
        onChange(await removeGuest(hostRegistrationId, g.registration_id));
      } catch {
        toast.error("Couldn't remove that guest.");
      }
    });

  return (
    <div>
      <ul className="space-y-1.5">
        <AnimatePresence initial={false}>
          {guests.map((g) => (
            <motion.li
              key={g.registration_id}
              layout
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, x: 12 }}
              className="group flex items-center gap-3 rounded-xl bg-surface-2/60 px-3 py-2 ring-1 ring-border"
            >
              <Avatar name={`${g.first_name} ${g.last_name}`} size="sm" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">
                  {g.first_name} {g.last_name}
                </div>
                {(g.phone || g.email) && (
                  <div className="truncate text-xs text-ink-3">{g.phone ? formatPhone(g.phone) : g.email}</div>
                )}
              </div>
              {door && <AttendanceChip status={g.attendance} />}
              <button
                onClick={() => remove(g)}
                disabled={pending}
                className="flex size-7 items-center justify-center rounded-lg text-ink-3 transition-colors hover:bg-surface hover:text-rose-600"
                aria-label={`Remove ${g.first_name} as a guest`}
                title="Remove guest"
              >
                <X className="size-3.5" />
              </button>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>

      {guests.length === 0 && !open && <p className="text-sm text-ink-3">No guests yet.</p>}

      <AnimatePresence initial={false} mode="wait">
        {open ? (
          <motion.div
            key="form"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="mt-3 space-y-3 rounded-2xl p-4 ring-1 ring-border">
              <div className="grid grid-cols-2 gap-3">
                <Field label="First name" required>
                  <Input value={form.first_name} onChange={set("first_name")} autoFocus />
                </Field>
                <Field label="Last name" required>
                  <Input value={form.last_name} onChange={set("last_name")} />
                </Field>
                <Field label="Phone">
                  <Input value={form.phone} onChange={set("phone")} onBlur={checkMatches} inputMode="tel" />
                </Field>
                <Field label="Email">
                  <Input value={form.email} onChange={set("email")} onBlur={checkMatches} type="email" />
                </Field>
              </div>

              <AnimatePresence>
                {matches.length > 0 && (
                  <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-1.5">
                    <p className="text-xs font-medium text-amber-700">Already in contacts:</p>
                    {matches.map((c) => (
                      <div key={c.id} className="flex items-center gap-3 rounded-xl bg-amber-50 px-3 py-2 ring-1 ring-amber-200">
                        <span className="min-w-0 flex-1 truncate text-sm">
                          <span className="font-medium">
                            {c.first_name} {c.last_name}
                          </span>
                          <span className="text-ink-3"> · {c.phone ? formatPhone(c.phone) : c.email}</span>
                        </span>
                        <Button size="sm" variant="secondary" disabled={pending} onClick={() => submit({ contactId: c.id, checkIn: door })}>
                          Use this person
                        </Button>
                      </div>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>

              {error && <p className="text-sm text-rose-600">{error}</p>}

              <div className="flex flex-wrap justify-end gap-2">
                <Button size="sm" variant="ghost" onClick={() => (setOpen(false), setError(""), setMatches([]))}>
                  Cancel
                </Button>
                {door && (
                  <Button size="sm" variant="secondary" loading={pending} onClick={() => submit()}>
                    Add only
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="primary"
                  loading={pending}
                  icon={door ? <Check className="size-3.5" /> : <Plus className="size-3.5" />}
                  onClick={() => submit({ checkIn: door })}
                >
                  {door ? "Add & check in" : "Add guest"}
                </Button>
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div key="btn" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-3 flex items-center justify-between">
            <Button size="sm" variant="soft" icon={<UserPlus className="size-3.5" />} disabled={full} onClick={() => setOpen(true)}>
              Add guest
            </Button>
            {maxGuests > 0 && (
              <span className="text-xs text-ink-3">
                {guests.length} of {maxGuests} allowed
              </span>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
