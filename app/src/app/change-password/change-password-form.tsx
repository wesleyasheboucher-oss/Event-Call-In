"use client";

import { useActionState, useEffect } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { changePassword } from "@/app/actions/auth";
import { Button, Card, Field, Input } from "@/components/ui";

export function ChangePasswordForm({ required }: { required: boolean }) {
  const [state, action, pending] = useActionState(changePassword, undefined);
  useEffect(() => {
    if (state?.done) window.location.replace("/");
  }, [state]);
  return (
    <Card className="p-6">
      <form action={action} className="space-y-4">
        <Field label={required ? "Temporary password" : "Current password"}>
          <Input name="current" type="password" autoComplete="current-password" required autoFocus />
        </Field>
        <Field label="New password" hint="At least 8 characters.">
          <Input name="password" type="password" autoComplete="new-password" required minLength={8} />
        </Field>
        <Field label="New password again">
          <Input name="confirm" type="password" autoComplete="new-password" required minLength={8} />
        </Field>
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
        <Button type="submit" variant="primary" className="w-full" loading={pending || state?.done}>
          Save password
        </Button>
        {!required && (
          <Link href="/" className="block text-center text-sm text-ink-2 hover:text-ink">
            Cancel
          </Link>
        )}
      </form>
    </Card>
  );
}
