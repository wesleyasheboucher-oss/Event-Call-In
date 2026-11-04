import { Suspense } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { findDuplicateGroups } from "@/lib/duplicates";
import { Page, PageHeader } from "@/components/page";
import { Card } from "@/components/ui";
import { DuplicateGroups } from "./duplicate-groups";

async function Groups() {
  await requireUser(["admin"]);
  return <DuplicateGroups groups={await findDuplicateGroups()} />;
}

export default function DuplicatesPage() {
  return (
    <Page>
      <PageHeader
        eyebrow={
          <Link href="/contacts" className="inline-flex items-center gap-1 hover:text-ink">
            <ArrowLeft className="size-3.5" /> Contacts
          </Link>
        }
        title="Duplicate contacts"
        description="People who are probably in Contacts more than once. Merge them, or mark them as different people."
      />
      <Suspense fallback={<Card className="h-64 animate-pulse p-0" />}>
        <Groups />
      </Suspense>
    </Page>
  );
}
