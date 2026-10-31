import { getUser } from "@/lib/auth";
import { CONTENT_TYPES, SAFE_NAME, serveFile } from "@/lib/storage";

export async function GET(_req: Request, ctx: RouteContext<"/files/[name]">) {
  const user = await getUser();
  if (!user) return new Response("Not found", { status: 404 });

  const { name } = await ctx.params;
  const match = SAFE_NAME.exec(name);
  if (!match) return new Response("Not found", { status: 404 });

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
