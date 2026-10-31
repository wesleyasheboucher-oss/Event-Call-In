import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { formatDistanceToNowStrict } from "date-fns";

export const DEFAULT_TZ = "America/New_York";

export const COMMON_TIME_ZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Phoenix",
  "America/Los_Angeles",
  "America/Anchorage",
  "Pacific/Honolulu",
  "Europe/London",
  "Europe/Paris",
  "Asia/Tokyo",
  "Australia/Sydney",
  "UTC",
];

export function fmt(iso: string | null | undefined, tz: string, pattern: string): string {
  if (!iso) return "";
  return formatInTimeZone(new Date(iso), tz, pattern);
}

/** "Sat, Nov 8 · 6:30 PM EST" */
export function eventWhen(iso: string, tz: string): string {
  return fmt(iso, tz, "EEE, MMM d · h:mm a zzz");
}

export function eventDateLong(iso: string, tz: string): string {
  return fmt(iso, tz, "EEEE, MMMM d, yyyy");
}

export function timeOnly(iso: string | null | undefined, tz: string): string {
  return fmt(iso, tz, "h:mm a");
}

/** Value for <input type="datetime-local"> showing the instant in the event's zone. */
export function toLocalInput(iso: string | null | undefined, tz: string): string {
  return iso ? formatInTimeZone(new Date(iso), tz, "yyyy-MM-dd'T'HH:mm") : "";
}

/** Interpret a datetime-local value as wall time in the event's zone. */
export function fromLocalInput(value: string | null | undefined, tz: string): string | null {
  if (!value) return null;
  return fromZonedTime(value, tz).toISOString();
}

export function ago(iso: string | null | undefined): string {
  if (!iso) return "";
  if (Date.now() - Date.parse(iso) < 45e3) return "just now";
  return `${formatDistanceToNowStrict(new Date(iso))} ago`;
}

/** Whole calendar days from today to the given instant (negative if past), in the zone. */
export function daysUntil(iso: string, tz: string): number {
  const target = formatInTimeZone(new Date(iso), tz, "yyyy-MM-dd");
  const today = formatInTimeZone(new Date(), tz, "yyyy-MM-dd");
  return Math.round((Date.parse(target) - Date.parse(today)) / 864e5);
}

export function relativeDays(days: number): string {
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days === -1) return "Yesterday";
  return days > 0 ? `In ${days} days` : `${-days} days ago`;
}
