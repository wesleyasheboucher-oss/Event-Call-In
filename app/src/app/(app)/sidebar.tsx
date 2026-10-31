"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";
import {
  BarChart3,
  CalendarDays,
  ClipboardCheck,
  Home,
  LogOut,
  PhoneCall,
  UserCog,
  Users,
} from "lucide-react";
import { logout } from "@/app/actions/auth";
import { Avatar, cx } from "@/components/ui";
import { ROLE_LABEL, type Role } from "@/lib/status";
import type { SessionUser } from "@/lib/auth";

const NAV: { href: string; label: string; icon: typeof Home; roles: Role[] }[] = [
  { href: "/", label: "Home", icon: Home, roles: ["admin", "caller", "signin"] },
  { href: "/events", label: "Events", icon: CalendarDays, roles: ["admin", "caller", "signin"] },
  { href: "/call", label: "Calling", icon: PhoneCall, roles: ["admin", "caller"] },
  { href: "/signin", label: "Sign-in", icon: ClipboardCheck, roles: ["admin", "signin"] },
  { href: "/contacts", label: "Contacts", icon: Users, roles: ["admin"] },
  { href: "/reports", label: "Reports", icon: BarChart3, roles: ["admin"] },
  { href: "/users", label: "Team", icon: UserCog, roles: ["admin"] },
];

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/");
}

export function Sidebar({ user }: { user: SessionUser }) {
  const pathname = usePathname();
  const items = NAV.filter((n) => n.roles.includes(user.role));

  return (
    <>
      {/* Desktop */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-border bg-surface/70 px-4 py-6 backdrop-blur lg:flex">
        <Link href="/" className="mb-8 flex items-center gap-2.5 px-2">
          <span className="flex size-8 items-center justify-center rounded-xl bg-accent text-white shadow-md shadow-indigo-500/25">
            <PhoneCall className="size-4" />
          </span>
          <span className="text-[15px] font-semibold tracking-tight">Call-In</span>
        </Link>
        <nav className="flex flex-1 flex-col gap-0.5">
          {items.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cx(
                  "relative flex h-10 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors",
                  active ? "text-ink" : "text-ink-2 hover:text-ink",
                )}
              >
                {active && (
                  <motion.span
                    layoutId="nav-active"
                    className="absolute inset-0 rounded-xl bg-surface-2 ring-1 ring-border"
                    transition={{ type: "spring", stiffness: 500, damping: 40 }}
                  />
                )}
                <item.icon className={cx("relative size-[18px]", active ? "text-accent" : "text-ink-3")} />
                <span className="relative">{item.label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="flex items-center gap-3 rounded-xl px-2 py-2">
          <Avatar name={user.name} size="md" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">{user.name}</div>
            <div className="text-xs text-ink-3">{ROLE_LABEL[user.role]}</div>
          </div>
          <form action={logout}>
            <button
              className="flex size-8 items-center justify-center rounded-lg text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink"
              title="Sign out"
            >
              <LogOut className="size-4" />
            </button>
          </form>
        </div>
      </aside>

      {/* Tablet / phone */}
      <header className="sticky top-0 z-30 border-b border-border bg-surface/80 backdrop-blur lg:hidden">
        <div className="flex items-center gap-2 px-4 pt-3">
          <span className="flex size-7 items-center justify-center rounded-lg bg-accent text-white">
            <PhoneCall className="size-3.5" />
          </span>
          <span className="flex-1 text-sm font-semibold">Call-In</span>
          <form action={logout}>
            <button className="flex items-center gap-1.5 text-xs text-ink-2">
              <Avatar name={user.name} size="sm" />
              <LogOut className="size-3.5" />
            </button>
          </form>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 py-2">
          {items.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cx(
                  "relative flex h-9 shrink-0 items-center gap-2 rounded-lg px-3 text-[13px] font-medium",
                  active ? "text-ink" : "text-ink-2",
                )}
              >
                {active && (
                  <motion.span layoutId="nav-active-m" className="absolute inset-0 rounded-lg bg-surface-2 ring-1 ring-border" />
                )}
                <item.icon className={cx("relative size-4", active ? "text-accent" : "text-ink-3")} />
                <span className="relative">{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </header>
    </>
  );
}
