"use server";

import { refresh } from "next/cache";
import { actionUser } from "@/lib/auth";
import { get, run } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import { isValidEmail, normalizeEmail, normalizePhone } from "@/lib/phone";
import { DIVISIONS, ROLES, type Role } from "@/lib/status";

export type UserInput = {
  id?: number;
  name: string;
  email: string;
  role: Role;
  title: string;
  division: number | null;
  /** optional; any format, stored as digits. Lets them sign in by phone. */
  phone: string;
  password?: string;
};
export type UserResult = { ok: true } | { ok: false; error: string };

async function activeAdminCount(excludeId?: number): Promise<number> {
  const row = await get<{ n: number }>("SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND active = 1 AND id <> ?", [
    excludeId ?? -1,
  ]);
  return row!.n;
}

export async function saveUser(input: UserInput): Promise<UserResult> {
  const me = await actionUser(["admin"]);
  const name = input.name.trim();
  const email = normalizeEmail(input.email);
  const password = input.password ?? "";
  if (!name) return { ok: false, error: "Name is required." };
  if (email && !isValidEmail(email)) return { ok: false, error: "Enter a valid email." };
  if (!email && !normalizePhone(input.phone)) return { ok: false, error: "Add an email or a phone. They sign in with either." };
  if (!ROLES.includes(input.role)) return { ok: false, error: "Pick a role." };
  const title = input.title.trim().slice(0, 80);
  if (!title) return { ok: false, error: "Add their position title." };
  const division = Number(input.division);
  if (!(DIVISIONS as readonly number[]).includes(division)) return { ok: false, error: "Pick a division (1–7)." };
  if ((!input.id || password) && password.length < 8) return { ok: false, error: "Password must be at least 8 characters." };

  const clash = email
    ? await get<{ id: number }>("SELECT id FROM users WHERE email = ? AND id <> ?", [email, input.id ?? -1])
    : undefined;
  if (clash) return { ok: false, error: "Someone on the team already uses that email." };
  const phone = normalizePhone(input.phone);
  if (phone && phone.length < 10) return { ok: false, error: "Enter a full phone number, with area code." };
  if (phone) {
    const phoneClash = await get<{ id: number }>("SELECT id FROM users WHERE phone = ? AND id <> ?", [phone, input.id ?? -1]);
    if (phoneClash) return { ok: false, error: "Someone on the team already uses that phone number." };
  }

  if (input.id) {
    const current = await get<{ role: Role; active: number }>("SELECT role, active FROM users WHERE id = ?", [input.id]);
    if (!current) return { ok: false, error: "User not found." };
    if (current.role === "admin" && input.role !== "admin") {
      if (input.id === me.id) return { ok: false, error: "You can't remove your own admin role." };
      if (current.active && (await activeAdminCount(input.id)) === 0) return { ok: false, error: "There must be at least one active admin." };
    }
    await run("UPDATE users SET name = ?, email = ?, phone = ?, role = ?, title = ?, division = ? WHERE id = ?", [
      name,
      email || null,
      phone,
      input.role,
      title,
      division,
      input.id,
    ]);
    if (password) {
      // A password an admin sets for someone else is temporary: they choose their own at next sign-in.
      const temporary = input.id !== me.id;
      await run("UPDATE users SET password_hash = ?, must_change_password = ? WHERE id = ?", [
        hashPassword(password),
        temporary ? 1 : 0,
        input.id,
      ]);
      // Reset signs them out everywhere.
      if (temporary) await run("DELETE FROM sessions WHERE user_id = ?", [input.id]);
    }
  } else {
    // New people start with a temporary password and choose their own at first sign-in.
    await run(
      "INSERT INTO users (name, email, phone, password_hash, role, title, division, must_change_password) VALUES (?, ?, ?, ?, ?, ?, ?, 1)",
      [name, email || null, phone, hashPassword(password), input.role, title, division],
    );
  }
  refresh();
  return { ok: true };
}

/** Approve a sign-up request: set what they do on the team and let them sign in. */
export async function approveUser(
  id: number,
  input: { role: Role; title: string; division: number | null },
): Promise<UserResult> {
  await actionUser(["admin"]);
  if (!ROLES.includes(input.role)) return { ok: false, error: "Pick a role." };
  const title = input.title.trim().slice(0, 80);
  if (!title) return { ok: false, error: "Add their position title." };
  const division = Number(input.division);
  if (!(DIVISIONS as readonly number[]).includes(division)) return { ok: false, error: "Pick a division (1–7)." };
  const res = await run(
    "UPDATE users SET role = ?, title = ?, division = ?, active = 1, pending = 0 WHERE id = ? AND pending = 1",
    [input.role, title, division, id],
  );
  if (!res.changes) return { ok: false, error: "That request was already handled." };
  refresh();
  return { ok: true };
}

/** Decline a sign-up request (removes it; they can request again). */
export async function declineUser(id: number): Promise<UserResult> {
  await actionUser(["admin"]);
  await run("DELETE FROM users WHERE id = ? AND pending = 1", [id]);
  refresh();
  return { ok: true };
}

/** Lock (active = false) or unlock an account. Locking signs them out everywhere. */
export async function setUserActive(id: number, active: boolean): Promise<UserResult> {
  const me = await actionUser(["admin"]);
  if (!active) {
    if (id === me.id) return { ok: false, error: "You can't lock your own account." };
    const u = await get<{ role: Role }>("SELECT role FROM users WHERE id = ?", [id]);
    if (u?.role === "admin" && (await activeAdminCount(id)) === 0) return { ok: false, error: "There must be at least one active admin." };
  }
  await run("UPDATE users SET active = ? WHERE id = ?", [active ? 1 : 0, id]);
  if (!active) await run("DELETE FROM sessions WHERE user_id = ?", [id]);
  refresh();
  return { ok: true };
}
