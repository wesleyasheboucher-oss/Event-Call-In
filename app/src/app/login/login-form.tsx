"use client";

import { useActionState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { login } from "@/app/actions/auth";
import { Button, Card, Field, Input } from "@/components/ui";

export function LoginForm() {
  const [state, action, pending] = useActionState(login, undefined);
  return (
    <Card className="p-6">
      <form action={action} className="space-y-4">
        <Field label="Email">
          <Input name="email" type="email" autoComplete="email" required autoFocus defaultValue="admin@example.com" />
        </Field>
        <Field label="Password">
          <Input name="password" type="password" autoComplete="current-password" required />
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
        <Button type="submit" variant="primary" className="w-full" loading={pending}>
          Sign in
        </Button>
      </form>
    </Card>
  );
}
