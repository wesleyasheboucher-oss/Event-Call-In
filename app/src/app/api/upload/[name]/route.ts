import { getUser } from "@/lib/auth";
import { CONTENT_TYPES, SAFE_NAME, sizeLimit, usingSupabaseStorage, writeLocal } from "@/lib/storage";

/** Step 2 of an upload, local dev only. With Supabase, the browser PUTs to Storage instead. */
export async function PUT(request: Request, ctx: RouteContext<"/api/upload/[name]">) {
  if (usingSupabaseStorage()) return new Response("Not found", { status: 404 });
  const user = await getUser();
  if (!user) return new Response("Not signed in", { status: 401 });

  const { name } = await ctx.params;
  const match = SAFE_NAME.exec(name);
  if (!match) return new Response("Bad name", { status: 400 });

  const bytes = await request.arrayBuffer();
  if (bytes.byteLength > sizeLimit(CONTENT_TYPES[match[1]])) return new Response("Too large", { status: 413 });
  await writeLocal(name, bytes);
  return new Response(null, { status: 204 });
}
