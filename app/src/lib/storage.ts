import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Uploaded files (covers, photos, PDFs).
 *
 * - SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY set: a private Supabase Storage bucket.
 *   Browsers upload straight to Storage with a one-time signed URL (no 6 MB
 *   serverless body limit) and files are served through /files/<name>, which
 *   checks the session and redirects to a short-lived signed URL.
 * - Otherwise (local dev): ./storage/uploads on disk.
 */

export const BUCKET = process.env.SUPABASE_STORAGE_BUCKET || "uploads";
const LOCAL_DIR = path.join(process.cwd(), "storage", "uploads");

export const UPLOAD_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "application/pdf": "pdf",
};
export const CONTENT_TYPES: Record<string, string> = Object.fromEntries(
  Object.entries(UPLOAD_TYPES).map(([type, ext]) => [ext, type]),
);
const MB = 1024 * 1024;
export const sizeLimit = (type: string) => (type === "application/pdf" ? 25 * MB : 10 * MB);

/** Generated names only: uuid + known extension. Guards every path we touch. */
export const SAFE_NAME = /^[0-9a-f-]{36}\.(jpg|png|webp|gif|pdf)$/;

let client: SupabaseClient | null = null;
function supabase(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  client ??= createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return client;
}

export const usingSupabaseStorage = () => supabase() !== null;

/** Where the browser should PUT the file bytes. */
export async function createUploadTarget(name: string): Promise<string> {
  const sb = supabase();
  if (!sb) return `/api/upload/${name}`;
  const { data, error } = await sb.storage.from(BUCKET).createSignedUploadUrl(name);
  if (error || !data) throw new Error(error?.message ?? "Couldn't prepare upload");
  return data.signedUrl;
}

/** Local dev only: persist bytes PUT to /api/upload/<name>. */
export async function writeLocal(name: string, bytes: ArrayBuffer) {
  await fs.mkdir(LOCAL_DIR, { recursive: true });
  await fs.writeFile(path.join(LOCAL_DIR, name), Buffer.from(bytes));
}

export type Served = { redirect: string } | { body: Buffer } | null;

export async function serveFile(name: string): Promise<Served> {
  const sb = supabase();
  if (sb) {
    const { data, error } = await sb.storage.from(BUCKET).createSignedUrl(name, 60 * 60);
    return error || !data ? null : { redirect: data.signedUrl };
  }
  try {
    return { body: await fs.readFile(path.join(LOCAL_DIR, name)) };
  } catch {
    return null;
  }
}
