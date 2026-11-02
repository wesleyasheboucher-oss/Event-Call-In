// Shared between server and client: whether a public event page is taking sign-ups.

export type SignupState = "open" | "cancelled" | "postponed" | "past" | "deadline" | "full";

export const CLOSED_MESSAGE: Record<Exclude<SignupState, "open">, string> = {
  cancelled: "This event has been cancelled.",
  postponed: "This event has been postponed. Sign-ups will reopen when it's rescheduled.",
  past: "This event has already happened.",
  deadline: "Sign-ups for this event have closed.",
  full: "This event is full.",
};

export function publicSignupState(
  e: { status: string; start_at: string; rsvp_deadline: string | null; capacity: number | null },
  confirmed: number,
): SignupState {
  if (e.status === "cancelled") return "cancelled";
  if (e.status === "postponed") return "postponed";
  if (e.status === "completed" || Date.parse(e.start_at) < Date.now()) return "past";
  if (e.rsvp_deadline && Date.parse(e.rsvp_deadline) < Date.now()) return "deadline";
  if (e.capacity != null && confirmed >= e.capacity) return "full";
  return "open";
}
