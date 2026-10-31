"use server";

import { refresh } from "next/cache";
import { actionUser } from "@/lib/auth";
import { get, run } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import { isValidEmail, normalizeEmail } from "@/lib/phone";
import { DIVISIONS, ROLES, type Role } from "@/lib/status";

export type UserInput = {
  id?: number;
  name: string;
  email: string;
  role: Role;
  title: string;
  division: number | null;
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
  if (!isValidEmail(email)) return { ok: false, error: "Enter a valid email." };
  if (!ROLES.includes(input.role)) return { ok: false, error: "Pick a role." };
  const title = input.title.trim().slice(0, 80);
  if (!title) return { ok: false, error: "Add their position title." };
  const division = Number(input.division);
  if (!(DIVISIONS as readonly number[]).includes(division)) return { ok: false, error: "Pick a division (1–7)." };
  if ((!input.id || password) && password.length < 8) return { ok: false, error: "Password must be at least 8 characters." };

  const clash = await get<{ id: number }>("SELECT id FROM users WHERE email = ? AND id <> ?", [email, input.id ?? -1]);
  if (clash) return { ok: false, error: "Someone on the team already uses that email." };

  if (input.id) {
    const current = await get<{ role: Role; active: number }>("SELECT role, active FROM users WHERE id = ?", [input.id]);
    if (!current) return { ok: false, error: "User not found." };
    if (current.role === "admin" && input.role !== "admin") {
      if (input.id === me.id) return { ok: false, error: "You can't remove your own admin role." };
      if (current.active && (await activeAdminCount(input.id)) === 0) return { ok: false, error: "There must be at least one active admin." };
    }
    await run("UPDATE users SET name = ?, email = ?, role = ?, title = ?, division = ? WHERE id = ?", [
      name,
      email,
      input.role,
      title,
      division,
      input.id,
    ]);
    if (password) {
      await run("UPDATE users SET password_hash = ? WHERE id = ?", [hashPassword(password), input.id]);
      // Reset signs them out everywhere else.
      if (input.id !== me.id) await run("DELETE FROM sessions WHERE user_id = ?", [input.id]);
    }
  } else {
    await run("INSERT INTO users (name, email, password_hash, role, title, division) VALUES (?, ?, ?, ?, ?, ?)", [
      name,
      email,
      hashPassword(password),
      input.role,
      title,
      division,
    ]);
  }
  refresh();
  return { ok: true };
}

export async function setUserActive(id: number, active: boolean): Promise<UserResult> {
  const me = await actionUser(["admin"]);
  if (!active) {
    if (id === me.id) return { ok: false, error: "You can't deactivate yourself." };
    const u = await get<{ role: Role }>("SELECT role FROM users WHERE id = ?", [id]);
    if (u?.role === "admin" && (await activeAdminCount(id)) === 0) return { ok: false, error: "There must be at least one active admin." };
  }
  await run("UPDATE users SET active = ? WHERE id = ?", [active ? 1 : 0, id]);
  if (!active) await run("DELETE FROM sessions WHERE user_id = ?", [id]);
  refresh();
  return { ok: true };
}
