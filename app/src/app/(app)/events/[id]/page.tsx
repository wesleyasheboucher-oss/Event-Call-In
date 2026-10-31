import Link from "next/link";
import { notFound } from "next/navigation";
import { clsx } from "clsx";
import {
  Accessibility,
  AlertTriangle,
  ArrowLeft,
  Baby,
  CalendarClock,
  CalendarDays,
  Car,
  ClipboardCheck,
  Clock,
  DoorOpen,
  ExternalLink,
  FileText,
  Globe,
  Lock,
  MapPin,
  Navigation,
  PhoneCall,
  Shirt,
  Ticket,
  Users,
  Utensils,
  Backpack,
  UserPlus,
  Mail,
  Phone,
  Languages,
  Tag,
} from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getEvent, getEventStaff, getEventStats } from "@/lib/queries";
import { pastEventOptions } from "@/lib/events";
import { daysUntil, eventDateLong, fmt, relativeDays, timeOnly } from "@/lib/time";
import { formatPhone, telHref } from "@/lib/phone";
import { EventCover } from "@/components/event-cover";
import { Markdown } from "@/components/markdown";
import { RsvpBar, RsvpLegend } from "@/components/rsvp-bar";
import { EventStatusChip } from "@/components/status";
import { Page } from "@/components/page";
import { Avatar } from "@/components/ui";
import { AdminActions, AddPeopleButton } from "./event-actions";
import type { EventRecord } from "@/lib/types";

const isPast = (iso: string) => Date.parse(iso) < Date.now();

