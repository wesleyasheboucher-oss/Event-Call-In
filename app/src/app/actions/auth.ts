"use server";

import { redirect } from "next/navigation";
import { get } from "@/lib/db";
import { createSession, destroySession, endOtherSessions, readSessionUser } from "@/lib/auth";
import { hashPassword, verifyPassword } from "@/lib/password";
import { run } from "@/lib/db";
import { normalizePhone } from "@/lib/phone";

export async function login(_prev: { error?: string; identifier?: string } | undefined, form: FormData) {
  // One field: an email if it has an @, otherwise a phone number in any format.
  const identifier = String(form.get("identifier") ?? "").trim();
  const password = String(form.get("password") ?? "");
  const byEmail = identifier.includes("@");
  const key = byEmail ? identifier.toLowerCase() : normalizePhone(identifier);
  const user = key
    ? await get<{ id: number; password_hash: string; active: number }>(
        `SELECT id, password_hash, active FROM users WHERE ${byEmail ? "email" : "phone"} = ?`,
        [key],
      )
    : undefined;
  if (!user || !user.active || !verifyPassword(password, user.password_hash)) {
    return {
      error: `That ${byEmail ? "email" : "phone number"} and password don't match an active account.`,
      identifier,
    };
  }
  await createSession(user.id);
  redirect("/");
}

export type ChangePasswordState = { error?: string; done?: boolean } | undefined;

/** The signed-in user picks their own password (required after an admin sets one). */
export async function changePassword(_prev: ChangePasswordState, form: FormData): Promise<ChangePasswordState> {
  const user = await readSessionUser();
  if (!user) redirect("/login");
  const current = String(form.get("current") ?? "");
  const next = String(form.get("password") ?? "");
  const confirm = String(form.get("confirm") ?? "");

  const row = await get<{ password_hash: string }>("SELECT password_hash FROM users WHERE id = ?", [user.id]);
  if (!row) redirect("/login");
  if (!verifyPassword(current, row.password_hash)) return { error: "Your current password isn't right." };
  if (next.length < 8) return { error: "Choose a password with at least 8 characters." };
  if (next !== confirm) return { error: "The two new passwords don't match." };
  if (verifyPassword(next, row.password_hash)) return { error: "Pick a password that's different from the current one." };

  await run("UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?", [hashPassword(next), user.id]);
  await endOtherSessions(user.id);
  // The form does a full page load to "/": the browser may hold a prefetched copy of "/"
  // from before the change that still points back here.
  return { done: true };
}

export async function logout() {
  await destroySession();
  redirect("/login");
}
