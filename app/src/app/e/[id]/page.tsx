import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { AlertTriangle, CalendarDays, DoorOpen, ExternalLink, Globe, Mail, MapPin, Phone, Shirt, Utensils, Backpack, Car, Accessibility, Navigation } from "lucide-react";
import { getEvent, getEventStats } from "@/lib/queries";
import { publicSignupState } from "@/lib/public-event";
import { eventDateLong, fmt, timeOnly } from "@/lib/time";
import { formatPhone, telHref } from "@/lib/phone";
import { EventCover } from "@/components/event-cover";
import { Markdown } from "@/components/markdown";
import type { EventRecord } from "@/lib/types";
import { SignupFlow } from "./signup-flow";

/** Only shareable, published-or-later events that aren't archived have a public page. */
async function publicEvent(id: string): Promise<EventRecord | null> {
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) return null;
  const event = await getEvent(n);
  if (!event || event.visibility !== "shareable" || event.archived_at || event.status === "draft") return null;
  return event;
}

export async function generateMetadata(props: PageProps<"/e/[id]">): Promise<Metadata> {
  const event = await publicEvent((await props.params).id);
  if (!event) return { title: "Event not found" };
  return {
    title: event.name,
    description: event.tagline || `${eventDateLong(event.start_at, event.time_zone)} · ${event.venue_name}`,
  };
}

export default function PublicEventPage(props: PageProps<"/e/[id]">) {
  return (
    <Suspense fallback={<div className="min-h-screen bg-surface" />}>
      <PublicEvent params={props.params} />
    </Suspense>
  );
}

