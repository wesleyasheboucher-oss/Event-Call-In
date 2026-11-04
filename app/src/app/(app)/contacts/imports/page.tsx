import { Suspense } from "react";
import Link from "next/link";
import { ArrowLeft, ChevronRight, FileSpreadsheet, Upload } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { listImports } from "@/lib/imports";
import { fmt } from "@/lib/time";
import { Page, PageHeader } from "@/components/page";
import { Button, Card, EmptyState } from "@/components/ui";

const TZ = "America/New_York";

async function Imports() {
  await requireUser(["admin"]);
  const imports = await listImports();
  if (!imports.length) {
    return (
      <EmptyState
        icon={<FileSpreadsheet className="size-5" />}
        title="No imports yet"
        body="Imports you run from now on are listed here, with every contact added, updated or skipped."
      />
    );
  }
  return (
    <Card className="divide-y divide-border overflow-hidden p-0">
      {imports.map((i) => {
        const counts = [
          { n: i.added, label: "added", tone: "text-emerald-700" },
          { n: i.updated, label: "updated", tone: "text-sky-700" },
          { n: i.skipped + i.in_file, label: "skipped", tone: "text-amber-700" },
          { n: i.errors, label: i.errors === 1 ? "error" : "errors", tone: "text-rose-700" },
        ].filter((c) => c.n > 0);
        return (
          <Link key={i.id} href={`/contacts/imports/${i.id}`} className="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-surface-2">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-ink-2 ring-1 ring-border">
              <FileSpreadsheet className="size-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium text-ink">{i.file_name || "Untitled file"}</span>
              <span className="block text-xs text-ink-3">
                {fmt(i.created_at, TZ, "MMM d, yyyy 'at' h:mm a")}
                {i.user_name && ` · ${i.user_name}`}
                {{ merge: " · Added new info to matches", update: " · Used the file's info for matches", skip: " · Left matches as they were" }[i.mode]}
                {i.tag_name && ` · Tagged “${i.tag_name}”`}
              </span>
              <span className="mt-1 flex flex-wrap gap-x-3 text-[13px] tabular-nums">
                {counts.length ? (
                  counts.map((c) => (
                    <span key={c.label} className={c.tone}>
                      {c.n.toLocaleString()} {c.label}
                    </span>
                  ))
                ) : (
                  <span className="text-ink-3">No rows recorded</span>
                )}
                {i.undone > 0 && <span className="text-ink-3">{i.undone} undone</span>}
              </span>
            </span>
            <ChevronRight className="size-4 shrink-0 text-ink-3" />
          </Link>
        );
      })}
    </Card>
  );
}

export default function ImportsPage() {
  return (
    <Page>
      <PageHeader
        eyebrow={
          <Link href="/contacts" className="inline-flex items-center gap-1 hover:text-ink">
            <ArrowLeft className="size-3.5" /> Contacts
          </Link>
        }
        title="Import history"
        description="Every contacts import, and exactly what it added or changed."
        actions={
          <Link href="/contacts/import">
            <Button variant="secondary" icon={<Upload className="size-4" />}>
              New import
            </Button>
          </Link>
        }
      />
      <Suspense fallback={<Card className="h-40 animate-pulse p-0" />}>
        <Imports />
      </Suspense>
    </Page>
  );
}
