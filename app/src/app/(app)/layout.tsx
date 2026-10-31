import { Suspense } from "react";
import { requireUser } from "@/lib/auth";
import { get } from "@/lib/db";
import { Sidebar } from "./sidebar";

async function Shell({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  // Admins see a badge on Team when people are waiting for approval.
  const pending =
    user.role === "admin" ? ((await get<{ n: number }>("SELECT COUNT(*) AS n FROM users WHERE pending = 1"))?.n ?? 0) : 0;
  return (
    <div className="md:pl-[var(--sidebar-w)] transition-[padding] duration-300">
      <Sidebar user={user} pendingRequests={pending} />
      <main className="min-h-screen pb-[var(--bottom-nav)]">{children}</main>
    </div>
  );
}

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <Suspense fallback={<div className="min-h-screen md:pl-[var(--sidebar-w)] transition-[padding] duration-300" />}>
      <Shell>{children}</Shell>
    </Suspense>
  );
}