function mapsUrl(e: EventRecord) {
  const q = [e.venue_name, e.street, e.city, e.state, e.zip].filter(Boolean).join(", ");
  return q ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}` : null;
}

async function PublicEvent({ params }: { params: Promise<{ id: string }> }) {
  const event = await publicEvent((await params).id);
  if (!event) notFound();
  const stats = await getEventStats(event.id);
  const state = publicSignupState(event, stats.rsvp.confirmed + stats.rsvp.reconfirmed);
  const tz = event.time_zone;
  const inPerson = event.location_type !== "online";
  const online = event.location_type !== "in_person";
  const map = mapsUrl(event);

  const details: { icon: typeof MapPin; label: string; value: string }[] = [];
  if (event.dress_code) details.push({ icon: Shirt, label: "Dress code", value: event.dress_code });
  if (event.what_to_bring) details.push({ icon: Backpack, label: "What to bring", value: event.what_to_bring });
  if (event.food_drinks) details.push({ icon: Utensils, label: "Food & drinks", value: event.food_drinks });
  if (event.parking_info) details.push({ icon: Car, label: "Parking", value: event.parking_info });
  if (event.directions) details.push({ icon: Navigation, label: "How to find us", value: event.directions });
  if (event.accessibility) details.push({ icon: Accessibility, label: "Accessibility", value: event.accessibility });

  return (
    <div className="min-h-screen bg-surface pb-28 sm:pb-16">
      <div className="mx-auto max-w-3xl sm:px-6 sm:pt-6">
        <div className="overflow-hidden sm:rounded-3xl sm:ring-1 sm:ring-border">
          <EventCover src={event.cover_image} category={event.category} name={event.name} rounded="rounded-none" className="max-h-[380px]" />
        </div>

        <div className="px-5 sm:px-2">
          <header className="relative z-10 flex items-start gap-4 sm:gap-6">
            <div className="-mt-8 flex size-[72px] shrink-0 flex-col items-center justify-center rounded-2xl bg-surface shadow-[var(--shadow-lift)] ring-1 ring-border sm:-mt-10 sm:size-20">
              <span className="text-[11px] font-semibold tracking-wide text-rose-500 uppercase">{fmt(event.start_at, tz, "MMM")}</span>
              <span className="text-3xl leading-tight font-semibold tracking-tight">{fmt(event.start_at, tz, "d")}</span>
            </div>
            <div className="min-w-0 flex-1 pt-4">
              <h1 className="text-[26px] leading-tight font-semibold tracking-tight text-balance sm:text-4xl">{event.name}</h1>
              {event.tagline && <p className="mt-1.5 text-[15px] text-ink-2 sm:text-base">{event.tagline}</p>}
            </div>
          </header>

          {(event.status === "postponed" || event.status === "cancelled") && (
            <div
              className={
                event.status === "cancelled"
                  ? "mt-6 flex gap-3 rounded-2xl bg-rose-50 px-5 py-4 text-rose-800 ring-1 ring-rose-200"
                  : "mt-6 flex gap-3 rounded-2xl bg-amber-50 px-5 py-4 text-amber-900 ring-1 ring-amber-200"
              }
            >
              <AlertTriangle className="mt-0.5 size-5 shrink-0" />
              <div>
                <div className="font-semibold">This event has been {event.status}.</div>
                {event.status_reason && <p className="mt-0.5 text-sm opacity-90">{event.status_reason}</p>}
              </div>
            </div>
          )}

          {/* On larger screens the button sits here; on phones it's pinned to the bottom. */}
          <div className="mt-7">
            <SignupFlow
              eventId={event.id}
              eventName={event.name}
              state={state}
              maxGuests={event.plus_ones_allowed ? event.max_guests || 1 : 0}
              onlineUrl={online ? event.online_url : ""}
            />
          </div>

          <div className="mt-8 grid gap-6 sm:grid-cols-2">
            <Info icon={CalendarDays} label="When">
              <div className="font-medium">{eventDateLong(event.start_at, tz)}</div>
              <div className="text-ink-2">
                {timeOnly(event.start_at, tz)}
                {event.end_at && ` – ${timeOnly(event.end_at, tz)}`} {fmt(event.start_at, tz, "zzz")}
              </div>
              {event.doors_at && (
                <div className="mt-1 inline-flex items-center gap-1 text-xs text-ink-3">
                  <DoorOpen className="size-3" /> Doors open {timeOnly(event.doors_at, tz)}
                </div>
              )}
            </Info>
            {inPerson && (
              <Info icon={MapPin} label="Where">
                <div className="font-medium">{event.venue_name || "Venue to be announced"}</div>
                <div className="text-ink-2">
                  {[event.street, [event.city, event.state].filter(Boolean).join(", "), event.zip].filter(Boolean).join(" · ")}
                </div>
                {event.room && <div className="text-ink-2">{event.room}</div>}
                {map && (
                  <a href={map} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-violet-700 hover:underline">
                    Open in Maps <ExternalLink className="size-3" />
                  </a>
                )}
              </Info>
            )}
            {online && (
              <Info icon={Globe} label="Online">
                <span className="text-ink-2">The link is shown once you sign up.</span>
              </Info>
            )}
            {(event.contact_phone || event.contact_email) && (
              <Info icon={Phone} label="Questions?">
                {event.contact_name && <div className="font-medium">{event.contact_name}</div>}
                <div className="flex flex-wrap gap-x-3 text-ink-2">
                  {event.contact_phone && (
                    <a href={telHref(event.contact_phone)} className="hover:text-violet-700">
                      {formatPhone(event.contact_phone)}
                    </a>
                  )}
                  {event.contact_email && (
                    <a href={`mailto:${event.contact_email}`} className="inline-flex items-center gap-1 hover:text-violet-700">
                      <Mail className="size-3" />
                      {event.contact_email}
                    </a>
                  )}
                </div>
              </Info>
            )}
          </div>

          {event.description && (
            <section className="mt-10 border-t border-border pt-8">
              <h2 className="mb-4 text-lg font-semibold tracking-tight">About</h2>
              <Markdown source={event.description} />
            </section>
          )}

          {event.agenda.length > 0 && (
            <section className="mt-10 border-t border-border pt-8">
              <h2 className="mb-5 text-lg font-semibold tracking-tight">Agenda</h2>
              <ol className="relative ml-1.5 space-y-6 border-l border-border pl-7">
                {event.agenda.map((a, i) => (
                  <li key={i} className="relative">
                    <span className="absolute top-1 -left-[33px] size-3 rounded-full bg-surface ring-[3px] ring-violet-600" />
                    <div className="text-xs font-semibold text-violet-700">{a.time}</div>
                    <div className="mt-0.5 font-medium">{a.title}</div>
                    {a.speaker && <div className="text-sm text-ink-2">{a.speaker}</div>}
                    {a.description && <p className="mt-1 text-sm text-ink-2">{a.description}</p>}
                  </li>
                ))}
              </ol>
            </section>
          )}

          {details.length > 0 && (
            <section className="mt-10 border-t border-border pt-8">
              <h2 className="mb-5 text-lg font-semibold tracking-tight">Good to know</h2>
              <div className="grid gap-5 sm:grid-cols-2">
                {details.map((d) => (
                  <Info key={d.label} icon={d.icon} label={d.label}>
                    {d.value}
                  </Info>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>

    </div>
  );
}

function Info({ icon: Icon, label, children }: { icon: typeof MapPin; label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3.5">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-700">
        <Icon className="size-4" />
      </span>
      <div className="min-w-0 pt-0.5">
        <div className="text-xs text-ink-3">{label}</div>
        <div className="text-sm text-ink">{children}</div>
      </div>
    </div>
  );
}
