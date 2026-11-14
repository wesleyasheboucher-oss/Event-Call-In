// Shared between server and client: text templates, their fill-in fields, and the sms: link.

import { fmt, timeOnly } from "./time";

export type TextTemplate = { id: number; name: string; body: string; event_id: number | null; updated_at: string };

/** What a template needs to know about an event. */
export type TextEvent = {
  id: number;
  name: string;
  start_at: string;
  time_zone: string;
  venue_name: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  /** shareable, published and not archived: it has a public sign-up page */
  has_signup_page: boolean;
};

export type TextContext = {
  person: { first_name: string; last_name: string };
  event: TextEvent | null;
  /** the caller sending it */
  me: string;
  /** e.g. https://callin.example.org, for {signup_link} */
  origin: string;
};

export const TEXT_FIELDS: { key: string; label: string; sample: string }[] = [
  { key: "first_name", label: "First name", sample: "Maria" },
  { key: "last_name", label: "Last name", sample: "Lopez" },
  { key: "event_name", label: "Event name", sample: "Holiday Open House" },
  { key: "event_date", label: "Event date", sample: "Saturday, November 21" },
  { key: "event_time", label: "Event time", sample: "4:00 PM" },
  { key: "venue", label: "Venue", sample: "Fort Harrison" },
  { key: "address", label: "Address", sample: "210 S Fort Harrison Ave, Clearwater, FL" },
  { key: "signup_link", label: "Sign-up link", sample: "https://example.org/e/6" },
  { key: "my_name", label: "Your first name", sample: "Wes" },
];

export function fieldValues(ctx: TextContext): Record<string, string> {
  const e = ctx.event;
  const cityLine = e ? [e.city, [e.state, e.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ") : "";
  return {
    first_name: ctx.person.first_name.trim(),
    last_name: ctx.person.last_name.trim(),
    event_name: e?.name ?? "",
    event_date: e ? fmt(e.start_at, e.time_zone, "EEEE, MMMM d") : "",
    event_time: e ? timeOnly(e.start_at, e.time_zone) : "",
    venue: e?.venue_name ?? "",
    address: e ? [e.street, cityLine].filter(Boolean).join(", ") : "",
    signup_link: e?.has_signup_page ? `${ctx.origin}/e/${e.id}` : "",
    my_name: ctx.me.trim().split(/\s+/)[0] ?? "",
  };
}

/** Fills {fields} in a template. Unknown fields are left as typed so a typo is visible. */
export function fillTemplate(body: string, values: Record<string, string>): string {
  return body.replace(/\{\s*([a-z_]+)\s*\}/gi, (whole, key: string) => {
    const k = key.toLowerCase();
    return k in values ? values[k] : whole;
  });
}

/** Fields a template uses that have nothing to fill in for this person/event (shown as a warning). */
export function missingFields(body: string, values: Record<string, string>): string[] {
  const used = [...body.matchAll(/\{\s*([a-z_]+)\s*\}/gi)].map((m) => m[1].toLowerCase());
  return [...new Set(used.filter((k) => k in values && !values[k]))];
}

/**
 * Opens the phone's messaging app to this number with the message typed in. "?&body=" is
 * the form both iPhone and Android read; on a Mac it opens Messages.
 */
export function smsHref(phoneDigits: string, body: string): string {
  const to = phoneDigits.length === 10 ? `+1${phoneDigits}` : phoneDigits ? `+${phoneDigits}` : "";
  return `sms:${to}?&body=${encodeURIComponent(body)}`;
}
