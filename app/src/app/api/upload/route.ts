import { randomUUID } from "node:crypto";
import { getUser } from "@/lib/auth";
import { createUploadTarget, sizeLimit, UPLOAD_TYPES } from "@/lib/storage";

const MB = 1024 * 1024;

/**
 * Step 1 of an upload: validate the file's type and size, reserve a name, and
 * hand back where to PUT the bytes. The browser then uploads directly.
 */
export async function POST(request: Request) {
  const user = await getUser();
  if (!user) return Response.json({ error: "Not signed in" }, { status: 401 });

  const { filename, type, size } = (await request.json().catch(() => ({}))) as {
    filename?: string;
    type?: string;
    size?: number;
  };
  const ext = type ? UPLOAD_TYPES[type] : undefined;
  if (!ext) return Response.json({ error: "Only images (JPG, PNG, WebP, GIF) and PDFs are allowed." }, { status: 415 });
  const limit = sizeLimit(type!);
  if (!size || size > limit) {
    return Response.json({ error: `File is too large (max ${limit / MB} MB).` }, { status: 413 });
  }

  const name = `${randomUUID()}.${ext}`;
  try {
    const uploadUrl = await createUploadTarget(name);
    return Response.json({ uploadUrl, url: `/files/${name}`, name: filename ?? name, size });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 502 });
  }
}
