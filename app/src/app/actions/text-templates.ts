"use server";

import { refresh } from "next/cache";
import { actionUser } from "@/lib/auth";
import { get, insert, now, run } from "@/lib/db";

export async function saveTextTemplate(input: { id?: number; name: string; body: string; eventId: number | null }): Promise<number> {
  const user = await actionUser(["admin"]);
  const name = input.name.trim().slice(0, 80);
  const body = input.body.trim().slice(0, 1600);
  if (!name) throw new Error("Give the template a name.");
  if (!body) throw new Error("Write the message.");
  if (input.eventId != null && !(await get("SELECT id FROM events WHERE id = ?", [input.eventId]))) throw new Error("That event no longer exists.");
  const ts = now();
  let id = input.id;
  if (id) {
    await run("UPDATE text_templates SET name = ?, body = ?, event_id = ?, updated_at = ? WHERE id = ?", [name, body, input.eventId, ts, id]);
  } else {
    id = await insert("INSERT INTO text_templates (name, body, event_id, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)", [
      name,
      body,
      input.eventId,
      user.id,
      ts,
      ts,
    ]);
  }
  refresh();
  return id;
}

export async function deleteTextTemplate(id: number) {
  await actionUser(["admin"]);
  await run("DELETE FROM text_templates WHERE id = ?", [id]);
  refresh();
}
