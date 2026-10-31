"use client";

import { useActionState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { CheckCircle2 } from "lucide-react";
import { signup } from "@/app/actions/auth";
import { Button, Card, Field, Input } from "@/components/ui";

export function SignupForm() {
  const [state, action, pending] = useActionState(signup, undefined);

  if (state?.done) {
    return (
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
        <Card className="p-6 text-center">
          <CheckCircle2 className="mx-auto mb-3 size-10 text-emerald-500" />
          <h2 className="text-lg font-semibold">Request sent</h2>
          <p className="mt-1 text-sm text-ink-2">
            An admin will review it. Once you&apos;re approved, sign in with the email or phone and password you just chose.
          </p>
          <Link
            href="/login"
            className="mt-5 inline-flex h-10 items-center justify-center rounded-xl bg-accent px-4 text-sm font-medium text-white hover:bg-accent-hover"
          >
            Back to sign in
          </Link>
        </Card>
      </motion.div>
    );
  }

  const v = state?.values ?? {};
  return (
    <Card className="p-6">
      <form action={action} className="space-y-4">
        <Field label="Full name">
          <Input name="name" autoComplete="name" required autoFocus defaultValue={v.name} placeholder="First and last name" maxLength={80} />
        </Field>
        <Field label="Email" hint="Email, phone, or both. You can sign in with either.">
          <Input name="email" type="email" autoComplete="email" defaultValue={v.email} placeholder="you@example.com" maxLength={120} />
        </Field>
        <Field label="Phone">
          <Input name="phone" type="tel" inputMode="tel" autoComplete="tel" defaultValue={v.phone} placeholder="(813) 555-1234" maxLength={30} />
        </Field>
        <Field label="Password" hint="At least 8 characters.">
          <Input name="password" type="password" autoComplete="new-password" required minLength={8} />
        </Field>
        <Field label="Password again">
          <Input name="confirm" type="password" autoComplete="new-password" required minLength={8} />
        </Field>
        {/* Spam trap: hidden from people, often filled in by bots */}
        <input name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 opacity-0" />
        <AnimatePresence>
          {state?.error && (
            <motion.p
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="text-sm text-rose-600"
            >
              {state.error}
            </motion.p>
          )}
        </AnimatePresence>
        <Button type="submit" variant="primary" className="w-full" loading={pending}>
          Request access
        </Button>
      </form>
    </Card>
  );
}
