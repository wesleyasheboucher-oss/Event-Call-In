import { Suspense } from "react";
import { requireUser } from "@/lib/auth";
import { listContacts } from "@/lib/queries";
import { ContactsView } from "./contacts-view";
import { ContactsSkeleton } from "./skeleton";

async function Contacts() {
  await requireUser(["admin"]);
  return <ContactsView contacts={await listContacts()} />;
}

export default function ContactsPage() {
  return (
    <Suspense fallback={<ContactsSkeleton />}>
      <Contacts />
    </Suspense>
  );
}
