import { redirect } from "next/navigation";

/** Old single-event call list URLs open Call In with that event selected. */
export default async function CallEventRedirect(props: PageProps<"/call/[eventId]">) {
  const { eventId } = await props.params;
  redirect(`/call?e=${Number(eventId) || ""}`);
}
