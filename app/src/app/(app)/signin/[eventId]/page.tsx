import { Suspense } from "react";
import Loading from "./loading";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getEvent } from "@/lib/queries";
import { getSignInRows } from "./data";
import { SignInScreen, type SignInEvent } from "./sign-in-screen";

async function SignInEventContent(props: PageProps<"/signin/[eventId]">) {
  await requireUser(["signin"]);
  const { eventId } = await props.params;
  const event = await getEvent(Number(eventId));
  if (!event) notFound();
  const info: SignInEvent = {
    id: event.id,
    name: event.name,
    start_at: event.start_at,
    end_at: event.end_at,
    time_zone: event.time_zone,
    venue_name: event.venue_name,
    status: event.status,
    signin_instructions: event.signin_instructions,
    plus_ones_allowed: event.plus_ones_allowed,
    max_guests: event.max_guests,
  };
  return <SignInScreen key={event.id} event={info} initialRows={await getSignInRows(event.id)} />;
}

export default function SignInEventPage(props: PageProps<"/signin/[eventId]">) {
  return (
    <Suspense fallback={<Loading />}>
      <SignInEventContent {...props} />
    </Suspense>
  );
}
