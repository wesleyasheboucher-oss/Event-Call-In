"use server";

import { redirect } from "next/navigation";
import { get, now, run } from "@/lib/db";
import { createSession, destroySession, endOtherSessions, readSessionUser } from "@/lib/auth";
import { hashPassword, verifyPassword } from "@/lib/password";
import { isValidEmail, normalizeEmail, normalizePhone } from "@/lib/phone";

export async function login(_prev: { error?: string; identifier?: string } | undefined, form: FormData) {
  // One field: an email if it has an @, otherwise a phone number in any format.
  const identifier = String(form.get("identifier") ?? "").trim();
  const password = String(form.get("password") ?? "");
  const byEmail = identifier.includes("@");
  const key = byEmail ? identifier.toLowerCase() : normalizePhone(identifier);
  const user = key
    ? await get<{ id: number; password_hash: string; active: number; pending: number }>(
        `SELECT id, password_hash, active, pending FROM users WHERE ${byEmail ? "email" : "phone"} = ?`,
        [key],
      )
    : undefined;
  if (!user || !verifyPassword(password, user.password_hash)) {
    return { error: `That ${byEmail ? "email" : "phone number"} and password don't match an account.`, identifier };
  }
  // Only after the password checks out, so these don't reveal which accounts exist.
  if (user.pending) {
    return { error: "Your account is waiting for approval. You'll be able to sign in once an admin approves it.", identifier };
  }
  if (!user.active) return { error: "This account is locked. Ask an admin to unlock it.", identifier };
  await createSession(user.id);
  redirect("/");
}

export type SignupState = { error?: string; done?: boolean; values?: Record<string, string> } | undefined;

/**
 * Request an account. It's created as pending (can't sign in) until an admin approves it,
 * and starts as a Caller; the admin sets the role, title, and division when approving.
 */
export async function signup(_prev: SignupState, form: FormData): Promise<SignupState> {
  const field = (k: string) => String(form.get(k) ?? "").trim();
  const name = field("name").replace(/\s+/g, " ").slice(0, 80);
  const emailRaw = field("email");
  const phoneRaw = field("phone");
  const password = String(form.get("password") ?? "");
  const confirm = String(form.get("confirm") ?? "");
  const values = { name, email: emailRaw, phone: phoneRaw };

  // Hidden field real people never fill in; bots usually do.
  if (field("website")) return { done: true };

  const email = normalizeEmail(emailRaw);
  const phone = normalizePhone(phoneRaw);
  if (!name || !name.includes(" ")) return { error: "Enter your first and last name.", values };
  if (!email && !phone) return { error: "Add your email, your phone, or both. You'll sign in with either.", values };
  if (email && !isValidEmail(email)) return { error: "That email doesn't look right.", values };
  if (phone && phone.length < 10) return { error: "Enter your full phone number, with area code.", values };
  if (password.length < 8) return { error: "Choose a password with at least 8 characters.", values };
  if (password !== confirm) return { error: "The two passwords don't match.", values };

  if (email && (await get("SELECT id FROM users WHERE email = ?", [email]))) {
    return { error: "There's already an account with that email. Try signing in instead.", values };
  }
  if (phone && (await get("SELECT id FROM users WHERE phone = ?", [phone]))) {
    return { error: "There's already an account with that phone number. Try signing in instead.", values };
  }

  await run(
    `INSERT INTO users (name, email, phone, password_hash, role, title, active, pending, must_change_password, created_at)
     VALUES (?, ?, ?, ?, 'caller', '', 0, 1, 0, ?)`,
    [name, email || null, phone, hashPassword(password), now()],
  );
  return { done: true };
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
