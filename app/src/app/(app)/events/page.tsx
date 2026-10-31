import { requireUser } from "@/lib/auth";
import { listEvents } from "@/lib/queries";
import { EventsBrowser, type EventCardData } from "./events-browser";

export default async function EventsPage() {
  const user = await requireUser();
  const events: EventCardData[] = (await listEvents({ includeArchived: true })).map((e) => ({
    id: e.id,
    name: e.name,
    tagline: e.tagline,
    category: e.category,
    tags: e.tags,
    status: e.status,
    start_at: e.start_at,
    time_zone: e.time_zone,
    venue_name: e.venue_name,
    city: e.city,
    location_type: e.location_type,
    cover: e.cover_thumb || e.cover_image,
    archived: !!e.archived_at,
    capacity: e.capacity,
    stats: e.stats,
  }));
  return <EventsBrowser events={events} isAdmin={user.role === "admin"} />;
}
