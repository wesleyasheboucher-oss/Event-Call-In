"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { toast } from "sonner";
import { ChevronRight, Copy, KeyRound, Plus, Power, Sparkles, UserCog } from "lucide-react";
import { Page, PageHeader } from "@/components/page";
import { Drawer } from "@/components/drawer";
import { Avatar, Button, Chip, cx, Field, Input } from "@/components/ui";
import { DIVISIONS, ROLE_LABEL, ROLES, type Role } from "@/lib/status";
import { fmt } from "@/lib/time";
import { formatPhone, normalizePhone } from "@/lib/phone";
import type { User } from "@/lib/types";
import { saveUser, setUserActive } from "@/app/actions/users";

/** Easy to read aloud or type: no 0/O, 1/l/I. */
function temporaryPassword(): string {
  const words = "maple river cedar harbor meadow summit canyon willow ember coral prairie lantern".split(" ");
  const pick = () => words[crypto.getRandomValues(new Uint32Array(1))[0] % words.length];
  const n = 20 + (crypto.getRandomValues(new Uint32Array(1))[0] % 80);
  return `${pick()}-${pick()}-${n}`;
}

const ROLE_CHIP: Record<Role, string> = {
  admin: "bg-indigo-50 text-indigo-700 ring-indigo-200",
  caller: "bg-sky-50 text-sky-700 ring-sky-200",
  signin: "bg-emerald-50 text-emerald-700 ring-emerald-200",
};

const ROLE_HELP: Record<Role, string> = {
  admin: "Everything: contacts, imports, events, reports, and the team.",
  caller: "Works call lists and logs registration statuses and notes.",
  signin: "Checks people in on event day and adds walk-ins.",
};

type Activity = { user_id: number; calls: number; checkins: number };

/** "Div 3" badge; one tint for every division keeps it calm and readable. */
export function DivisionBadge({ division, className }: { division: number | null; className?: string }) {
  if (division == null) return null;
  return (
    <span
      className={cx(
        "inline-flex h-6 shrink-0 items-center rounded-md bg-surface-2 px-2 text-[11px] font-semibold text-ink-2 ring-1 ring-border tabular-nums ring-inset",
        className,
      )}
      title={`Division ${division}`}
    >
      Div {division}
    </span>
  );
}