function mapsUrl(e: EventRecord) {
  const q = [e.venue_name, e.street, e.city, e.state, e.zip].filter(Boolean).join(", ");
  return q ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}` : null;
}

function Section({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={clsx("border-t border-border pt-8", className)}>
      <h2 className="mb-5 text-lg font-semibold tracking-tight">{title}</h2>
      {children}
    </section>
  );
}

function InfoRow({ icon: Icon, label, children }: { icon: typeof Clock; label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3.5">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-ink-2">
        <Icon className="size-4" />
      </span>
      <div className="min-w-0 pt-0.5">
        <div className="text-xs text-ink-3">{label}</div>
        <div className="text-sm text-ink">{children}</div>
      </div>
    </div>
  );
}

export default async function EventPage(props: PageProps<"/events/[id]">) {
  const user = await requireUser();
  const { id } = await props.params;
  const event = await getEvent(Number(id));
  if (!event) notFound();
  const [stats, staff] = await Promise.all([getEventStats(event.id), getEventStaff(event.id)]);
  const isAdmin = user.role === "admin";
  const canCall = isAdmin || user.role === "caller";
  const canSignIn = isAdmin || user.role === "signin";
  const tz = event.time_zone;
  const days = daysUntil(event.start_at, tz);
  const deadlineDays = event.rsvp_deadline ? daysUntil(event.rsvp_deadline, tz) : null;
  const deadlinePassed = event.rsvp_deadline ? isPast(event.rsvp_deadline) : false;
  const confirmedCount = stats.rsvp.confirmed + stats.rsvp.reconfirmed;
  const atCapacity = event.capacity != null && confirmedCount >= event.capacity;
  const map = mapsUrl(event);
  const inPerson = event.location_type !== "online";
  const online = event.location_type !== "in_person";
  const callers = staff.filter((s) => s.role === "caller");
  const doorStaff = staff.filter((s) => s.role === "signin");
  const pastEvents = isAdmin ? (await pastEventOptions()).filter((p) => p.id !== event.id) : [];

  const details: { icon: typeof Clock; label: string; value: React.ReactNode }[] = [];
  if (event.capacity != null) details.push({ icon: Users, label: "Capacity", value: `${event.capacity} people` });
  details.push({
    icon: Ticket,
    label: "Admission",
    value:
      event.admission === "paid" && event.price_tiers.length ? (
        <span className="flex flex-col">
          {event.price_tiers.map((t, i) => (
            <span key={i}>
              {t.name} <span className="text-ink-2">· {/^\d/.test(t.amount) ? `$${t.amount}` : t.amount}</span>
            </span>
          ))}
        </span>
      ) : event.admission === "paid" ? "Paid" : "Free",
  });
  if (event.age_restriction !== "all") details.push({ icon: Baby, label: "Ages", value: `${event.age_restriction} only` });
  else details.push({ icon: Baby, label: "Ages", value: "All ages" });
  if (event.plus_ones_allowed)
    details.push({ icon: UserPlus, label: "Plus-ones", value: `Welcome · up to ${event.max_guests || 1} per person` });
  else details.push({ icon: UserPlus, label: "Plus-ones", value: "Not allowed" });
  if (event.dress_code) details.push({ icon: Shirt, label: "Dress code", value: event.dress_code });
  if (event.what_to_bring) details.push({ icon: Backpack, label: "What to bring", value: event.what_to_bring });
  if (event.food_drinks) details.push({ icon: Utensils, label: "Food & drinks", value: event.food_drinks });
  if (event.language) details.push({ icon: Languages, label: "Language", value: event.language });
  if (event.parking_info) details.push({ icon: Car, label: "Parking", value: event.parking_info });
  if (event.directions) details.push({ icon: Navigation, label: "How to find us", value: event.directions });
  if (event.accessibility) details.push({ icon: Accessibility, label: "Accessibility", value: event.accessibility });

  const links = [
    event.website_url && { label: "Event website", url: event.website_url },
    event.facebook_url && { label: "Facebook event", url: event.facebook_url },
    event.ticket_url && { label: "Tickets / registration", url: event.ticket_url },
    ...event.social_links.filter((l) => l.url).map((l) => ({ label: l.label || l.url, url: l.url })),
  ].filter(Boolean) as { label: string; url: string }[];

  return (
    <Page wide className="max-w-7xl">
      <div className="mb-5 flex items-center justify-between gap-3">
        <Link href="/events" className="inline-flex items-center gap-1.5 text-sm text-ink-2 transition-colors hover:text-ink">
          <ArrowLeft className="size-4" /> Events
        </Link>
        {isAdmin && <AdminActions eventId={event.id} archived={!!event.archived_at} />}
      </div>

      <div className="overflow-hidden rounded-3xl ring-1 ring-border">
        <EventCover
          src={event.cover_image}
          category={event.category}
          name={event.name}
          rounded="rounded-none"
          className="max-h-[440px]"
        />
      </div>

      <header className="relative flex flex-col gap-4 px-2 sm:flex-row sm:items-start sm:gap-6 sm:px-6">
        <div className="-mt-10 flex size-20 shrink-0 flex-col items-center justify-center rounded-2xl bg-surface shadow-[var(--shadow-lift)] ring-1 ring-border sm:-mt-12 sm:size-24">
          <span className="text-xs font-semibold tracking-wide text-rose-500 uppercase">{fmt(event.start_at, tz, "MMM")}</span>
          <span className="text-3xl leading-tight font-semibold tracking-tight sm:text-4xl">{fmt(event.start_at, tz, "d")}</span>
        </div>
        <div className="min-w-0 flex-1 sm:pt-5">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <EventStatusChip status={event.status} />
            {event.category && (
              <span className="rounded-full bg-surface-2 px-2.5 py-0.5 text-xs font-medium text-ink-2 ring-1 ring-border">
                {event.category}
              </span>
            )}
            {event.archived_at && (
              <span className="rounded-full bg-stone-800 px-2.5 py-0.5 text-xs font-medium text-white">Archived</span>
            )}
            {days >= 0 && event.status !== "completed" && (
              <span className="text-xs font-medium text-accent">{relativeDays(days)}</span>
            )}
          </div>
          <h1 className="text-[28px] leading-tight font-semibold tracking-tight sm:text-4xl">{event.name}</h1>
          {event.tagline && <p className="mt-1.5 text-[15px] text-ink-2 sm:text-base">{event.tagline}</p>}
        </div>
      </header>

      {(event.status === "postponed" || event.status === "cancelled") && (
        <div
          className={clsx(
            "mt-8 flex gap-3 rounded-2xl px-5 py-4 ring-1",
            event.status === "cancelled" ? "bg-rose-50 text-rose-800 ring-rose-200" : "bg-amber-50 text-amber-900 ring-amber-200",
          )}
        >
          <AlertTriangle className="mt-0.5 size-5 shrink-0" />
          <div>
            <div className="font-semibold">This event has been {event.status}.</div>
            {event.status_reason && <p className="mt-0.5 text-sm opacity-90">{event.status_reason}</p>}
          </div>
        </div>
      )}

      <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-14">
        <div className="space-y-10">
          {/* When & where */}
          <div className="grid gap-6 sm:grid-cols-2">
            <InfoRow icon={CalendarDays} label="When">
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
              {event.recurrence !== "none" && (
                <div className="mt-1 text-xs text-ink-3 capitalize">Repeats {event.recurrence}</div>
              )}
            </InfoRow>
            {inPerson && (
              <InfoRow icon={MapPin} label={event.location_type === "hybrid" ? "Where (in person)" : "Where"}>
                <div className="font-medium">{event.venue_name || "Venue TBD"}</div>
                <div className="text-ink-2">
                  {[event.street, [event.city, event.state].filter(Boolean).join(", "), event.zip].filter(Boolean).join(" · ")}
                </div>
                {event.room && <div className="text-ink-2">{event.room}</div>}
                {map && (
                  <a
                    href={map}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline"
                  >
                    Open in Maps <ExternalLink className="size-3" />
                  </a>
                )}
              </InfoRow>
            )}
            {online && (
              <InfoRow icon={Globe} label="Online">
                {event.online_url ? (
                  <a href={event.online_url} target="_blank" rel="noopener noreferrer" className="font-medium break-all text-accent hover:underline">
                    Join meeting
                  </a>
                ) : (
                  <span className="text-ink-2">Link coming soon</span>
                )}
                {(event.online_meeting_id || event.online_passcode) && (
                  <div className="text-xs text-ink-2">
                    {event.online_meeting_id && <>ID {event.online_meeting_id}</>}
                    {event.online_passcode && <> · Passcode {event.online_passcode}</>}
                  </div>
                )}
              </InfoRow>
            )}
            <InfoRow icon={Users} label={event.hosts.length > 1 ? "Hosts" : "Hosted by"}>
              <div className="font-medium">{event.hosts.join(", ") || "—"}</div>
              {event.cohosts.length > 0 && <div className="text-ink-2">with {event.cohosts.join(", ")}</div>}
            </InfoRow>
            {(event.contact_name || event.contact_phone || event.contact_email) && (
              <InfoRow icon={Phone} label="Questions? Contact">
                {event.contact_name && <div className="font-medium">{event.contact_name}</div>}
                <div className="flex flex-wrap gap-x-3 text-ink-2">
                  {event.contact_phone && (
                    <a href={telHref(event.contact_phone)} className="hover:text-accent">
                      {formatPhone(event.contact_phone)}
                    </a>
                  )}
                  {event.contact_email && (
                    <a href={`mailto:${event.contact_email}`} className="inline-flex items-center gap-1 hover:text-accent">
                      <Mail className="size-3" />
                      {event.contact_email}
                    </a>
                  )}
                </div>
              </InfoRow>
            )}
          </div>

          {event.description && (
            <Section title="About">
              <Markdown source={event.description} />
              {event.tags.length > 0 && (
                <div className="mt-6 flex flex-wrap gap-2">
                  {event.tags.map((t) => (
                    <span key={t} className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-3 py-1 text-xs text-ink-2 ring-1 ring-border">
                      <Tag className="size-3" /> {t}
                    </span>
                  ))}
                </div>
              )}
            </Section>
          )}

          {event.agenda.length > 0 && (
            <Section title="Agenda">
              <ol className="relative ml-1.5 space-y-6 border-l border-border pl-7">
                {event.agenda.map((a, i) => (
                  <li key={i} className="relative">
                    <span className="absolute top-1 -left-[33px] size-3 rounded-full bg-surface ring-[3px] ring-accent" />
                    <div className="text-xs font-semibold text-accent">{a.time}</div>
                    <div className="mt-0.5 font-medium">{a.title}</div>
                    {a.speaker && <div className="text-sm text-ink-2">{a.speaker}</div>}
                    {a.description && <p className="mt-1 text-sm text-ink-2">{a.description}</p>}
                  </li>
                ))}
              </ol>
            </Section>
          )}

          {event.speakers.length > 0 && (
            <Section title="Speakers">
              <div className="grid gap-4 sm:grid-cols-2">
                {event.speakers.map((s, i) => (
                  <div key={i} className="flex gap-4 rounded-2xl p-4 ring-1 ring-border">
                    {s.photo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={s.photo} alt="" className="size-14 shrink-0 rounded-full object-cover" />
                    ) : (
                      <Avatar name={s.name} size="xl" className="size-14" />
                    )}
                    <div className="min-w-0">
                      <div className="font-medium">{s.name}</div>
                      {s.title && <div className="text-sm text-ink-2">{s.title}</div>}
                      {s.bio && <p className="mt-1.5 text-sm text-ink-2">{s.bio}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {event.sponsors.length > 0 && (
            <Section title="Sponsors">
              <div className="flex flex-wrap gap-3">
                {event.sponsors.map((s, i) => {
                  const inner = (
                    <>
                      {s.logo ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={s.logo} alt="" className="h-8 max-w-24 object-contain" />
                      ) : (
                        <span className="flex size-8 items-center justify-center rounded-lg bg-surface-2 text-xs font-semibold text-ink-2">
                          {s.name.slice(0, 2).toUpperCase()}
                        </span>
                      )}
                      <span className="text-sm font-medium">{s.name}</span>
                    </>
                  );
                  return s.url ? (
                    <a
                      key={i}
                      href={s.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 rounded-2xl px-4 py-3 ring-1 ring-border transition-shadow hover:shadow-[var(--shadow-soft)]"
                    >
                      {inner}
                    </a>
                  ) : (
                    <div key={i} className="flex items-center gap-3 rounded-2xl px-4 py-3 ring-1 ring-border">
                      {inner}
                    </div>
                  );
                })}
              </div>
            </Section>
          )}

          <Section title="Good to know">
            <div className="grid gap-6 sm:grid-cols-2">
              {details.map((d) => (
                <InfoRow key={d.label} icon={d.icon} label={d.label}>
                  <span className="whitespace-pre-wrap">{d.value}</span>
                </InfoRow>
              ))}
            </div>
          </Section>

          {event.venue_photos.length > 0 && (
            <Section title="The venue">
              <PhotoGrid photos={event.venue_photos} />
            </Section>
          )}

          {event.gallery.length > 0 && (
            <Section title="Photos from the event">
              <PhotoGrid photos={event.gallery} />
            </Section>
          )}

          {(event.flyer || event.attachments.length > 0) && (
            <Section title="Files">
              <div className="grid gap-3 sm:grid-cols-2">
                {event.flyer && <FileLink name="Event flyer" url={event.flyer} />}
                {event.attachments.map((a, i) => (
                  <FileLink key={i} name={a.name || "Attachment"} url={a.url} />
                ))}
              </div>
            </Section>
          )}

          {links.length > 0 && (
            <Section title="Links">
              <div className="flex flex-wrap gap-2">
                {links.map((l, i) => (
                  <a
                    key={i}
                    href={l.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-medium ring-1 ring-border transition-colors hover:bg-surface-2"
                  >
                    {l.label} <ExternalLink className="size-3.5 text-ink-3" />
                  </a>
                ))}
              </div>
            </Section>
          )}

          {(event.caller_script || event.signin_instructions || event.internal_notes) && (
            <Section title="Team only">
              <div className="space-y-4">
                {[
                  { label: "Caller script", body: event.caller_script, icon: PhoneCall },
                  { label: "Sign-in instructions", body: event.signin_instructions, icon: ClipboardCheck },
                  { label: "Internal notes", body: event.internal_notes, icon: Lock },
                ]
                  .filter((x) => x.body)
                  .map((x) => (
                    <div key={x.label} className="rounded-2xl bg-amber-50/60 p-5 ring-1 ring-amber-200/70">
                      <div className="mb-2 flex items-center gap-2 text-xs font-semibold tracking-wide text-amber-800 uppercase">
                        <x.icon className="size-3.5" /> {x.label}
                      </div>
                      <p className="text-sm leading-relaxed whitespace-pre-wrap text-ink">{x.body}</p>
                    </div>
                  ))}
              </div>
            </Section>
          )}
        </div>

        {/* Side card */}
        <aside className="lg:sticky lg:top-8 lg:self-start">
          <div className="rounded-3xl bg-surface p-6 shadow-[var(--shadow-soft)] ring-1 ring-border">
            <div className="flex items-baseline justify-between">
              <h2 className="text-sm font-semibold">Call list</h2>
              <span className="text-xs text-ink-3 tabular-nums">{stats.rsvp.total} people</span>
            </div>
            <RsvpBar counts={stats.rsvp} className="mt-4 h-2.5" />
            <div className="mt-3">
              <RsvpLegend counts={stats.rsvp} />
            </div>

            <dl className="mt-6 grid grid-cols-2 gap-3">
              <Stat label="Expected" value={stats.expectedHeadcount} hint="incl. guests" />
              <Stat
                label="Show rate"
                value={stats.showRate == null ? "—" : `${Math.round(stats.showRate * 100)}%`}
                hint="attended ÷ confirmed"
              />
              <Stat label="Attended" value={stats.attended} tone="text-emerald-600" />
              <Stat label="No-shows" value={stats.noShow} tone={stats.noShow ? "text-rose-600" : undefined} hint={stats.walkIns ? `${stats.walkIns} walk-ins` : undefined} />
            </dl>

            <div className="mt-6 space-y-2.5 text-sm">
              <div className="flex items-center gap-2.5 text-ink-2">
                <CalendarClock className="size-4 text-ink-3" />
                {days > 0 ? `${days} ${days === 1 ? "day" : "days"} until the event` : days === 0 ? "Happening today" : `${-days} days ago`}
              </div>
              {event.rsvp_deadline && (
                <div className={clsx("flex items-center gap-2.5", deadlinePassed ? "font-medium text-amber-700" : "text-ink-2")}>
                  <Clock className={clsx("size-4", deadlinePassed ? "text-amber-600" : "text-ink-3")} />
                  {deadlinePassed
                    ? `RSVP deadline passed (${fmt(event.rsvp_deadline, tz, "MMM d")})`
                    : `RSVP by ${fmt(event.rsvp_deadline, tz, "MMM d")} · ${relativeDays(deadlineDays!).toLowerCase()}`}
                </div>
              )}
              {event.capacity != null && (
                <div className={clsx("flex items-center gap-2.5", atCapacity ? "font-medium text-rose-700" : "text-ink-2")}>
                  <Users className={clsx("size-4", atCapacity ? "text-rose-600" : "text-ink-3")} />
                  {atCapacity ? `At capacity (${confirmedCount}/${event.capacity})` : `${confirmedCount} of ${event.capacity} spots confirmed`}
                </div>
              )}
            </div>

            <div className="mt-6 flex flex-col gap-2">
              {canCall && (
                <Link
                  href={`/call/${event.id}`}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-accent text-sm font-medium text-white shadow-sm transition-colors hover:bg-accent-hover"
                >
                  <PhoneCall className="size-4" /> Work call list
                </Link>
              )}
              {canSignIn && (
                <Link
                  href={`/signin/${event.id}`}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-surface text-sm font-medium ring-1 ring-border transition-colors hover:bg-surface-2"
                >
                  <ClipboardCheck className="size-4" /> Event-day sign-in
                </Link>
              )}
              {isAdmin && <AddPeopleButton eventId={event.id} eventName={event.name} pastEvents={pastEvents} />}
            </div>

            {(callers.length > 0 || doorStaff.length > 0) && (
              <div className="mt-6 space-y-4 border-t border-border pt-5">
                {[
                  { label: "Callers", people: callers },
                  { label: "Sign-in staff", people: doorStaff },
                ]
                  .filter((g) => g.people.length)
                  .map((g) => (
                    <div key={g.label}>
                      <div className="mb-2 text-xs font-semibold tracking-wide text-ink-3 uppercase">{g.label}</div>
                      <div className="flex flex-wrap gap-2">
                        {g.people.map((p) => (
                          <span key={p.user_id} className="inline-flex items-center gap-2 rounded-full bg-surface-2 py-1 pr-3 pl-1 text-[13px]">
                            <Avatar name={p.name} size="sm" className="size-6 text-[10px]" /> {p.name}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>
          <p className="mt-3 px-2 text-xs text-ink-3">
            {event.visibility === "shareable" ? "Marked shareable" : "Internal only"} · Updated {fmt(event.updated_at, tz, "MMM d, yyyy")}
          </p>
        </aside>
      </div>
    </Page>
  );
}

function Stat({ label, value, hint, tone }: { label: string; value: React.ReactNode; hint?: string; tone?: string }) {
  return (
    <div className="rounded-2xl bg-surface-2 px-4 py-3">
      <dt className="text-xs text-ink-2">{label}</dt>
      <dd className={clsx("mt-0.5 text-xl font-semibold tracking-tight tabular-nums", tone)}>{value}</dd>
      {hint && <div className="text-[11px] text-ink-3">{hint}</div>}
    </div>
  );
}

function PhotoGrid({ photos }: { photos: string[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {photos.map((p, i) => (
        <a key={i} href={p} target="_blank" rel="noopener noreferrer" className="group overflow-hidden rounded-2xl ring-1 ring-border">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={p} alt="" className="aspect-[4/3] w-full object-cover transition-transform duration-500 group-hover:scale-105" />
        </a>
      ))}
    </div>
  );
}

function FileLink({ name, url }: { name: string; url: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-3 rounded-2xl px-4 py-3 ring-1 ring-border transition-colors hover:bg-surface-2"
    >
      <span className="flex size-9 items-center justify-center rounded-xl bg-accent-soft text-accent">
        <FileText className="size-4" />
      </span>
      <span className="min-w-0 flex-1 truncate text-sm font-medium">{name}</span>
      <ExternalLink className="size-3.5 text-ink-3" />
    </a>
  );
}
