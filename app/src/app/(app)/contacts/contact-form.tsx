"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { AlertTriangle, ArrowRight } from "lucide-react";
import { checkDuplicates, type ContactInput, type DuplicateMatch } from "@/app/actions/contacts";
import { formatPhone, isValidEmail, normalizePhone } from "@/lib/phone";
import { cx, Field, Input, Textarea } from "@/components/ui";

export const EMPTY_CONTACT: ContactInput = {
  first_name: "",
  last_name: "",
  phone: "",
  email: "",
  street: "",
  city: "",
  state: "",
  zip: "",
  notes: "",
};

/** Guests (someone's plus-one) may have just a name; everyone else needs a phone or email. */
export function validateContact(c: ContactInput, opts: { guest?: boolean } = {}): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!c.first_name.trim()) errors.first_name = "Required";
  if (!c.last_name.trim()) errors.last_name = "Required";
  const phone = normalizePhone(c.phone);
  if (!opts.guest && !phone && !c.email.trim()) errors.phone = "Add a phone or an email";
  if (phone && phone.length < 7) errors.phone = "Phone number looks too short";
  if (c.email.trim() && !isValidEmail(c.email.trim())) errors.email = "That doesn't look like an email";
  return errors;
}

/** Debounced lookup for other contacts sharing this phone or email. */
export function useDuplicates(phone: string, email: string, excludeId?: number) {
  const [matches, setMatches] = useState<DuplicateMatch[]>([]);
  useEffect(() => {
    const p = normalizePhone(phone);
    const e = email.trim();
    if (p.length < 7 && !isValidEmail(e)) {
      const t = setTimeout(() => setMatches([]), 0);
      return () => clearTimeout(t);
    }
    let live = true;
    const t = setTimeout(() => {
      checkDuplicates(p.length >= 7 ? p : "", isValidEmail(e) ? e : "", excludeId)
        .then((m) => live && setMatches(m))
        .catch(() => {});
    }, 350);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [phone, email, excludeId]);
  return matches;
}

export function ContactFields({
  value,
  onChange,
  errors,
  showErrors,
}: {
  value: ContactInput;
  onChange: (v: ContactInput) => void;
  errors: Record<string, string>;
  showErrors: boolean;
}) {
  const set = (k: keyof ContactInput) => (e: { target: { value: string } }) => onChange({ ...value, [k]: e.target.value });
  const err = (k: string) =>
    showErrors && errors[k] ? <span className="text-rose-600">{errors[k]}</span> : undefined;
  const bad = (k: string) => showErrors && errors[k] && "ring-rose-300 focus:ring-rose-500";

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="First name" required hint={err("first_name")}>
          <Input value={value.first_name} onChange={set("first_name")} className={cx(bad("first_name"))} autoFocus />
        </Field>
        <Field label="Last name" required hint={err("last_name")}>
          <Input value={value.last_name} onChange={set("last_name")} className={cx(bad("last_name"))} />
        </Field>
        <Field
          label="Phone"
          hint={
            err("phone") ??
            (normalizePhone(value.phone).length === 10 && value.phone !== formatPhone(normalizePhone(value.phone))
              ? `Saves as ${formatPhone(normalizePhone(value.phone))}`
              : "Phone or email required")
          }
        >
          <Input
            type="tel"
            value={value.phone}
            onChange={set("phone")}
            onBlur={() => {
              const p = normalizePhone(value.phone);
              if (p.length === 10) onChange({ ...value, phone: formatPhone(p) });
            }}
            className={cx(bad("phone"))}
            placeholder="(813) 555-1234"
          />
        </Field>
        <Field label="Email" hint={err("email")}>
          <Input type="email" value={value.email} onChange={set("email")} className={cx(bad("email"))} placeholder="name@example.com" />
        </Field>
      </div>
      <Field label="Street address">
        <Input value={value.street} onChange={set("street")} />
      </Field>
      <div className="grid grid-cols-6 gap-4">
        <Field label="City" className="col-span-6 sm:col-span-3">
          <Input value={value.city} onChange={set("city")} />
        </Field>
        <Field label="State" className="col-span-3 sm:col-span-1">
          <Input value={value.state} onChange={set("state")} maxLength={20} />
        </Field>
        <Field label="ZIP" className="col-span-3 sm:col-span-2">
          <Input value={value.zip} onChange={set("zip")} inputMode="numeric" />
        </Field>
      </div>
      <Field label="Notes">
        <Textarea value={value.notes} onChange={set("notes")} placeholder="Anything callers should know about this person" />
      </Field>
    </div>
  );
}

export function DuplicateWarning({ matches, onOpen }: { matches: DuplicateMatch[]; onOpen?: (id: number) => void }) {
  return (
    <AnimatePresence initial={false}>
      {matches.length > 0 && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          className="overflow-hidden"
        >
          <div className="rounded-xl bg-amber-50 p-4 ring-1 ring-amber-200">
            <div className="flex items-center gap-2 text-sm font-medium text-amber-800">
              <AlertTriangle className="size-4" />
              {matches.length === 1 ? "This looks like an existing contact" : "These look like existing contacts"}
            </div>
            <ul className="mt-2 space-y-1">
              {matches.map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate text-amber-900">
                    <span className="font-medium">{m.name}</span>
                    <span className="text-amber-700">
                      {" "}
                      · same {m.matched === "both" ? "phone & email" : m.matched}
                    </span>
                  </span>
                  {onOpen && (
                    <button
                      type="button"
                      onClick={() => onOpen(m.id)}
                      className="inline-flex shrink-0 items-center gap-1 text-[13px] font-medium text-amber-800 hover:underline"
                    >
                      Open existing <ArrowRight className="size-3.5" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
