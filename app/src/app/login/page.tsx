import Link from "next/link";
import { LoginForm } from "./login-form";
import { PhoneCall } from "lucide-react";

export default function LoginPage() {
  // Demo hints only for the local embedded database (no DATABASE_URL), never on the real site.
  const demo = !process.env.DATABASE_URL;
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60rem_40rem_at_10%_-10%,#e0e7ff_0%,transparent_60%),radial-gradient(50rem_30rem_at_110%_110%,#d1fae5_0%,transparent_55%)]" />
      <div className="relative w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-4 flex size-12 items-center justify-center rounded-2xl bg-accent text-white shadow-lg shadow-indigo-500/25">
            <PhoneCall className="size-5" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Welcome back</h1>
          <p className="mt-1 text-sm text-ink-2">Sign in to work your call lists and events.</p>
        </div>
        <LoginForm defaultEmail={demo ? "admin@example.com" : ""} />
        <p className="mt-6 text-center text-sm text-ink-2">
          Don&apos;t have an account?{" "}
          <Link href="/signup" className="font-medium text-accent hover:underline">
            Request access
          </Link>
        </p>
        {demo && (
          <p className="mt-6 text-center text-xs text-ink-3">
            Demo accounts: admin@example.com or (813) 555-0100 · caller@example.com · signin@example.com — password{" "}
            <span className="font-mono">password</span>
          </p>
        )}
      </div>
    </div>
  );
}
