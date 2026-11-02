import { getUser } from "@/lib/auth";
import { get } from "@/lib/db";
import { CONTENT_TYPES, SAFE_NAME, serveFile } from "@/lib/storage";

/** Images shown on a shareable event's public page can be fetched without signing in. */
async function isPublicImage(name: string) {
  const ref = `/files/${name}`;
  return !!(await get(
    `SELECT 1 FROM events
      WHERE visibility = 'shareable' AND archived_at IS NULL AND status <> 'draft'
        AND (cover_image = ? OR position(? IN speakers) > 0)
      LIMIT 1`,
    [ref, `"${ref}"`],
  ));
}

export async function GET(_req: Request, ctx: RouteContext<"/files/[name]">) {
  const { name } = await ctx.params;
  const match = SAFE_NAME.exec(name);
  if (!match) return new Response("Not found", { status: 404 });

  const user = await getUser();
  if (!user && !(await isPublicImage(name))) return new Response("Not found", { status: 404 });

  const file = await serveFile(name);
  if (!file) return new Response("Not found", { status: 404 });

  if ("redirect" in file) {
    // Signed URL is valid for an hour; let the browser reuse the redirect for most of that.
    return new Response(null, {
      status: 302,
      headers: { Location: file.redirect, "Cache-Control": "private, max-age=3000" },
    });
  }
  return new Response(new Uint8Array(file.body), {
    headers: {
      "Content-Type": CONTENT_TYPES[match[1]],
      "Cache-Control": "private, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
