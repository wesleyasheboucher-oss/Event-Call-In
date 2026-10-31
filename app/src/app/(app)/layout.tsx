import { Suspense } from "react";
import { requireUser } from "@/lib/auth";
import { Sidebar } from "./sidebar";

async function Shell({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <div className="md:pl-[72px] lg:pl-64">
      <Sidebar user={user} />
      <main className="min-h-screen pb-[var(--bottom-nav)]">{children}</main>
    </div>
  );
}

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <Suspense fallback={<div className="min-h-screen md:pl-[72px] lg:pl-64" />}>
      <Shell>{children}</Shell>
    </Suspense>
  );
}
