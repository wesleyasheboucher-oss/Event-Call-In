"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import {
  BarChart3,
  CalendarDays,
  ClipboardCheck,
  Home,
  KeyRound,
  PanelLeftClose,
  PanelLeftOpen,
  LogOut,
  MoreHorizontal,
  PhoneCall,
  MessageSquareText,
  Trophy,
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
  { href: "/call", label: "Call In", icon: PhoneCall, roles: ["admin", "caller"] },
  { href: "/leaderboard", label: "Leaderboard", icon: Trophy, roles: ["admin", "caller", "signin"] },
  { href: "/signin", label: "Sign-in", icon: ClipboardCheck, roles: ["admin", "signin"] },
  { href: "/contacts", label: "Contacts", icon: Users, roles: ["admin"] },
  { href: "/texts", label: "Text templates", icon: MessageSquareText, roles: ["admin"] },
  { href: "/reports", label: "Reports", icon: BarChart3, roles: ["admin"] },
  { href: "/users", label: "Team", icon: UserCog, roles: ["admin"] },
];

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/");
}

export function Sidebar({ user, pendingRequests = 0 }: { user: SessionUser; pendingRequests?: number }) {
  const pathname = usePathname();
  const items = NAV.filter((n) => n.roles.includes(user.role));
  const [sheetOpen, setSheetOpen] = useState(false);

  return (
    <>
      {/* Desktop sidebar: full from 1024px (collapsible to an icon rail), always a rail at 768–1023px. */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[var(--sidebar-w)] flex-col overflow-hidden border-r border-border bg-surface/70 px-3 py-6 backdrop-blur transition-[width] duration-300 md:flex">
        <div className="mb-8 flex items-center gap-2.5 px-1">
          <Link href="/" className="flex min-w-0 flex-1 items-center gap-2.5" title="Home">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-accent text-white shadow-md shadow-indigo-500/25">
              <PhoneCall className="size-4" />
            </span>
            <span className="sb-only truncate text-[15px] font-semibold tracking-tight">Call-In</span>
          </Link>
          <button
            onClick={toggleSidebar}
            className="sb-only flex size-8 shrink-0 items-center justify-center rounded-lg text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink"
            title="Collapse menu"
            aria-label="Collapse menu"
          >
            <PanelLeftClose className="size-4" />
          </button>
        </div>
        {/* Expand control, shown on desktop only while collapsed */}
        <button
          onClick={toggleSidebar}
          className="sb-rail-only mb-3 hidden h-10 items-center justify-center rounded-xl text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink lg:flex"
          title="Expand menu"
          aria-label="Expand menu"
        >
          <PanelLeftOpen className="size-[18px]" />
        </button>
        <nav className="flex flex-1 flex-col gap-0.5">
          {items.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                title={item.label}
                className={cx(
                  "sb-start relative flex h-11 shrink-0 items-center justify-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors lg:h-10",
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
                <span className="sb-only relative whitespace-nowrap">{item.label}</span>
                {item.href === "/users" && pendingRequests > 0 && (
                  <span
                    className="relative ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1.5 text-[11px] font-semibold text-white tabular-nums max-lg:absolute max-lg:top-1 max-lg:right-1 max-lg:ml-0"
                    title={`${pendingRequests} waiting for approval`}
                  >
                    {pendingRequests}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
        <div className="sb-row flex flex-col items-center gap-3 rounded-xl px-1 py-2">
          <Avatar name={user.name} size="md" />
          <div className="sb-only min-w-0 flex-1">
            <div className="truncate text-sm font-medium">{user.name}</div>
            <div className="truncate text-xs text-ink-3">
              {user.title || ROLE_LABEL[user.role]}
              {user.division != null && ` · Div ${user.division}`}
            </div>
          </div>
          <Link
            href="/change-password"
            className="flex size-8 items-center justify-center rounded-lg text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink"
            title="Change password"
            aria-label="Change password"
          >
            <KeyRound className="size-4" />
          </Link>
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

      {/* Tablet / phone: slim header + bottom tab bar */}
      <header className="sticky top-0 z-30 flex h-14 items-center gap-2.5 border-b border-border bg-surface/85 px-4 backdrop-blur md:hidden">
        <span className="flex size-8 items-center justify-center rounded-xl bg-accent text-white shadow-md shadow-indigo-500/25">
          <PhoneCall className="size-4" />
        </span>
        <span className="flex-1 text-[15px] font-semibold tracking-tight">Call-In</span>
        <button onClick={() => setSheetOpen((o) => !o)} className="-mr-1 rounded-full p-1" aria-label="Account and more">
          <Avatar name={user.name} size="sm" />
        </button>
      </header>
      <MobileTabBar
        items={items}
        pathname={pathname}
        user={user}
        moreOpen={sheetOpen}
        setMoreOpen={setSheetOpen}
        pendingRequests={pendingRequests}
      />
    </>
  );
}

/** Desktop: fold the sidebar to icons (or back). Remembered per browser. */
function toggleSidebar() {
  const root = document.documentElement;
  const collapsed = root.dataset.sidebar !== "collapsed";
  if (collapsed) root.dataset.sidebar = "collapsed";
  else delete root.dataset.sidebar;
  try {
    localStorage.setItem("callin.sidebar", collapsed ? "collapsed" : "expanded");
  } catch {}
}

const MAX_TABS = 4;

function MobileTabBar({
  items,
  pathname,
  user,
  pendingRequests,
  moreOpen,
  setMoreOpen,
}: {
  items: typeof NAV;
  pathname: string;
  user: SessionUser;
  pendingRequests: number;
  moreOpen: boolean;
  setMoreOpen: (fn: (o: boolean) => boolean) => void;
}) {
  // Everything fits when there are few items; otherwise the first three plus "More".
  const primary = items.length <= MAX_TABS ? items : items.slice(0, MAX_TABS - 1);
  const overflow = items.length <= MAX_TABS ? [] : items.slice(MAX_TABS - 1);
  const overflowActive = overflow.some((i) => isActive(pathname, i.href));

  const tab = (active: boolean) =>
    cx(
      "relative flex h-16 flex-1 flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors",
      active ? "text-accent" : "text-ink-3 active:text-ink",
    );

  return (
    <>
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-lg md:hidden">
        <div className="mx-auto flex max-w-lg">
          {primary.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link key={item.href} href={item.href} className={tab(active)} onClick={() => setMoreOpen(() => false)}>
                {active && (
                  <motion.span
                    layoutId="tab-active"
                    className="absolute top-0 h-0.5 w-10 rounded-full bg-accent"
                    transition={{ type: "spring", stiffness: 500, damping: 40 }}
                  />
                )}
                <item.icon className="size-[22px]" strokeWidth={active ? 2.2 : 1.8} />
                {item.label}
              </Link>
            );
          })}
          {overflow.length > 0 && (
            <button className={tab(overflowActive || moreOpen)} onClick={() => setMoreOpen((o) => !o)} aria-expanded={moreOpen}>
              {overflowActive && !moreOpen && (
                <motion.span layoutId="tab-active" className="absolute top-0 h-0.5 w-10 rounded-full bg-accent" />
              )}
              <span className="relative">
                <MoreHorizontal className="size-[22px]" />
                {pendingRequests > 0 && <span className="absolute -top-0.5 -right-1 size-2.5 rounded-full bg-accent ring-2 ring-surface" />}
              </span>
              More
            </button>
          )}
        </div>
      </nav>

      <AnimatePresence>
        {moreOpen && (
          <div className="fixed inset-0 z-[35] md:hidden" onClick={() => setMoreOpen(() => false)}>
            <motion.div
              className="absolute inset-0 bg-stone-900/20"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            />
            <motion.div
              onClick={(e) => e.stopPropagation()}
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", stiffness: 420, damping: 40 }}
              className="absolute inset-x-0 bottom-[var(--bottom-nav)] rounded-t-3xl bg-surface px-3 pt-3 pb-3 shadow-[var(--shadow-lift)] ring-1 ring-border"
            >
              <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-border-strong" />
              <div className="flex items-center gap-3 px-3 py-3">
                <Avatar name={user.name} size="md" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">{user.name}</div>
                  <div className="text-xs text-ink-3">
                    {user.title || ROLE_LABEL[user.role]}
                    {user.division != null && ` · Division ${user.division}`}
                  </div>
                </div>
              </div>
              {overflow.map((item) => {
                const active = isActive(pathname, item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMoreOpen(() => false)}
                    className={cx(
                      "flex min-h-13 items-center gap-3.5 rounded-2xl px-4 text-[15px] font-medium",
                      active ? "bg-accent-soft text-accent-ink" : "text-ink active:bg-surface-2",
                    )}
                  >
                    <item.icon className={cx("size-5", active ? "text-accent" : "text-ink-3")} />
                    {item.label}
                    {item.href === "/users" && pendingRequests > 0 && (
                      <span className="ml-auto rounded-full bg-accent px-2 text-xs font-semibold text-white tabular-nums">
                        {pendingRequests}
                      </span>
                    )}
                  </Link>
                );
              })}
              <Link
                href="/change-password"
                onClick={() => setMoreOpen(() => false)}
                className="flex min-h-13 items-center gap-3.5 rounded-2xl px-4 text-[15px] font-medium text-ink-2 active:bg-surface-2"
              >
                <KeyRound className="size-5 text-ink-3" />
                Change password
              </Link>
              <form action={logout}>
                <button className="flex min-h-13 w-full items-center gap-3.5 rounded-2xl px-4 text-[15px] font-medium text-ink-2 active:bg-surface-2">
                  <LogOut className="size-5 text-ink-3" />
                  Sign out
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}

