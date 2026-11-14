import { Suspense } from "react";
import { requireUser } from "@/lib/auth";
import { listTextEvents, listTextTemplates } from "@/lib/text-templates";
import { Page, PageHeader } from "@/components/page";
import { Card } from "@/components/ui";
import { TemplatesView } from "./templates-view";

async function Templates() {
  const user = await requireUser(["admin"]);
  const [templates, events] = await Promise.all([listTextTemplates(), listTextEvents()]);
  return <TemplatesView templates={templates} events={events} me={user.name} />;
}

export default function TextTemplatesPage() {
  return (
    <Page>
      <PageHeader
        title="Text templates"
        description="Ready-made messages callers can send from their own phone. Fill-ins like {first_name} are filled in for each person."
      />
      <Suspense fallback={<Card className="h-64 animate-pulse p-0" />}>
        <Templates />
      </Suspense>
    </Page>
  );
}
