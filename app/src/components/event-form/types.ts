import type { EventRecord } from "@/lib/types";

/** Shape the event form edits. Datetimes are wall-clock strings in `time_zone`. */
export type EventInput = Omit<
  EventRecord,
  "id" | "series_id" | "archived_at" | "created_by" | "created_at" | "updated_at" | "start_at" | "end_at" | "doors_at" | "rsvp_deadline" | "capacity"
> & {
  start_local: string;
  end_local: string;
  doors_local: string;
  rsvp_deadline_local: string;
  capacity: string;
  callers: number[];
  signin_staff: number[];
  occurrences: number;
};

export type CallListFilter = {
  mode: "all" | "attended_any" | "attended_event" | "none";
  attendedEventId?: number | null;
  excludeNoShows: boolean;
};

export type SaveResult = { ok: true; id: number; created: number } | { ok: false; errors: Record<string, string> };

export const WRITABLE_TEXT_FIELDS = [
  "name", "tagline", "description", "category", "language", "status", "status_reason", "time_zone", "recurrence",
  "location_type", "venue_name", "street", "city", "state", "zip", "room", "online_url", "online_meeting_id",
  "online_passcode", "parking_info", "directions", "accessibility", "contact_name", "contact_phone", "contact_email",
  "admission", "ticket_url", "age_restriction", "dress_code", "what_to_bring", "food_drinks", "visibility",
  "cover_image", "cover_thumb", "flyer", "website_url", "facebook_url", "caller_script", "signin_instructions",
  "internal_notes",
] as const;

export function validateEvent(v: EventInput): Record<string, string> {
  const e: Record<string, string> = {};
  if (!v.name.trim()) e.name = "Give the event a name.";
  if (v.tagline.length > 140) e.tagline = "Keep the tagline under ~120 characters.";
  if (!v.start_local) e.start_local = "Pick a start date and time.";
  if (v.end_local && v.start_local && v.end_local < v.start_local) e.end_local = "End must be after the start.";
  if (!v.time_zone) e.time_zone = "Choose a time zone.";
  if (v.location_type !== "online") {
    if (!v.venue_name.trim()) e.venue_name = "Venue name is required for in-person events.";
    if (!v.street.trim()) e.street = "Street address is required for in-person events.";
    if (!v.city.trim()) e.city = "City is required.";
  }
  if (v.location_type !== "in_person" && !v.online_url.trim()) e.online_url = "Add the meeting link.";
  if (v.hosts.filter((h) => h.trim()).length === 0) e.hosts = "Add at least one host.";
  if (v.admission === "paid" && v.price_tiers.filter((t) => t.name.trim() || t.amount.trim()).length === 0)
    e.price_tiers = "Add at least one price tier.";
  if (v.capacity && !/^\d+$/.test(v.capacity)) e.capacity = "Capacity must be a whole number.";
  if (v.contact_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.contact_email)) e.contact_email = "That email doesn't look right.";
  return e;
}

/** Which form section each validated field lives in, for jumping to the first error. */
export const FIELD_SECTION: Record<string, string> = {
  name: "basics", tagline: "basics", start_local: "datetime", end_local: "datetime", time_zone: "datetime",
  venue_name: "location", street: "location", city: "location", online_url: "location", hosts: "people",
  contact_email: "people", price_tiers: "rules", capacity: "rules",
};