export function TeamScreen({ users, meId, activity }: { users: User[]; meId: number; activity: Activity[] }) {
  const [editing, setEditing] = useState<User | "new" | null>(null);
  const [division, setDivision] = useState<number | "all">("all");
  const act = new Map(activity.map((a) => [a.user_id, a]));
  const counts = new Map<number, number>();
  for (const u of users) if (u.division != null) counts.set(u.division, (counts.get(u.division) ?? 0) + 1);
  const shown = division === "all" ? users : users.filter((u) => u.division === division);

  return (
    <Page>
      <PageHeader
        title="Team"
        description="Everyone who can sign in. Roles decide which screens they see."
        actions={
          <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setEditing("new")}>
            Add person
          </Button>
        }
      />
      <div className="-mx-4 mb-4 flex items-center gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0">
        {(["all", ...DIVISIONS] as const).map((d) => {
          const on = division === d;
          const n = d === "all" ? users.length : (counts.get(d) ?? 0);
          return (
            <button
              key={d}
              onClick={() => setDivision(d)}
              className={cx(
                "relative inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-medium transition-colors md:h-8",
                on ? "text-white" : "text-ink-2 ring-1 ring-border ring-inset hover:text-ink",
                n === 0 && !on && "opacity-50",
              )}
            >
              {on && (
                <motion.span
                  layoutId="division-pill"
                  className="absolute inset-0 rounded-full bg-ink"
                  transition={{ type: "spring", stiffness: 500, damping: 38 }}
                />
              )}
              <span className="relative">{d === "all" ? "Everyone" : `Division ${d}`}</span>
              <span className={cx("relative text-[11px] tabular-nums", on ? "text-white/70" : "text-ink-3")}>{n}</span>
            </button>
          );
        })}
      </div>
      <div className="overflow-hidden rounded-2xl bg-surface ring-1 ring-border">
        {shown.length === 0 && (
          <p className="px-6 py-12 text-center text-sm text-ink-2">No one in Division {division} yet.</p>
        )}
        <ul>
          <AnimatePresence initial={false}>
            {shown.map((u, i) => {
              const a = act.get(u.id);
              return (
                <motion.li
                  key={u.id}
                  layout
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0, transition: { delay: i * 0.03 } }}
                  className="border-b border-border last:border-0"
                >
                  <button
                    onClick={() => setEditing(u)}
                    className={cx(
                      "flex w-full items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-surface-2/60",
                      !u.active && "opacity-55",
                    )}
                  >
                    <Avatar name={u.name} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-medium">{u.name}</span>
                        {u.id === meId && <span className="text-xs text-ink-3">(you)</span>}
                      </div>
                      <div className="truncate text-sm text-ink-2">
                        {u.title ? (
                          <>
                            <span className="text-ink">{u.title}</span>
                            <span className="hidden sm:inline"> · {u.email}</span>
                          </>
                        ) : (
                          u.email
                        )}
                      </div>
                    </div>
                    <div className="hidden text-right text-xs text-ink-3 md:block">
                      {a && (a.calls > 0 || a.checkins > 0) ? (
                        <>
                          {a.calls > 0 && <span>{a.calls} calls</span>}
                          {a.calls > 0 && a.checkins > 0 && " · "}
                          {a.checkins > 0 && <span>{a.checkins} check-ins</span>}
                        </>
                      ) : (
                        "No activity yet"
                      )}
                    </div>
                    {u.must_change_password === 1 && u.active === 1 && (
                      <span
                        className="hidden items-center gap-1 rounded-md bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800 ring-1 ring-amber-200 ring-inset sm:inline-flex"
                        title="Signed in with a temporary password; they'll choose their own at next sign-in"
                      >
                        <KeyRound className="size-3" /> Temporary password
                      </span>
                    )}
                    <DivisionBadge division={u.division} />
                    <Chip className={cx(ROLE_CHIP[u.role], "hidden sm:inline-flex")}>{ROLE_LABEL[u.role]}</Chip>
                    {!u.active && <Chip className="bg-stone-100 text-stone-500 ring-stone-200">Inactive</Chip>}
                    <ChevronRight className="size-4 text-ink-3" />
                  </button>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>
      </div>
      <UserDrawer key={editing === "new" ? "new" : (editing?.id ?? "none")} user={editing} meId={meId} onClose={() => setEditing(null)} />
    </Page>
  );
}

function UserDrawer({ user, meId, onClose }: { user: User | "new" | null; meId: number; onClose: () => void }) {
  const existing = user && user !== "new" ? user : null;
  const [form, setForm] = useState({
    name: existing?.name ?? "",
    email: existing?.email ?? "",
    role: (existing?.role ?? "caller") as Role,
    title: existing?.title ?? "",
    phone: existing?.phone ? formatPhone(existing.phone) : "",
    division: existing?.division ?? null,
    password: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState<"save" | "active" | null>(null);

  const save = async () => {
    setBusy("save");
    setError(null);
    const res = await saveUser({ id: existing?.id, ...form, password: form.password || undefined });
    setBusy(null);
    if (!res.ok) return setError(res.error);
    const temp = form.password && existing?.id !== meId;
    toast.success(existing ? (temp ? `Password reset. ${form.name.split(" ")[0]} will choose a new one at sign-in.` : "Saved") : `${form.name} added to the team`);
    onClose();
  };

  const toggleActive = async () => {
    if (!existing) return;
    setBusy("active");
    const res = await setUserActive(existing.id, !existing.active);
    setBusy(null);
    if (!res.ok) return setError(res.error);
    toast.success(existing.active ? `${existing.name} deactivated` : `${existing.name} reactivated`);
    onClose();
  };

  return (
    <Drawer
      open={user != null}
      onClose={onClose}
      width="sm"
      title={existing ? existing.name : "Add a team member"}
      subtitle={
        existing
          ? `Joined ${fmt(existing.created_at, "America/New_York", "MMM d, yyyy")}`
          : "They'll sign in with their email or phone, and this password."
      }
      footer={
        <div className="flex items-center gap-2">
          {existing && existing.id !== meId && (
            <Button
              variant="ghost"
              loading={busy === "active"}
              icon={<Power className="size-4" />}
              onClick={toggleActive}
              className={existing.active ? "text-rose-600 hover:bg-rose-50 hover:text-rose-700" : ""}
            >
              {existing.active ? "Deactivate" : "Reactivate"}
            </Button>
          )}
          <div className="flex-1" />
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" loading={busy === "save"} onClick={save}>
            {existing ? "Save" : "Add person"}
          </Button>
        </div>
      }
    >
      <form
        className="space-y-5 px-6 py-6"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <Field label="Name" required>
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus />
        </Field>
        <Field label="Email" required hint={existing ? undefined : "This is what they'll sign in with."}>
          <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </Field>
        <Field label="Phone" hint="Optional. They can sign in with this or their email.">
          <Input
            type="tel"
            inputMode="tel"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            onBlur={() => {
              const d = normalizePhone(form.phone);
              if (d.length === 10) setForm((f) => ({ ...f, phone: formatPhone(d) }));
            }}
            placeholder="(813) 555-1234"
          />
        </Field>
        <Field label="Position title" required>
          <Input
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="e.g. Outreach Coordinator"
            maxLength={80}
          />
        </Field>
        <div>
          <span className="mb-1.5 flex items-baseline gap-1 text-[13px] font-medium text-ink-2">
            Division <span className="text-rose-500">*</span>
          </span>
          <div role="radiogroup" aria-label="Division" className="grid grid-cols-7 gap-1.5">
            {DIVISIONS.map((d) => {
              const on = form.division === d;
              return (
                <button
                  key={d}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setForm((f) => ({ ...f, division: d }))}
                  className={cx(
                    "relative flex h-11 items-center justify-center rounded-xl text-[15px] font-semibold tabular-nums ring-1 transition-colors ring-inset",
                    on ? "text-white ring-accent" : "text-ink-2 ring-border hover:bg-surface-2 hover:text-ink",
                  )}
                >
                  {on && (
                    <motion.span
                      layoutId="division-pick"
                      className="absolute inset-0 rounded-xl bg-accent"
                      transition={{ type: "spring", stiffness: 520, damping: 36 }}
                    />
                  )}
                  <span className="relative">{d}</span>
                </button>
              );
            })}
          </div>
        </div>
        <div>
          <span className="mb-1.5 block text-[13px] font-medium text-ink-2">Role</span>
          <div className="space-y-2">
            {ROLES.map((r) => {
              const on = form.role === r;
              return (
                <button
                  type="button"
                  key={r}
                  onClick={() => setForm((f) => ({ ...f, role: r }))}
                  className={cx(
                    "relative flex w-full items-start gap-3 rounded-xl px-4 py-3 text-left ring-1 transition-colors",
                    on ? "bg-accent-soft/60 ring-accent" : "ring-border hover:bg-surface-2",
                  )}
                >
                  <span
                    className={cx(
                      "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full ring-1",
                      on ? "ring-accent" : "ring-border-strong",
                    )}
                  >
                    {on && <motion.span layoutId="role-dot" className="size-2 rounded-full bg-accent" />}
                  </span>
                  <span>
                    <span className="block text-sm font-medium">{ROLE_LABEL[r]}</span>
                    <span className="block text-xs text-ink-2">{ROLE_HELP[r]}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
        <Field
          label={existing ? (existing.id === meId ? "Change your password" : "Reset password") : "Temporary password"}
          required={!existing}
          hint={
            existing?.id === meId
              ? "Leave blank to keep your current password."
              : existing
                ? "Leave blank to keep their password. A reset signs them out, and they'll choose a new one at next sign-in."
                : "At least 8 characters. They'll choose their own the first time they sign in."
          }
        >
          <div className="flex gap-2">
            <Input
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              value={form.password}
              onChange={(e) => {
                setShowPassword(false);
                setForm({ ...form, password: e.target.value });
              }}
              className={cx(showPassword && "font-mono tracking-wide")}
            />
            {existing?.id !== meId && (
              <Button
                type="button"
                variant="secondary"
                icon={<Sparkles className="size-4" />}
                onClick={() => {
                  setForm((f) => ({ ...f, password: temporaryPassword() }));
                  setShowPassword(true);
                }}
              >
                Generate
              </Button>
            )}
          </div>
        </Field>
        <AnimatePresence>
          {showPassword && form.password && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="flex items-center gap-3 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">
                <span className="min-w-0 flex-1">
                  Share this with {form.name.split(" ")[0] || "them"} privately. They&apos;ll replace it at sign-in.
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  icon={<Copy className="size-3.5" />}
                  onClick={() => {
                    navigator.clipboard?.writeText(form.password);
                    toast.success("Temporary password copied");
                  }}
                >
                  Copy
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        <button type="submit" className="hidden" />
        <AnimatePresence>
          {error && (
            <motion.p
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="text-sm text-rose-600"
            >
              {error}
            </motion.p>
          )}
        </AnimatePresence>
        {existing?.id === meId && (
          <p className="flex items-center gap-2 text-xs text-ink-3">
            <UserCog className="size-3.5" /> This is you. You can&apos;t deactivate yourself or drop your admin role.
          </p>
        )}
      </form>
    </Drawer>
  );
}
