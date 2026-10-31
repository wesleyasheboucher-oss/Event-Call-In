import "server-only";
import { all, get, insert, now, run } from "./db";
import { isTagColor, nextTagColor, type Tag, type TagColor, type TagWithCount } from "./tag-colors";

export async function listTags(): Promise<TagWithCount[]> {
  return all<TagWithCount>(
    `SELECT t.id, t.name, t.color, COUNT(ct.contact_id) AS count
       FROM tags t LEFT JOIN contact_tags ct ON ct.tag_id = t.id
      GROUP BY t.id ORDER BY lower(t.name)`,
  );
}

export async function getContactTags(contactId: number): Promise<Tag[]> {
  return all<Tag>(
    `SELECT t.id, t.name, t.color FROM contact_tags ct JOIN tags t ON t.id = ct.tag_id
      WHERE ct.contact_id = ? ORDER BY lower(t.name)`,
    [contactId],
  );
}

export function cleanTagName(name: string): string {
  return name.replace(/\s+/g, " ").trim().slice(0, 40);
}

/** Returns the tag with this name (case-insensitive), creating it if needed. */
export async function findOrCreateTag(name: string, userId: number): Promise<Tag> {
  const clean = cleanTagName(name);
  if (!clean) throw new Error("Tag name is empty");
  const existing = await get<Tag>("SELECT id, name, color FROM tags WHERE lower(name) = lower(?)", [clean]);
  if (existing) return existing;
  const count = (await get<{ n: number }>("SELECT COUNT(*) AS n FROM tags"))?.n ?? 0;
  const color = nextTagColor(count);
  const id = await insert("INSERT INTO tags (name, color, created_by, created_at) VALUES (?, ?, ?, ?)", [
    clean,
    color,
    userId,
    now(),
  ]);
  return { id, name: clean, color };
}

export async function tagContacts(contactIds: number[], tagId: number, userId: number): Promise<number> {
  let added = 0;
  for (const cid of contactIds) {
    const res = await run(
      "INSERT INTO contact_tags (contact_id, tag_id, added_by, added_at) VALUES (?, ?, ?, ?) ON CONFLICT DO NOTHING",
      [cid, tagId, userId, now()],
    );
    added += res.changes;
  }
  return added;
}

export async function untagContacts(contactIds: number[], tagId: number): Promise<number> {
  if (contactIds.length === 0) return 0;
  const res = await run(
    `DELETE FROM contact_tags WHERE tag_id = ? AND contact_id IN (${contactIds.map(() => "?").join(",")})`,
    [tagId, ...contactIds],
  );
  return res.changes;
}

export async function updateTag(id: number, patch: { name?: string; color?: string }) {
  if (patch.name !== undefined) {
    const clean = cleanTagName(patch.name);
    if (!clean) throw new Error("Tag name is empty");
    const clash = await get("SELECT id FROM tags WHERE lower(name) = lower(?) AND id <> ?", [clean, id]);
    if (clash) throw new Error(`There's already a tag called "${clean}".`);
    await run("UPDATE tags SET name = ? WHERE id = ?", [clean, id]);
  }
  if (patch.color !== undefined) {
    if (!isTagColor(patch.color)) throw new Error("Unknown color");
    await run("UPDATE tags SET color = ? WHERE id = ?", [patch.color as TagColor, id]);
  }
}

export async function deleteTag(id: number) {
  await run("DELETE FROM tags WHERE id = ?", [id]);
}
