"use client";

import { useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { toast } from "sonner";
import {
  AlignLeft,
  ArrowLeft,
  Bold,
  CalendarClock,
  ExternalLink,
  Image as ImageIcon,
  Link2,
  List,
  Lock,
  MapPin,
  ListOrdered,
  ShieldCheck,
  Users,
  ListChecks,
  Check,
  Plus,
} from "lucide-react";
import { saveEvent } from "@/app/actions/events";
import { Button, cx, Field, Input, Select, Textarea, Toggle } from "@/components/ui";
import { renderMarkdown } from "@/components/markdown";
import { COMMON_TIME_ZONES } from "@/lib/time";
import { EVENT_STATUS, EVENT_STATUSES, type EventStatus } from "@/lib/status";
import type { AgendaItem, LinkItem, PriceTier, Speaker, Sponsor } from "@/lib/types";
import { CallListBuilder, type PastEventOption } from "./call-list-builder";
import { CoverField } from "./cover-field";
import { Attachments, ImageGrid, ImageSlot, Repeater, Segmented, SingleFile, TagInput } from "./fields";
import { FIELD_SECTION, validateEvent, type CallListFilter, type EventInput } from "./types";

type UserOpt = { id: number; name: string; role: string };

const SECTIONS = [
  { id: "basics", label: "Basics", icon: AlignLeft },
  { id: "datetime", label: "Date & time", icon: CalendarClock },
  { id: "location", label: "Location", icon: MapPin },
  { id: "people", label: "People", icon: Users },
  { id: "rules", label: "Capacity & rules", icon: ShieldCheck },
  { id: "agenda", label: "Agenda", icon: ListOrdered },
  { id: "media", label: "Images & files", icon: ImageIcon },
  { id: "links", label: "Links", icon: Link2 },
  { id: "internal", label: "Internal", icon: Lock },
  { id: "calllist", label: "Call list", icon: ListChecks },
];

export function EventForm({
  eventId,
  initial,
  categories,
  users,
  pastEvents,
}: {
  eventId: number | null;
  initial: EventInput;
  categories: string[];
  users: UserOpt[];
  pastEvents: PastEventOption[];
}) {
  const router = useRouter();
  const [v, setV] = useState<EventInput>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<CallListFilter>({ mode: "all", excludeNoShows: false });
  const [pending, start] = useTransition();
  const [active, setActive] = useState("basics");
  const [cats, setCats] = useState(categories);
  const [newCat, setNewCat] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  const sections = useMemo(() => (eventId ? SECTIONS.filter((s) => s.id !== "calllist") : SECTIONS), [eventId]);

  const set = <K extends keyof EventInput>(key: K, value: EventInput[K]) => {
    setV((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
    if (errors[key as string])
      setErrors((prev) => {
        const next = { ...prev };
        delete next[key as string];
        return next;
      });
  };

  // Warn before leaving with unsaved changes.
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  // Scroll-spy for the section nav.
  useEffect(() => {
    const els = sections.map((s) => document.getElementById(s.id)).filter(Boolean) as HTMLElement[];
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: "-20% 0px -65% 0px" },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [sections]);

  const jump = (id: string) => {
    setActive(id);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const submit = () => {
    const errs = validateEvent(v);
    if (Object.keys(errs).length) {
      setErrors(errs);
      const first = sections.find((s) => Object.keys(errs).some((k) => FIELD_SECTION[k] === s.id));
      if (first) jump(first.id);
      toast.error("A few things need attention before saving.");
      return;
    }
    start(async () => {
      const res = await saveEvent(eventId, v, filter);
      if (!res.ok) {
        setErrors(res.errors);
        toast.error("A few things need attention before saving.");
        return;
      }
      setDirty(false);
      toast.success(eventId ? "Event saved" : res.created > 1 ? `Created ${res.created} events in the series` : "Event created");
      router.push(`/events/${res.id}`);
    });
  };

  const inPerson = v.location_type !== "online";
  const online = v.location_type !== "in_person";
  const address = [v.venue_name, v.street, v.city, v.state, v.zip].filter(Boolean).join(", ");
  const zones = COMMON_TIME_ZONES.includes(v.time_zone) ? COMMON_TIME_ZONES : [v.time_zone, ...COMMON_TIME_ZONES];
  const userNames = users.map((u) => u.name);
  const err = (k: string) => errors[k];

  return (
    <div className="mx-auto max-w-6xl px-4 pt-8 pb-32 sm:px-8 lg:pt-12">
      <Link
        href={eventId ? `/events/${eventId}` : "/events"}
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-ink-2 transition-colors hover:text-ink"
      >
        <ArrowLeft className="size-4" /> {eventId ? "Back to event" : "Events"}
      </Link>
      <h1 className="mb-1.5 text-2xl font-semibold tracking-tight sm:text-[28px]">{eventId ? `Edit ${initial.name}` : "New event"}</h1>
      <p className="mb-10 text-[15px] text-ink-2">
        Only the essentials are required. Everything else makes the event page more helpful for callers and guests.
      </p>

      <div className="grid gap-10 lg:grid-cols-[200px_minmax(0,1fr)] lg:gap-14">
        <nav className="hidden lg:block">
          <ul className="sticky top-8 space-y-0.5">
            {sections.map((s) => {
              const hasErr = Object.keys(errors).some((k) => FIELD_SECTION[k] === s.id);
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => jump(s.id)}
                    className={cx(
                      "relative flex h-9 w-full items-center gap-2.5 rounded-lg px-3 text-left text-[13px] font-medium transition-colors",
                      active === s.id ? "text-ink" : "text-ink-2 hover:text-ink",
                    )}
                  >
                    {active === s.id && (
                      <motion.span
                        layoutId="form-nav"
                        className="absolute inset-0 rounded-lg bg-surface shadow-sm ring-1 ring-border"
                        transition={{ type: "spring", stiffness: 500, damping: 40 }}
                      />
                    )}
                    <s.icon className={cx("relative size-4", active === s.id ? "text-accent" : "text-ink-3")} />
                    <span className="relative flex-1">{s.label}</span>
                    {hasErr && <span className="relative size-1.5 rounded-full bg-rose-500" />}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="space-y-6">
          {/* ------------------------------ Basics ------------------------------ */}
          <FormSection id="basics" title="Basics" description="What it is and why people should come.">
            <div className="space-y-5">
              <CoverField
                cover={v.cover_image}
                name={v.name}
                category={v.category}
                onChange={(c, t) => {
                  set("cover_image", c);
                  set("cover_thumb", t);
                }}
              />
              <Field label="Event name" required>
                <Input value={v.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Holiday Open House" aria-invalid={!!err("name")} className={errRing(err("name"))} />
                <FieldError msg={err("name")} />
              </Field>
              <Field label="Short tagline" hint={<Counter n={v.tagline.length} max={120} />}>
                <Input value={v.tagline} onChange={(e) => set("tagline", e.target.value)} placeholder="One line shown on cards and lists" className={errRing(err("tagline"))} />
                <FieldError msg={err("tagline")} />
              </Field>
              <DescriptionEditor value={v.description} onChange={(s) => set("description", s)} />
              <div className="grid gap-5 sm:grid-cols-2">
                <Field label="Category">
                  {newCat == null ? (
                    <Select
                      value={v.category}
                      onChange={(e) => (e.target.value === "__new" ? setNewCat("") : set("category", e.target.value))}
                    >
                      <option value="">None</option>
                      {cats.map((c) => (
                        <option key={c}>{c}</option>
                      ))}
                      <option value="__new">+ Add a category…</option>
                    </Select>
                  ) : (
                    <div className="flex gap-2">
                      <Input autoFocus value={newCat} onChange={(e) => setNewCat(e.target.value)} placeholder="New category" />
                      <Button
                        type="button"
                        variant="soft"
                        onClick={() => {
                          const c = newCat.trim();
                          if (c) {
                            setCats((cs) => [...new Set([...cs, c])].sort());
                            set("category", c);
                          }
                          setNewCat(null);
                        }}
                      >
                        Add
                      </Button>
                    </div>
                  )}
                </Field>
                <Field label="Language">
                  <Input value={v.language} onChange={(e) => set("language", e.target.value)} placeholder="e.g. English, Spanish" />
                </Field>
              </div>
              <Field label="Tags" hint="Press Enter or comma to add.">
                <TagInput value={v.tags} onChange={(t) => set("tags", t)} placeholder="community, family…" />
              </Field>
              <div className="grid gap-5 sm:grid-cols-2">
                <Field label="Status" required>
                  <Select value={v.status} onChange={(e) => set("status", e.target.value as EventStatus)}>
                    {EVENT_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {EVENT_STATUS[s].label}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Visibility" required hint="Shareable only matters if public pages are added later.">
                  <Segmented
                    value={v.visibility}
                    onChange={(x) => set("visibility", x)}
                    options={[
                      { value: "internal", label: "Internal only" },
                      { value: "shareable", label: "Shareable" },
                    ]}
                  />
                </Field>
              </div>
              <Reveal show={v.status === "postponed" || v.status === "cancelled"}>
                <Field label={v.status === "cancelled" ? "Why was it cancelled?" : "Why was it postponed?"} hint="Shown as a banner on the event page.">
                  <Textarea value={v.status_reason} onChange={(e) => set("status_reason", e.target.value)} className="min-h-20" />
                </Field>
              </Reveal>
            </div>
          </FormSection>

          {/* ---------------------------- Date & time --------------------------- */}
          <FormSection id="datetime" title="Date & time" description={`All times are in ${v.time_zone.replace(/_/g, " ")}.`}>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Starts" required>
                <Input type="datetime-local" value={v.start_local} onChange={(e) => set("start_local", e.target.value)} className={errRing(err("start_local"))} />
                <FieldError msg={err("start_local")} />
              </Field>
              <Field label="Ends">
                <Input type="datetime-local" value={v.end_local} min={v.start_local} onChange={(e) => set("end_local", e.target.value)} className={errRing(err("end_local"))} />
                <FieldError msg={err("end_local")} />
              </Field>
              <Field label="Time zone" required>
                <Select value={v.time_zone} onChange={(e) => set("time_zone", e.target.value)}>
                  {zones.map((z) => (
                    <option key={z} value={z}>
                      {z.replace(/_/g, " ")}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Doors open">
                <Input type="datetime-local" value={v.doors_local} onChange={(e) => set("doors_local", e.target.value)} />
              </Field>
              <Field label="RSVP deadline" hint="Callers see a warning after it passes.">
                <Input type="datetime-local" value={v.rsvp_deadline_local} onChange={(e) => set("rsvp_deadline_local", e.target.value)} />
              </Field>
              <Field label="Repeats">
                <Select value={v.recurrence} onChange={(e) => set("recurrence", e.target.value as EventInput["recurrence"])}>
                  <option value="none">Doesn’t repeat</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                  <option value="custom">Custom</option>
                </Select>
              </Field>
            </div>
            <Reveal show={!eventId && (v.recurrence === "weekly" || v.recurrence === "monthly")}>
              <div className="mt-5 flex flex-wrap items-center gap-3 rounded-2xl bg-accent-soft/60 px-4 py-3 text-sm">
                Create
                <Input
                  type="number"
                  min={1}
                  max={52}
                  value={v.occurrences}
                  onChange={(e) => set("occurrences", Number(e.target.value))}
                  className="h-9 w-20"
                />
                occurrences. Each one becomes its own event with its own call list and attendance.
              </div>
            </Reveal>
            <Reveal show={v.recurrence === "custom"}>
              <p className="mt-4 text-sm text-ink-2">
                For a custom schedule, create this event, then use <span className="font-medium">Duplicate</span> on the event page for each date.
              </p>
            </Reveal>
          </FormSection>

          {/* ----------------------------- Location ----------------------------- */}
          <FormSection id="location" title="Location">
            <div className="space-y-5">
              <Field label="Type" required>
                <Segmented
                  value={v.location_type}
                  onChange={(x) => set("location_type", x)}
                  options={[
                    { value: "in_person", label: "In person" },
                    { value: "online", label: "Online" },
                    { value: "hybrid", label: "Hybrid" },
                  ]}
                />
              </Field>
              <Reveal show={inPerson}>
                <div className="grid gap-5 sm:grid-cols-6">
                  <Field label="Venue name" required className="sm:col-span-4">
                    <Input value={v.venue_name} onChange={(e) => set("venue_name", e.target.value)} className={errRing(err("venue_name"))} />
                    <FieldError msg={err("venue_name")} />
                  </Field>
                  <Field label="Room / floor / suite" className="sm:col-span-2">
                    <Input value={v.room} onChange={(e) => set("room", e.target.value)} />
                  </Field>
                  <Field label="Street address" required className="sm:col-span-6">
                    <Input value={v.street} onChange={(e) => set("street", e.target.value)} className={errRing(err("street"))} />
                    <FieldError msg={err("street")} />
                  </Field>
                  <Field label="City" required className="sm:col-span-3">
                    <Input value={v.city} onChange={(e) => set("city", e.target.value)} className={errRing(err("city"))} />
                    <FieldError msg={err("city")} />
                  </Field>
                  <Field label="State" className="sm:col-span-1">
                    <Input value={v.state} maxLength={2} onChange={(e) => set("state", e.target.value.toUpperCase())} />
                  </Field>
                  <Field label="ZIP" className="sm:col-span-2">
                    <Input value={v.zip} onChange={(e) => set("zip", e.target.value)} />
                  </Field>
                  {address && (
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-accent hover:underline sm:col-span-6"
                    >
                      Preview map link <ExternalLink className="size-3" />
                    </a>
                  )}
                </div>
              </Reveal>
              <Reveal show={online}>
                <div className="grid gap-5 sm:grid-cols-2">
                  <Field label="Online meeting link" required className="sm:col-span-2">
                    <Input type="url" value={v.online_url} onChange={(e) => set("online_url", e.target.value)} placeholder="https://zoom.us/j/…" className={errRing(err("online_url"))} />
                    <FieldError msg={err("online_url")} />
                  </Field>
                  <Field label="Meeting ID">
                    <Input value={v.online_meeting_id} onChange={(e) => set("online_meeting_id", e.target.value)} />
                  </Field>
                  <Field label="Passcode">
                    <Input value={v.online_passcode} onChange={(e) => set("online_passcode", e.target.value)} />
                  </Field>
                </div>
              </Reveal>
              <Reveal show={inPerson}>
                <div className="grid gap-5 sm:grid-cols-2">
                  <Field label="Parking">
                    <Textarea value={v.parking_info} onChange={(e) => set("parking_info", e.target.value)} className="min-h-20" />
                  </Field>
                  <Field label="Directions / how to find us">
                    <Textarea value={v.directions} onChange={(e) => set("directions", e.target.value)} className="min-h-20" />
                  </Field>
                  <Field label="Accessibility" className="sm:col-span-2">
                    <Textarea value={v.accessibility} onChange={(e) => set("accessibility", e.target.value)} className="min-h-20" placeholder="Wheelchair access, elevators, etc." />
                  </Field>
                </div>
              </Reveal>
            </div>
          </FormSection>

          {/* ------------------------------ People ------------------------------ */}
          <FormSection id="people" title="People">
            <div className="space-y-6">
              <div className="grid gap-5 sm:grid-cols-2">
                <Field label="Hosts" required hint="Pick a team member or type an organization name.">
                  <TagInput value={v.hosts} onChange={(x) => set("hosts", x)} suggestions={userNames} placeholder="Add a host" invalid={!!err("hosts")} />
                  <FieldError msg={err("hosts")} />
                </Field>
                <Field label="Co-hosts">
                  <TagInput value={v.cohosts} onChange={(x) => set("cohosts", x)} suggestions={userNames} placeholder="Add a co-host" />
                </Field>
              </div>
              <div>
                <Subhead>Event contact</Subhead>
                <div className="grid gap-5 sm:grid-cols-3">
                  <Field label="Name">
                    <Input value={v.contact_name} onChange={(e) => set("contact_name", e.target.value)} />
                  </Field>
                  <Field label="Phone">
                    <Input type="tel" value={v.contact_phone} onChange={(e) => set("contact_phone", e.target.value)} />
                  </Field>
                  <Field label="Email">
                    <Input type="email" value={v.contact_email} onChange={(e) => set("contact_email", e.target.value)} className={errRing(err("contact_email"))} />
                    <FieldError msg={err("contact_email")} />
                  </Field>
                </div>
              </div>
              <div>
                <Subhead>Speakers & performers</Subhead>
                <Repeater<Speaker>
                  items={v.speakers}
                  onChange={(x) => set("speakers", x)}
                  blank={() => ({ name: "", title: "", bio: "", photo: "" })}
                  addLabel="Add speaker"
                  render={(s, up) => (
                    <div className="flex gap-4">
                      <ImageSlot value={s.photo} onChange={(photo) => up({ photo })} round label="Photo" />
                      <div className="grid flex-1 gap-3 sm:grid-cols-2">
                        <Input value={s.name} onChange={(e) => up({ name: e.target.value })} placeholder="Name" />
                        <Input value={s.title} onChange={(e) => up({ title: e.target.value })} placeholder="Title or organization" />
                        <Textarea value={s.bio} onChange={(e) => up({ bio: e.target.value })} placeholder="Short bio" className="min-h-16 sm:col-span-2" />
                      </div>
                    </div>
                  )}
                />
              </div>
              <div>
                <Subhead>Sponsors</Subhead>
                <Repeater<Sponsor>
                  items={v.sponsors}
                  onChange={(x) => set("sponsors", x)}
                  blank={() => ({ name: "", logo: "", url: "" })}
                  addLabel="Add sponsor"
                  render={(s, up) => (
                    <div className="flex items-center gap-4">
                      <ImageSlot value={s.logo} onChange={(logo) => up({ logo })} label="Logo" />
                      <div className="grid flex-1 gap-3 sm:grid-cols-2">
                        <Input value={s.name} onChange={(e) => up({ name: e.target.value })} placeholder="Sponsor name" />
                        <Input type="url" value={s.url} onChange={(e) => up({ url: e.target.value })} placeholder="https://" />
                      </div>
                    </div>
                  )}
                />
              </div>
              <div className="grid gap-6 sm:grid-cols-2">
                <StaffPicker label="Assigned callers" users={users} value={v.callers} onChange={(x) => set("callers", x)} />
                <StaffPicker label="Assigned sign-in staff" users={users} value={v.signin_staff} onChange={(x) => set("signin_staff", x)} />
              </div>
            </div>
          </FormSection>

          {/* ------------------------- Capacity & rules ------------------------- */}
          <FormSection id="rules" title="Capacity, tickets & rules">
            <div className="space-y-5">
              <div className="grid gap-5 sm:grid-cols-2">
                <Field label="Capacity" hint="Callers see “At capacity” when confirmations reach this.">
                  <Input inputMode="numeric" value={v.capacity} onChange={(e) => set("capacity", e.target.value.replace(/\D/g, ""))} placeholder="No limit" className={errRing(err("capacity"))} />
                  <FieldError msg={err("capacity")} />
                </Field>
                <Field label="Age restriction">
                  <Segmented
                    value={v.age_restriction}
                    onChange={(x) => set("age_restriction", x)}
                    options={[
                      { value: "all", label: "All ages" },
                      { value: "18+", label: "18+" },
                      { value: "21+", label: "21+" },
                    ]}
                  />
                </Field>
              </div>
              <Field label="Admission">
                <Segmented
                  value={v.admission}
                  onChange={(x) => set("admission", x)}
                  options={[
                    { value: "free", label: "Free" },
                    { value: "paid", label: "Paid" },
                  ]}
                />
              </Field>
              <Reveal show={v.admission === "paid"}>
                <div className="space-y-2">
                  <Subhead>Price tiers</Subhead>
                  <Repeater<PriceTier>
                    items={v.price_tiers}
                    onChange={(x) => set("price_tiers", x)}
                    blank={() => ({ name: "", amount: "" })}
                    addLabel="Add tier"
                    render={(t, up) => (
                      <div className="grid gap-3 sm:grid-cols-[1fr_160px]">
                        <Input value={t.name} onChange={(e) => up({ name: e.target.value })} placeholder="General, VIP…" />
                        <div className="relative">
                          <span className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-sm text-ink-3">$</span>
                          <Input value={t.amount} onChange={(e) => up({ amount: e.target.value })} placeholder="25" className="pl-7" />
                        </div>
                      </div>
                    )}
                  />
                  <FieldError msg={err("price_tiers")} />
                </div>
              </Reveal>
              <Field label="Ticket / registration link">
                <Input type="url" value={v.ticket_url} onChange={(e) => set("ticket_url", e.target.value)} placeholder="https://" />
              </Field>
              <div className="grid gap-5 sm:grid-cols-3">
                <Field label="Dress code">
                  <Input value={v.dress_code} onChange={(e) => set("dress_code", e.target.value)} />
                </Field>
                <Field label="What to bring">
                  <Input value={v.what_to_bring} onChange={(e) => set("what_to_bring", e.target.value)} />
                </Field>
                <Field label="Food & drinks">
                  <Input value={v.food_drinks} onChange={(e) => set("food_drinks", e.target.value)} placeholder="Dinner provided" />
                </Field>
              </div>
              <div className="flex flex-wrap items-center gap-5 rounded-2xl bg-surface-2/60 px-4 py-3">
                <Toggle checked={!!v.plus_ones_allowed} onChange={(x) => set("plus_ones_allowed", x ? 1 : 0)} label="Plus-ones allowed" />
                <AnimatePresence>
                  {!!v.plus_ones_allowed && (
                    <motion.label initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} className="flex items-center gap-2 text-sm text-ink-2">
                      up to
                      <Input type="number" min={1} max={10} value={v.max_guests || 1} onChange={(e) => set("max_guests", Number(e.target.value))} className="h-9 w-16" />
                      guests per person
                    </motion.label>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </FormSection>

          {/* ------------------------------ Agenda ------------------------------ */}
          <FormSection id="agenda" title="Agenda" description="The run of show, shown as a timeline on the event page.">
            <Repeater<AgendaItem>
              items={v.agenda}
              onChange={(x) => set("agenda", x)}
              blank={() => ({ time: "", title: "", description: "", speaker: "" })}
              addLabel="Add agenda item"
              render={(a, up) => (
                <div className="grid gap-3 sm:grid-cols-[120px_1fr_1fr]">
                  <Input value={a.time} onChange={(e) => up({ time: e.target.value })} placeholder="6:00 PM" />
                  <Input value={a.title} onChange={(e) => up({ title: e.target.value })} placeholder="What’s happening" />
                  <Input value={a.speaker} onChange={(e) => up({ speaker: e.target.value })} placeholder="Speaker (optional)" list="speaker-names" />
                  <Input value={a.description} onChange={(e) => up({ description: e.target.value })} placeholder="Details (optional)" className="sm:col-span-3" />
                </div>
              )}
            />
            <datalist id="speaker-names">
              {v.speakers.map((s, i) => s.name && <option key={i} value={s.name} />)}
            </datalist>
          </FormSection>

          {/* -------------------------- Images & files -------------------------- */}
          <FormSection id="media" title="Images & files" description="Images up to 10 MB, PDFs up to 25 MB.">
            <div className="space-y-6">
              <div>
                <Subhead>Flyer</Subhead>
                <SingleFile value={v.flyer} onChange={(x) => set("flyer", x)} label="Flyer" />
              </div>
              <div>
                <Subhead>Venue photos</Subhead>
                <ImageGrid value={v.venue_photos} onChange={(x) => set("venue_photos", x)} />
              </div>
              <div>
                <Subhead>Post-event gallery</Subhead>
                <ImageGrid value={v.gallery} onChange={(x) => set("gallery", x)} />
              </div>
              <div>
                <Subhead>Other attachments</Subhead>
                <Attachments value={v.attachments} onChange={(x) => set("attachments", x)} />
              </div>
            </div>
          </FormSection>

          {/* ------------------------------- Links ------------------------------ */}
          <FormSection id="links" title="Links">
            <div className="space-y-5">
              <div className="grid gap-5 sm:grid-cols-2">
                <Field label="Event website">
                  <Input type="url" value={v.website_url} onChange={(e) => set("website_url", e.target.value)} placeholder="https://" />
                </Field>
                <Field label="Facebook event">
                  <Input type="url" value={v.facebook_url} onChange={(e) => set("facebook_url", e.target.value)} placeholder="https://facebook.com/events/…" />
                </Field>
              </div>
              <div>
                <Subhead>Other social links</Subhead>
                <Repeater<LinkItem>
                  items={v.social_links}
                  onChange={(x) => set("social_links", x)}
                  blank={() => ({ label: "", url: "" })}
                  addLabel="Add link"
                  render={(l, up) => (
                    <div className="grid gap-3 sm:grid-cols-[180px_1fr]">
                      <Input value={l.label} onChange={(e) => up({ label: e.target.value })} placeholder="Instagram" list="social-labels" />
                      <Input type="url" value={l.url} onChange={(e) => up({ url: e.target.value })} placeholder="https://" />
                    </div>
                  )}
                />
                <datalist id="social-labels">
                  {["Instagram", "LinkedIn", "X / Twitter", "TikTok", "YouTube", "Eventbrite"].map((s) => (
                    <option key={s} value={s} />
                  ))}
                </datalist>
              </div>
            </div>
          </FormSection>

          {/* ----------------------------- Internal ----------------------------- */}
          <FormSection id="internal" title="Internal" description="Only logged-in team members see these.">
            <div className="space-y-5">
              <Field label="Caller script / talking points" hint="Shown in the caller workspace while calling.">
                <Textarea value={v.caller_script} onChange={(e) => set("caller_script", e.target.value)} className="min-h-32" />
              </Field>
              <Field label="Sign-in instructions" hint="Shown on the event-day screen.">
                <Textarea value={v.signin_instructions} onChange={(e) => set("signin_instructions", e.target.value)} placeholder="Hand everyone a name tag" />
              </Field>
              <Field label="Internal notes">
                <Textarea value={v.internal_notes} onChange={(e) => set("internal_notes", e.target.value)} />
              </Field>
            </div>
          </FormSection>

          {/* ----------------------------- Call list ---------------------------- */}
          {!eventId && (
            <FormSection id="calllist" title="Build the call list" description="Who should callers reach out to? You can add more people later.">
              <CallListBuilder eventId={null} value={filter} onChange={setFilter} pastEvents={pastEvents} />
            </FormSection>
          )}
        </div>
      </div>

      {/* Save bar */}
      <motion.div
        initial={{ y: 80, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: "spring", stiffness: 300, damping: 30, delay: 0.2 }}
        className="fixed inset-x-0 bottom-0 z-40 lg:left-64"
      >
        <div className="mx-auto mb-4 flex max-w-3xl items-center gap-3 rounded-2xl bg-surface/90 px-4 py-3 shadow-[var(--shadow-lift)] ring-1 ring-border backdrop-blur sm:mx-auto sm:px-5">
          <span className="hidden flex-1 text-sm text-ink-2 sm:block">
            <AnimatePresence mode="wait">
              {Object.keys(errors).length ? (
                <motion.span key="err" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-rose-600">
                  {Object.keys(errors).length} {Object.keys(errors).length === 1 ? "field needs" : "fields need"} attention
                </motion.span>
              ) : dirty ? (
                <motion.span key="dirty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  Unsaved changes
                </motion.span>
              ) : (
                <motion.span key="clean" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="inline-flex items-center gap-1.5 text-ink-3">
                  <Check className="size-3.5" /> {eventId ? "No changes" : "Fill in the essentials to create"}
                </motion.span>
              )}
            </AnimatePresence>
          </span>
          <Link
            href={eventId ? `/events/${eventId}` : "/events"}
            className="inline-flex h-10 flex-1 items-center justify-center rounded-xl px-4 text-sm font-medium text-ink-2 hover:bg-surface-2 sm:flex-none"
          >
            Cancel
          </Link>
          <Button variant="primary" onClick={submit} loading={pending} className="flex-1 sm:flex-none" icon={!eventId ? <Plus className="size-4" /> : undefined}>
            {eventId ? "Save changes" : v.recurrence !== "none" && v.recurrence !== "custom" && v.occurrences > 1 ? `Create ${v.occurrences} events` : "Create event"}
          </Button>
        </div>
      </motion.div>
    </div>
  );
}

/* --------------------------------- Helpers -------------------------------- */

function FormSection({ id, title, description, children }: { id: string; title: string; description?: string; children: ReactNode }) {
  return (
    <motion.section
      id={id}
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="scroll-mt-8 rounded-3xl bg-surface p-6 ring-1 ring-border sm:p-8"
    >
      <div className="mb-6">
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-ink-2">{description}</p>}
      </div>
      {children}
    </motion.section>
  );
}

function Reveal({ show, children }: { show: boolean; children: ReactNode }) {
  return (
    <AnimatePresence initial={false}>
      {show && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ type: "spring", stiffness: 380, damping: 36 }}
          className="overflow-hidden"
        >
          <div className="pt-1">{children}</div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Subhead({ children }: { children: ReactNode }) {
  return <h3 className="mb-3 text-[13px] font-medium text-ink-2">{children}</h3>;
}

function FieldError({ msg }: { msg?: string }) {
  return (
    <AnimatePresence>
      {msg && (
        <motion.span
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          className="mt-1.5 block text-xs text-rose-600"
        >
          {msg}
        </motion.span>
      )}
    </AnimatePresence>
  );
}

function errRing(msg?: string) {
  return msg ? "ring-rose-300 focus:ring-rose-400" : undefined;
}

function Counter({ n, max }: { n: number; max: number }) {
  return <span className={cx("tabular-nums", n > max && "text-rose-600")}>{n} / {max}</span>;
}

function StaffPicker({
  label,
  users,
  value,
  onChange,
}: {
  label: string;
  users: UserOpt[];
  value: number[];
  onChange: (v: number[]) => void;
}) {
  return (
    <div>
      <Subhead>{label}</Subhead>
      <div className="flex flex-wrap gap-2">
        {users.map((u) => {
          const on = value.includes(u.id);
          return (
            <motion.button
              key={u.id}
              type="button"
              whileTap={{ scale: 0.95 }}
              onClick={() => onChange(on ? value.filter((x) => x !== u.id) : [...value, u.id])}
              className={cx(
                "inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium ring-1 transition-colors",
                on ? "bg-accent text-white ring-accent" : "bg-surface text-ink-2 ring-border hover:text-ink",
              )}
            >
              {on && <Check className="size-3.5" />}
              {u.name}
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}

function DescriptionEditor({ value, onChange }: { value: string; onChange: (s: string) => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [mode, setMode] = useState<"write" | "preview">("write");

  const wrap = (before: string, after = before, placeholder = "text") => {
    const el = ref.current;
    if (!el) return;
    const { selectionStart: s, selectionEnd: e } = el;
    const sel = value.slice(s, e) || placeholder;
    onChange(value.slice(0, s) + before + sel + after + value.slice(e));
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(s + before.length, s + before.length + sel.length);
    });
  };
  const bullet = () => {
    const el = ref.current;
    if (!el) return;
    const s = value.lastIndexOf("\n", el.selectionStart - 1) + 1;
    onChange(value.slice(0, s) + "- " + value.slice(s));
    requestAnimationFrame(() => el.focus());
  };

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-[13px] font-medium text-ink-2">Full description</span>
        <Segmented
          value={mode}
          onChange={setMode}
          options={[
            { value: "write", label: "Write" },
            { value: "preview", label: "Preview" },
          ]}
        />
      </div>
      <div className="overflow-hidden rounded-xl ring-1 ring-border focus-within:ring-2 focus-within:ring-accent">
        {mode === "write" ? (
          <>
            <div className="flex gap-0.5 border-b border-border bg-surface-2/60 px-2 py-1">
              <ToolButton label="Bold" onClick={() => wrap("**")}>
                <Bold className="size-4" />
              </ToolButton>
              <ToolButton label="Bulleted list" onClick={() => bullet()}>
                <List className="size-4" />
              </ToolButton>
              <ToolButton label="Link" onClick={() => wrap("[", "](https://)", "link text")}>
                <Link2 className="size-4" />
              </ToolButton>
            </div>
            <textarea
              ref={ref}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              placeholder="What the event is and why to come. **Bold**, - lists, and [links](https://) work."
              className="block min-h-40 w-full resize-y bg-surface px-3.5 py-3 text-sm leading-relaxed outline-none placeholder:text-ink-3"
            />
          </>
        ) : (
          <div
            className="prose-lite min-h-[12.5rem] bg-surface px-4 py-3 text-[15px] leading-relaxed text-ink-2"
            dangerouslySetInnerHTML={{ __html: value ? renderMarkdown(value) : "<p class='text-ink-3'>Nothing to preview yet.</p>" }}
          />
        )}
      </div>
    </div>
  );
}

function ToolButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      title={label}
      onClick={onClick}
      className="flex size-8 items-center justify-center rounded-lg text-ink-2 hover:bg-surface hover:text-ink"
    >
      {children}
    </button>
  );
}
