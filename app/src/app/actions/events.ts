"use server";

import { refresh } from "next/cache";
import { actionUser } from "@/lib/auth";
import {
  addContactsToEvent,
  addToCallList,
  createEvents,
  duplicateEvent as dup,
  previewCallList,
  searchContactsForEvent,
  setArchived,
  updateEvent,
} from "@/lib/events";
import { getEvent } from "@/lib/queries";
import { validateEvent, type CallListFilter, type EventInput, type SaveResult } from "@/components/event-form/types";

export async function saveEvent(id: number | null, input: EventInput, filter?: CallListFilter): Promise<SaveResult> {
  const user = await actionUser([]);
  const errors = validateEvent(input);
  if (Object.keys(errors).length) return { ok: false, errors };
  if (id) {
    if (!(await getEvent(id))) return { ok: false, errors: { name: "This event no longer exists." } };
    await updateEvent(id, input);
    refresh();
    return { ok: true, id, created: 0 };
  }
  const ids = await createEvents(input, user.id, filter ?? { mode: "all", excludeNoShows: false });
  return { ok: true, id: ids[0], created: ids.length };
}

export async function duplicateEvent(id: number) {
  const user = await actionUser([]);
  return { id: await dup(id, user.id) };
}

export async function archiveEvent(id: number, archived: boolean) {
  await actionUser([]);
  await setArchived(id, archived);
  refresh();
}

export async function previewList(eventId: number | null, filter: CallListFilter) {
  await actionUser([]);
  return previewCallList(eventId, filter);
}

export async function applyCallListFilter(eventId: number, filter: CallListFilter) {
  await actionUser([]);
  const added = await addToCallList(eventId, filter);
  refresh();
  return { added };
}

export async function searchContacts(eventId: number, q: string) {
  await actionUser([]);
  return searchContactsForEvent(eventId, q);
}

export async function addContacts(eventId: number, contactIds: number[]) {
  await actionUser([]);
  const added = await addContactsToEvent(eventId, contactIds);
  refresh();
  return { added };
}
