import type { AttendanceStatus, EventStatus, Role, RsvpStatus } from "./status";

export type User = {
  id: number;
  name: string;
  email: string;
  role: Role;
  title: string;
  /** digits only; '' when not set. Can be used to sign in. */
  phone: string;
  /** 1 = an admin set their password; they must choose their own at next sign-in */
  must_change_password: number;
  /** 1–7; null for people added before divisions existed */
  division: number | null;
  active: number;
  created_at: string;
};

export type Contact = {
  id: number;
  first_name: string;
  last_name: string;
  phone: string;
  email: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  notes: string;
  source: "import" | "walk_in" | "manual" | "guest";
  division: number | null;
  created_at: string;
  updated_at: string;
};

export type Speaker = { name: string; title: string; bio: string; photo: string };
export type Sponsor = { name: string; logo: string; url: string };
export type PriceTier = { name: string; amount: string };
export type AgendaItem = { time: string; title: string; description: string; speaker: string };
export type LinkItem = { label: string; url: string };
export type FileItem = { name: string; url: string };

/** JSON-typed columns on the events table. */
export const EVENT_JSON_FIELDS = [
  "tags",
  "hosts",
  "cohosts",
  "speakers",
  "sponsors",
  "price_tiers",
  "agenda",
  "venue_photos",
  "gallery",
  "attachments",
  "social_links",
] as const;

export type EventRecord = {
  id: number;
  series_id: string | null;
  name: string;
  tagline: string;
  description: string;
  category: string;
  tags: string[];
  language: string;
  status: EventStatus;
  status_reason: string;
  start_at: string;
  end_at: string | null;
  time_zone: string;
  doors_at: string | null;
  recurrence: "none" | "weekly" | "monthly" | "custom";
  rsvp_deadline: string | null;
  location_type: "in_person" | "online" | "hybrid";
  venue_name: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  room: string;
  online_url: string;
  online_meeting_id: string;
  online_passcode: string;
  parking_info: string;
  directions: string;
  accessibility: string;
  hosts: string[];
  cohosts: string[];
  contact_name: string;
  contact_phone: string;
  contact_email: string;
  speakers: Speaker[];
  sponsors: Sponsor[];
  capacity: number | null;
  admission: "free" | "paid";
  price_tiers: PriceTier[];
  ticket_url: string;
  age_restriction: "all" | "18+" | "21+";
  dress_code: string;
  what_to_bring: string;
  food_drinks: string;
  plus_ones_allowed: number;
  max_guests: number;
  visibility: "internal" | "shareable";
  agenda: AgendaItem[];
  cover_image: string;
  cover_thumb: string;
  flyer: string;
  venue_photos: string[];
  gallery: string[];
  attachments: FileItem[];
  website_url: string;
  facebook_url: string;
  social_links: LinkItem[];
  caller_script: string;
  signin_instructions: string;
  internal_notes: string;
  archived_at: string | null;
  created_by: number | null;
  created_at: string;
  updated_at: string;
};

export type EventStaff = { user_id: number; name: string; role: "caller" | "signin" };

export type RsvpCounts = Record<RsvpStatus, number> & { total: number };

export type EventStats = {
  rsvp: RsvpCounts;
  attended: number;
  noShow: number;
  pending: number;
  walkIns: number;
  expectedHeadcount: number;
  showRate: number | null;
};

export type CallListRow = {
  registration_id: number;
  contact_id: number;
  first_name: string;
  last_name: string;
  phone: string;
  email: string;
  rsvp: RsvpStatus;
  attendance: AttendanceStatus;
  /** Names of the guests this person is bringing, e.g. "Ana Ruiz, Tom Ruiz". */
  guest_names: string | null;
  guest_count: number;
  last_called_at: string | null;
  called_by_name: string | null;
  note_count: number;
  last_note: string | null;
  attended_count: number;
  no_show_count: number;
};

export type HistoryRow = {
  registration_id: number;
  event_id: number;
  event_name: string;
  start_at: string;
  time_zone: string;
  event_status: EventStatus;
  cover_thumb: string;
  rsvp: RsvpStatus;
  attendance: AttendanceStatus;
  walk_in: number;
  /** Set when they came as someone's guest. */
  guest_of_name: string | null;
  last_called_at: string | null;
  called_by_name: string | null;
};

/** A guest someone is bringing to an event: a contact with their own registration. */
export type GuestRow = {
  registration_id: number;
  contact_id: number;
  first_name: string;
  last_name: string;
  phone: string;
  email: string;
  attendance: AttendanceStatus;
};

export type NoteRow = { id: number; body: string; created_at: string; author: string; event_name?: string };

export type ChangeRow = {
  id: number;
  kind: "rsvp" | "attendance";
  from_value: string | null;
  to_value: string;
  created_at: string;
  author: string;
};
