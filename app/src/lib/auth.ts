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

export type SessionUser = { id: number; name: string; email: string; role: Role; title: string; division: number | null };

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

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await run("DELETE FROM sessions WHERE token = ?", [token]);
  jar.delete(SESSION_COOKIE);
}

export const getUser = cache(async (): Promise<SessionUser | null> => {
  await connection();
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const row = await get<SessionUser & { expires_at: string }>(
    `SELECT u.id, u.name, u.email, u.role, u.title, u.division, s.expires_at
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token = ? AND u.active = 1`,
    [token],
  );
  if (!row || row.expires_at < new Date().toISOString()) return null;
  return { id: row.id, name: row.name, email: row.email, role: row.role, title: row.title, division: row.division };
});

/** For pages: redirects to /login (or home) when the user can't see this screen. */
export async function requireUser(roles?: Role[]): Promise<SessionUser> {
  const user = await getUser();
  if (!user) redirect("/login");
  if (roles && user.role !== "admin" && !roles.includes(user.role)) redirect("/");
  return user;
}

/** For server actions: throws instead of redirecting. */
export async function actionUser(roles?: Role[]): Promise<SessionUser> {
  const user = await getUser();
  if (!user) throw new Error("Not signed in");
  if (roles && user.role !== "admin" && !roles.includes(user.role)) throw new Error("Not allowed");
  return user;
}
