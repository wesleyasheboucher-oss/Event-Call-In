import { formatInTimeZone } from "date-fns-tz";
import { requireUser } from "@/lib/auth";
import { listCategories } from "@/lib/queries";
import { pastEventOptions, userOptions } from "@/lib/events";
import { DEFAULT_TZ } from "@/lib/time";
import { EventForm } from "@/components/event-form/event-form";
import type { EventInput } from "@/components/event-form/types";

function blankEvent(hostName: string, userId: number): EventInput {
  // Default to two weeks out at 6 PM.
  const day = formatInTimeZone(new Date(Date.now() + 14 * 864e5), DEFAULT_TZ, "yyyy-MM-dd");
  return {
    name: "", tagline: "", description: "", category: "", tags: [], language: "", status: "draft", status_reason: "",
    start_local: `${day}T18:00`, end_local: `${day}T20:00`, doors_local: "", rsvp_deadline_local: "",
    time_zone: DEFAULT_TZ, recurrence: "none", occurrences: 4,
    location_type: "in_person", venue_name: "", street: "", city: "", state: "", zip: "", room: "", online_url: "",
    online_meeting_id: "", online_passcode: "", parking_info: "", directions: "", accessibility: "",
    hosts: [hostName], cohosts: [], contact_name: "", contact_phone: "", contact_email: "", speakers: [], sponsors: [],
    capacity: "", admission: "free", price_tiers: [], ticket_url: "", age_restriction: "all", dress_code: "",
    what_to_bring: "", food_drinks: "", plus_ones_allowed: 0, max_guests: 0, visibility: "internal", agenda: [],
    cover_image: "", cover_thumb: "", flyer: "", venue_photos: [], gallery: [], attachments: [], website_url: "",
    facebook_url: "", social_links: [], caller_script: "", signin_instructions: "", internal_notes: "",
    callers: [userId], signin_staff: [],
  };
}

export default async function NewEventPage() {
  const user = await requireUser([]);
  const [categories, users, pastEvents] = await Promise.all([listCategories(), userOptions(), pastEventOptions()]);
  return (
    <EventForm
      eventId={null}
      initial={blankEvent(user.name, user.id)}
      categories={categories}
      users={users}
      pastEvents={pastEvents}
    />
  );
}
