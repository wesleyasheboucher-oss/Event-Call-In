"use server";

import { refresh } from "next/cache";
import { actionUser } from "@/lib/auth";
import { tx } from "@/lib/db";
import {
  deleteTag as removeTag,
  findOrCreateTag,
  getContactTags,
  listTags,
  tagContacts,
  untagContacts,
  updateTag as patchTag,
} from "@/lib/tags";
import type { Tag, TagWithCount } from "@/lib/tag-colors";

type Result<T> = { ok: true } & T | { ok: false; error: string };

const fail = (err: unknown) => ({ ok: false as const, error: (err as Error).message || "Something went wrong" });

export async function fetchTags(): Promise<TagWithCount[]> {
  await actionUser();
  return listTags();
}

/** Put a tag on one contact. Pass `name` to create the tag first if it doesn't exist. */
export async function addTagToContact(
  contactId: number,
  tag: { id: number } | { name: string },
): Promise<Result<{ tags: Tag[]; created?: Tag }>> {
  const user = await actionUser();
  try {
    const created = await tx(async () => {
      const t = "id" in tag ? null : await findOrCreateTag(tag.name, user.id);
      await tagContacts([contactId], t ? t.id : (tag as { id: number }).id, user.id);
      return t ?? undefined;
    });
    return { ok: true, tags: await getContactTags(contactId), created };
  } catch (err) {
    return fail(err);
  }
}

export async function removeTagFromContact(contactId: number, tagId: number): Promise<Tag[]> {
  await actionUser();
  await untagContacts([contactId], tagId);
  return getContactTags(contactId);
}

/** Bulk: tag or untag many contacts at once (Contacts list selection). */
export async function bulkTagContacts(
  contactIds: number[],
  tag: { id: number } | { name: string },
  mode: "add" | "remove",
): Promise<Result<{ changed: number; tag: Tag }>> {
  const user = await actionUser(["admin"]);
  try {
    const result = await tx(async () => {
      let t: Tag;
      if ("id" in tag) {
        const found = (await listTags()).find((x) => x.id === tag.id);
        if (!found) throw new Error("Tag not found");
        t = found;
      } else {
        t = await findOrCreateTag(tag.name, user.id);
      }
      const changed = mode === "add" ? await tagContacts(contactIds, t.id, user.id) : await untagContacts(contactIds, t.id);
      return { changed, tag: { id: t.id, name: t.name, color: t.color } };
    });
    refresh();
    return { ok: true, ...result };
  } catch (err) {
    return fail(err);
  }
}

export async function createTag(name: string): Promise<Result<{ tag: Tag }>> {
  const user = await actionUser();
  try {
    const tag = await findOrCreateTag(name, user.id);
    refresh();
    return { ok: true, tag };
  } catch (err) {
    return fail(err);
  }
}

export async function updateTag(id: number, patch: { name?: string; color?: string }): Promise<Result<object>> {
  await actionUser(["admin"]);
  try {
    await patchTag(id, patch);
    refresh();
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function deleteTag(id: number): Promise<void> {
  await actionUser(["admin"]);
  await removeTag(id);
  refresh();
}
