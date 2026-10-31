// Shared between server and client: status vocabularies and their presentation.

export const RSVP_STATUSES = ["no_data", "tentative", "confirmed", "reconfirmed", "declined"] as const;
export type RsvpStatus = (typeof RSVP_STATUSES)[number];

export const ATTENDANCE_STATUSES = ["pending", "attended", "no_show"] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

export const EVENT_STATUSES = ["draft", "published", "postponed", "cancelled", "completed"] as const;
export type EventStatus = (typeof EVENT_STATUSES)[number];

export const ROLES = ["admin", "caller", "signin"] as const;
export type Role = (typeof ROLES)[number];

type Style = { label: string; dot: string; chip: string; solid: string };

export const RSVP: Record<RsvpStatus, Style> = {
  no_data: {
    label: "No Data",
    dot: "bg-stone-300",
    chip: "bg-stone-100 text-stone-600 ring-stone-200",
    solid: "bg-stone-700 text-white",
  },
  confirmed: {
    label: "Confirmed",
    dot: "bg-emerald-500",
    chip: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    solid: "bg-emerald-600 text-white",
  },
  tentative: {
    label: "Tentative",
    dot: "bg-amber-400",
    chip: "bg-amber-50 text-amber-700 ring-amber-200",
    solid: "bg-amber-500 text-white",
  },
  reconfirmed: {
    label: "Reconfirmed",
    dot: "bg-sky-500",
    chip: "bg-sky-50 text-sky-700 ring-sky-200",
    solid: "bg-sky-600 text-white",
  },
  declined: {
    label: "Declined",
    dot: "bg-rose-500",
    chip: "bg-rose-50 text-rose-700 ring-rose-200",
    solid: "bg-rose-600 text-white",
  },
};

export const ATTENDANCE: Record<AttendanceStatus, Style> = {
  pending: {
    label: "Pending",
    dot: "bg-stone-300",
    chip: "bg-stone-100 text-stone-600 ring-stone-200",
    solid: "bg-stone-700 text-white",
  },
  attended: {
    label: "Attended",
    dot: "bg-emerald-500",
    chip: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    solid: "bg-emerald-600 text-white",
  },
  no_show: {
    label: "No-Show",
    dot: "bg-rose-500",
    chip: "bg-rose-50 text-rose-700 ring-rose-200",
    solid: "bg-rose-600 text-white",
  },
};

export const EVENT_STATUS: Record<EventStatus, Style> = {
  draft: { label: "Draft", dot: "bg-stone-400", chip: "bg-stone-100 text-stone-600 ring-stone-200", solid: "" },
  published: { label: "Published", dot: "bg-emerald-500", chip: "bg-emerald-50 text-emerald-700 ring-emerald-200", solid: "" },
  postponed: { label: "Postponed", dot: "bg-amber-400", chip: "bg-amber-50 text-amber-700 ring-amber-200", solid: "" },
  cancelled: { label: "Cancelled", dot: "bg-rose-500", chip: "bg-rose-50 text-rose-700 ring-rose-200", solid: "" },
  completed: { label: "Completed", dot: "bg-indigo-500", chip: "bg-indigo-50 text-indigo-700 ring-indigo-200", solid: "" },
};

/** Team divisions are numbered 1 through 7. */
export const DIVISIONS = [1, 2, 3, 4, 5, 6, 7] as const;

export const ROLE_LABEL: Record<Role, string> = {
  admin: "Admin",
  caller: "Caller",
  signin: "Sign-in staff",
};

/** RSVP statuses that count toward "expected" on event day. */
export const EXPECTED_RSVPS: RsvpStatus[] = ["confirmed", "tentative", "reconfirmed"];
