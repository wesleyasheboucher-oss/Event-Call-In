"use server";

import { redirect } from "next/navigation";
import { get } from "@/lib/db";
import { createSession, destroySession } from "@/lib/auth";
import { verifyPassword } from "@/lib/password";

export async function login(_prev: { error?: string } | undefined, form: FormData) {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const user = await get<{ id: number; password_hash: string; active: number }>(
    "SELECT id, password_hash, active FROM users WHERE email = ?",
    [email],
  );
  if (!user || !user.active || !verifyPassword(password, user.password_hash)) {
    return { error: "That email and password don't match an active account." };
  }
  await createSession(user.id);
  redirect("/");
}

export async function logout() {
  await destroySession();
  redirect("/login");
}
