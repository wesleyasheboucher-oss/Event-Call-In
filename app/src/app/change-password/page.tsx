import { Suspense } from "react";
import { redirect } from "next/navigation";
import { KeyRound } from "lucide-react";
import { getUser } from "@/lib/auth";
import { ChangePasswordForm } from "./change-password-form";

async function ChangePassword() {
  const user = await getUser();
  if (!user) redirect("/login");
  const required = user.mustChangePassword;
  return (
    <div className="relative w-full max-w-sm">
      <div className="mb-8 flex flex-col items-center text-center">
        <div className="mb-4 flex size-12 items-center justify-center rounded-2xl bg-accent text-white shadow-lg shadow-indigo-500/25">
          <KeyRound className="size-5" />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">{required ? "Choose your password" : "Change your password"}</h1>
        <p className="mt-1 text-sm text-ink-2">
          {required
            ? `Welcome, ${user.name.split(" ")[0]}. You signed in with a temporary password, so pick one only you know.`
            : "You'll stay signed in here; other devices will be signed out."}
        </p>
      </div>
      <ChangePasswordForm required={required} />
    </div>
  );
}

export default function ChangePasswordPage() {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60rem_40rem_at_10%_-10%,#e0e7ff_0%,transparent_60%),radial-gradient(50rem_30rem_at_110%_110%,#d1fae5_0%,transparent_55%)]" />
      <Suspense fallback={<div className="h-96 w-full max-w-sm" />}>
        <ChangePassword />
      </Suspense>
    </div>
  );
}
