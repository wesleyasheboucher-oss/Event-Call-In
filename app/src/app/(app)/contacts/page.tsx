import { Suspense } from "react";
import { requireUser } from "@/lib/auth";
import { listContacts } from "@/lib/queries";
import { listTags } from "@/lib/tags";
import { ContactsView } from "./contacts-view";
import { ContactsSkeleton } from "./skeleton";

async function Contacts() {
  await requireUser(["admin"]);
  const [contacts, tags] = await Promise.all([listContacts(), listTags()]);
  return <ContactsView contacts={contacts} tags={tags} />;
}

export default function ContactsPage() {
  return (
    <Suspense fallback={<ContactsSkeleton />}>
      <Contacts />
    </Suspense>
  );
}
