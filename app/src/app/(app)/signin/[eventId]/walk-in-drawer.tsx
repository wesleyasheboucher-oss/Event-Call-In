"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { toast } from "sonner";
import { AlertTriangle, Check, Mail, Phone, UserPlus } from "lucide-react";
import { Drawer } from "@/components/drawer";
import { Avatar, Button, Field, Input } from "@/components/ui";
import { addWalkIn, checkInExistingContact, type WalkInResult } from "@/app/actions/signin";
import { formatPhone } from "@/lib/phone";
import type { SignInRow } from "./data";

type Matches = Extract<WalkInResult, { status: "duplicates" }>["matches"];

const EMPTY = { firstName: "", lastName: "", phone: "", email: "" };

export function WalkInDrawer({
  open,
  eventId,
  initialQuery,
  onClose,
  onAdded,
}: {
  open: boolean;
  eventId: number;
  initialQuery: string;
  onClose: () => void;
  onAdded: (row: SignInRow) => void;
}) {
  return (
    <Drawer
      open={open}
      onClose={onClose}
      width="sm"
      title="Add a walk-in"
      subtitle="Creates a contact, adds them to this event, and checks them in."
    >
      {/* Mounted fresh on every open, so the form starts from the current search. */}
      <WalkInForm eventId={eventId} initialQuery={initialQuery} onAdded={onAdded} />
    </Drawer>
  );
}

/** Prefill from what was typed in search: digits become the phone, words the name. */
function prefill(query: string) {
  const q = query.trim();
  if (q.replace(/\D/g, "").length >= 7) return { ...EMPTY, phone: q };
  if (!q) return EMPTY;
  const [first, ...rest] = q.split(/\s+/);
  return { ...EMPTY, firstName: cap(first), lastName: cap(rest.join(" ")) };
}

function WalkInForm({ eventId, initialQuery, onAdded }: { eventId: number; initialQuery: string; onAdded: (row: SignInRow) => void }) {
  const [form, setForm] = useState(() => prefill(initialQuery));
  const [matches, setMatches] = useState<Matches | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const set = (k: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((f) => ({ ...f, [k]: e.target.value }));
    setMatches(null);
  };

  const done = (res: WalkInResult, label: string) => {
    if (res.status !== "created") return;
    onAdded(res.row);
    toast.success(res.alreadyAttended ? `${label} was already checked in` : `${label} checked in`);
  };

  const submit = async (force = false) => {
    setError(null);
    setBusy(force ? "force" : "submit");
    try {
      const res = await addWalkIn(eventId, form, force);
      if (res.status === "error") setError(res.message);
      else if (res.status === "duplicates") setMatches(res.matches);
      else done(res, `${form.firstName} ${form.lastName}`);
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setBusy(null);
    }
  };

  const pickExisting = async (m: Matches[number]) => {
    setBusy(`use-${m.id}`);
    try {
      done(await checkInExistingContact(eventId, m.id), `${m.first_name} ${m.last_name}`);
    } catch {
      toast.error("Couldn't check in");
    } finally {
      setBusy(null);
    }
  };

  return (
    <form
      className="space-y-5 px-6 py-6"
      onSubmit={(e) => {
        e.preventDefault();
        submit(false);
      }}
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="First name" required>
          <Input value={form.firstName} onChange={set("firstName")} autoFocus className="h-12 text-base" autoComplete="off" />
        </Field>
        <Field label="Last name" required>
          <Input value={form.lastName} onChange={set("lastName")} className="h-12 text-base" autoComplete="off" />
        </Field>
      </div>
      <Field label="Phone" hint="Phone or email is required.">
        <Input value={form.phone} onChange={set("phone")} type="tel" inputMode="tel" className="h-12 text-base" autoComplete="off" />
      </Field>
      <Field label="Email">
        <Input value={form.email} onChange={set("email")} type="email" inputMode="email" className="h-12 text-base" autoComplete="off" />
      </Field>
      <AnimatePresence initial={false}>
        {!matches && (
          <motion.div exit={{ opacity: 0, height: 0 }} className="overflow-hidden pt-1">
            <Button
              type="submit"
              variant="primary"
              size="lg"
              className="w-full"
              loading={busy === "submit"}
              icon={<UserPlus className="size-5" />}
            >
              Add & check in
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {error && (
          <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="text-sm text-rose-600">
            {error}
          </motion.p>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {matches && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="space-y-3 pt-2"
          >
            <div className="flex gap-2.5 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-amber-200">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <span>
                {matches.length === 1 ? "Someone" : `${matches.length} people`} already in the database{" "}
                {matches.length === 1 ? "has" : "have"} this phone or email. Is it them?
              </span>
            </div>
            {matches.map((m, i) => (
              <motion.div
                key={m.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05 * i }}
                className="rounded-2xl bg-surface p-4 ring-1 ring-border"
              >
                <div className="flex items-center gap-3">
                  <Avatar name={`${m.first_name} ${m.last_name}`} />
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold">
                      {m.first_name} {m.last_name}
                    </div>
                    <div className="flex flex-wrap gap-x-3 text-xs text-ink-2">
                      {m.phone && (
                        <span className="inline-flex items-center gap-1">
                          <Phone className="size-3" /> {formatPhone(m.phone)}
                        </span>
                      )}
                      {m.email && (
                        <span className="inline-flex items-center gap-1">
                          <Mail className="size-3" /> {m.email}
                        </span>
                      )}
                    </div>
                    {m.on_list === 1 && (
                      <div className="mt-1 text-xs text-accent">
                        Already on this event&apos;s list{m.attendance === "attended" ? " · checked in" : ""}
                      </div>
                    )}
                  </div>
                </div>
                <Button
                  variant="soft"
                  className="mt-3 w-full"
                  loading={busy === `use-${m.id}`}
                  icon={<Check className="size-4" />}
                  onClick={() => pickExisting(m)}
                >
                  Use this person & check in
                </Button>
              </motion.div>
            ))}
            <Button variant="ghost" className="w-full" loading={busy === "force"} onClick={() => submit(true)}>
              No — create a new contact anyway
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </form>
  );
}

function cap(s: string) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}
