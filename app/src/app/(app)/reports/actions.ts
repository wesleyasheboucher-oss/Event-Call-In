"use server";

import { actionUser } from "@/lib/auth";
import { getCallList, listContacts, type ContactListRow } from "@/lib/queries";
import { all } from "@/lib/db";
import type { CallListRow } from "@/lib/types";

export async function fetchCallListExport(eventId: number): Promise<CallListRow[]> {
  await actionUser(["admin"]);
  return getCallList(eventId);
}

export type AttendanceExportRow = {
  first_name: string;
  last_name: string;
  phone: string;
  email: string;
  rsvp: string;
  attendance: string;
  walk_in: number;
  guest_of_name: string | null;
  checked_in_at: string | null;
};

export async function fetchAttendanceExport(eventId: number): Promise<AttendanceExportRow[]> {
  await actionUser(["admin"]);
  return all<AttendanceExportRow>(
    `SELECT c.first_name, c.last_name, c.phone, c.email, r.rsvp, r.attendance, r.walk_in, r.checked_in_at,
            hc.first_name || ' ' || hc.last_name AS guest_of_name
       FROM registrations r JOIN contacts c ON c.id = r.contact_id
       LEFT JOIN registrations h ON h.id = r.guest_of LEFT JOIN contacts hc ON hc.id = h.contact_id
      WHERE r.event_id = ? ORDER BY lower(c.last_name), lower(c.first_name)`,
    [eventId],
  );
}

export async function fetchContactsExport(): Promise<ContactListRow[]> {
  await actionUser(["admin"]);
  return listContacts();
}
