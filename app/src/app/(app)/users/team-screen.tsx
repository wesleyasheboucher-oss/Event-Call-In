"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { toast } from "sonner";
import { ChevronRight, Plus, Power, UserCog } from "lucide-react";
import { Page, PageHeader } from "@/components/page";
import { Drawer } from "@/components/drawer";
import { Avatar, Button, Chip, cx, Field, Input } from "@/components/ui";
import { ROLE_LABEL, ROLES, type Role } from "@/lib/status";
import { fmt } from "@/lib/time";
import type { User } from "@/lib/types";
import { saveUser, setUserActive } from "@/app/actions/users";

const ROLE_CHIP: Record<Role, string> = {
  admin: "bg-indigo-50 text-indigo-700 ring-indigo-200",
  caller: "bg-sky-50 text-sky-700 ring-sky-200",
  signin: "bg-emerald-50 text-emerald-700 ring-emerald-200",
};

const ROLE_HELP: Record<Role, string> = {
  admin: "Everything: contacts, imports, events, reports, and the team.",
  caller: "Works call lists and logs RSVPs and notes.",
  signin: "Checks people in on event day and adds walk-ins.",
};

type Activity = { user_id: number; calls: number; checkins: number };

export function TeamScreen({ users, meId, activity }: { users: User[]; meId: number; activity: Activity[] }) {
  const [editing, setEditing] = useState<User | "new" | null>(null);
  const act = new Map(activity.map((a) => [a.user_id, a]));

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
      <div className="overflow-hidden rounded-2xl bg-surface ring-1 ring-border">
        <ul>
          <AnimatePresence initial={false}>
            {users.map((u, i) => {
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
                      <div className="truncate text-sm text-ink-2">{u.email}</div>
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
                    <Chip className={ROLE_CHIP[u.role]}>{ROLE_LABEL[u.role]}</Chip>
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
    password: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"save" | "active" | null>(null);

  const save = async () => {
    setBusy("save");
    setError(null);
    const res = await saveUser({ id: existing?.id, ...form, password: form.password || undefined });
    setBusy(null);
    if (!res.ok) return setError(res.error);
    toast.success(existing ? "Saved" : `${form.name} added to the team`);
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
        existing ? `Joined ${fmt(existing.created_at, "America/New_York", "MMM d, yyyy")}` : "They'll sign in with this email and password."
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
        <Field label="Email" required>
          <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </Field>
        <div>
          <span className="mb-1.5 block text-[13px] font-medium text-ink-2">Role</span>
          <div className="space-y-2">
            {ROLES.map((r) => {
              const on = form.role === r;
              return (
                <button
                  type="button"
                  key={r}
                  onClick={() => setForm({ ...form, role: r })}
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
          label={existing ? "Reset password" : "Password"}
          required={!existing}
          hint={existing ? "Leave blank to keep their current password. Resetting signs them out." : "At least 8 characters."}
        >
          <Input
            type="password"
            autoComplete="new-password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
        </Field>
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
