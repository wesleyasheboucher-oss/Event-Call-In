import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getEvent, listCategories } from "@/lib/queries";
import { eventToInput, pastEventOptions, userOptions } from "@/lib/events";
import { EventForm } from "@/components/event-form/event-form";

export default async function EditEventPage(props: PageProps<"/events/[id]/edit">) {
  await requireUser([]);
  const { id } = await props.params;
  const event = await getEvent(Number(id));
  if (!event) notFound();
  const [categories, initial, users, pastEvents] = await Promise.all([
    listCategories(),
    eventToInput(event),
    userOptions(),
    pastEventOptions(),
  ]);
  if (event.category && !categories.includes(event.category)) categories.push(event.category);
  return (
    <EventForm
      eventId={event.id}
      initial={initial}
      categories={categories}
      users={users}
      pastEvents={pastEvents}
    />
  );
}
