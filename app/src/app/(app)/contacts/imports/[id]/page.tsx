import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getImport } from "@/lib/imports";
import { fmt } from "@/lib/time";
import { Page, PageHeader } from "@/components/page";
import { Card } from "@/components/ui";
import { ImportChanges } from "./import-changes";

async function ImportDetail({ params }: { params: Promise<{ id: string }> }) {
  await requireUser(["admin"]);
  const data = await getImport(Number((await params).id));
  if (!data) notFound();
  const { summary: s, changes } = data;
  return (
    <>
      <PageHeader
        eyebrow={
          <Link href="/contacts/imports" className="inline-flex items-center gap-1 hover:text-ink">
            <ArrowLeft className="size-3.5" /> Import history
          </Link>
        }
        title={s.file_name || "Untitled file"}
        description={
          <>
            {fmt(s.created_at, "America/New_York", "MMM d, yyyy 'at' h:mm a")}
            {s.user_name && ` by ${s.user_name}`}
            {s.mode === "update" ? " · Matching contacts were updated" : " · Matching contacts were left as they were"}
            {s.tag_name && ` · Tagged “${s.tag_name}”`}
          </>
        }
      />
      <ImportChanges summary={s} changes={changes} />
    </>
  );
}

export default function ImportPage(props: PageProps<"/contacts/imports/[id]">) {
  return (
    <Page>
      <Suspense fallback={<Card className="h-64 animate-pulse p-0" />}>
        <ImportDetail params={props.params} />
      </Suspense>
    </Page>
  );
}
