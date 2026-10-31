import Link from "next/link";
import { UserPlus } from "lucide-react";
import { SignupForm } from "./signup-form";

export default function SignupPage() {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60rem_40rem_at_10%_-10%,#e0e7ff_0%,transparent_60%),radial-gradient(50rem_30rem_at_110%_110%,#d1fae5_0%,transparent_55%)]" />
      <div className="relative w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-4 flex size-12 items-center justify-center rounded-2xl bg-accent text-white shadow-lg shadow-indigo-500/25">
            <UserPlus className="size-5" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Request access</h1>
          <p className="mt-1 text-sm text-ink-2">Create your sign-in. An admin will approve it, then you&apos;re in.</p>
        </div>
        <SignupForm />
        <p className="mt-6 text-center text-sm text-ink-2">
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-accent hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
