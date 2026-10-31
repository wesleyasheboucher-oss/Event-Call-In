import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { randomBytes } from "node:crypto";
import { get, run } from "./db";
import type { Role } from "./status";

export const SESSION_COOKIE = "callin_session";
const SESSION_DAYS = 14;

export type SessionUser = {
  id: number;
  name: string;
  email: string;
  role: Role;
  title: string;
  division: number | null;
  /** Their password was set by an admin; they must choose their own before using the app. */
  mustChangePassword: boolean;
};

export async function createSession(userId: number) {
  const token = randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + SESSION_DAYS * 864e5);
  await run("INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)", [token, userId, expires.toISOString()]);
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires,
  });
}

/** Sign the user out everywhere except this browser (after a password change). */
export async function endOtherSessions(userId: number) {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value ?? "";
  await run("DELETE FROM sessions WHERE user_id = ? AND token <> ?", [userId, token]);
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await run("DELETE FROM sessions WHERE token = ?", [token]);
  jar.delete(SESSION_COOKIE);
}

/** Uncached session lookup; use getUser() everywhere except right before changing the user's own row. */
export async function readSessionUser(): Promise<SessionUser | null> {
  await connection();
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const row = await get<Omit<SessionUser, "mustChangePassword"> & { expires_at: string; must_change_password: number }>(
    `SELECT u.id, u.name, u.email, u.role, u.title, u.division, u.must_change_password, s.expires_at
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token = ? AND u.active = 1`,
    [token],
  );
  if (!row || row.expires_at < new Date().toISOString()) return null;
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    title: row.title,
    division: row.division,
    mustChangePassword: row.must_change_password === 1,
  };
}

/** The signed-in user, looked up once per request. */
export const getUser = cache(readSessionUser);

/** For pages: redirects to /login (or home) when the user can't see this screen. */
export async function requireUser(roles?: Role[]): Promise<SessionUser> {
  const user = await getUser();
  if (!user) redirect("/login");
  if (user.mustChangePassword) redirect("/change-password");
  if (roles && user.role !== "admin" && !roles.includes(user.role)) redirect("/");
  return user;
}

/** For server actions: throws instead of redirecting. */
export async function actionUser(roles?: Role[]): Promise<SessionUser> {
  const user = await getUser();
  if (!user) throw new Error("Not signed in");
  if (user.mustChangePassword) throw new Error("Choose a new password first");
  if (roles && user.role !== "admin" && !roles.includes(user.role)) throw new Error("Not allowed");
  return user;
}
