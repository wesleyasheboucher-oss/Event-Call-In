import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getCallList, getEvent } from "@/lib/queries";
import { CallWorkspace } from "./workspace";

export default async function CallListPage(props: PageProps<"/call/[eventId]">) {
  await requireUser(["caller"]);
  const { eventId } = await props.params;
  const event = await getEvent(Number(eventId));
  if (!event) notFound();
  const rows = await getCallList(event.id);
  return (
    <CallWorkspace
      event={{
        id: event.id,
        name: event.name,
        start_at: event.start_at,
        time_zone: event.time_zone,
        status: event.status,
        capacity: event.capacity,
        rsvp_deadline: event.rsvp_deadline,
        caller_script: event.caller_script,
        plus_ones_allowed: event.plus_ones_allowed,
        max_guests: event.max_guests,
      }}
      initialRows={rows}
    />
  );
}
