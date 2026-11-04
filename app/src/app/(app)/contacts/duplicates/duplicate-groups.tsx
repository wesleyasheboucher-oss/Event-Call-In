"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { ArrowRight, Check, GitMerge, Users } from "lucide-react";
import { toast } from "sonner";
import { markNotDuplicates, mergeContacts } from "@/app/actions/duplicates";
import type { DupContact, DupGroup } from "@/lib/duplicates";
import { planMerge, type ExistingContact } from "@/lib/import";
import { formatPhone } from "@/lib/phone";
import { Button, Card, cx, EmptyState } from "@/components/ui";

const SOURCE: Record<string, string> = { import: "Imported", walk_in: "Walk-in", manual: "Added manually", guest: "Came as a guest", signup: "Signed up online" };

/** What the kept contact looks like after merging the others into it (same rules as the server). */
function preview(keep: DupContact, others: DupContact[]): DupContact {
  let result = { ...keep };
  for (const o of others) {
    result = { ...result, ...planMerge(result as unknown as ExistingContact, { ...o, active: null }, "merge") };
  }
  return result;
}

type Filter = "all" | "strong" | "check";

export function DuplicateGroups({ groups }: { groups: DupGroup[] }) {
  const [done, setDone] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<Filter>("all");
  const keyOf = (g: DupGroup) => g.contacts.map((c) => c.id).join("-");
  const open = groups.filter((g) => !done.has(keyOf(g)));
  const shown = open.filter((g) => filter === "all" || (filter === "strong" ? g.strong : !g.strong));
  const counts = { all: open.length, strong: open.filter((g) => g.strong).length, check: open.filter((g) => !g.strong).length };

  if (!open.length) {
    return (
      <Card className="p-0">
        <EmptyState
          icon={<Users className="size-5" />}
          title="No duplicates found"
          body="Nobody seems to be in Contacts twice. This checks phone numbers, emails and names, ignoring capitalization, accents and small typos."
        />
      </Card>
    );
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-2">
        {(
          [
            ["all", "All"],
            ["strong", "Same phone, email or name"],
            ["check", "Worth a look"],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setFilter(k)}
            className={cx(
              "inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-medium ring-1 transition-colors ring-inset",
              filter === k ? "bg-ink text-white ring-ink" : "bg-surface text-ink-2 ring-border hover:text-ink",
            )}
          >
            {label} <span className={cx("tabular-nums", filter === k ? "text-white/70" : "text-ink-3")}>{counts[k]}</span>
          </button>
        ))}
      </div>
      <div className="space-y-4">
        {shown.slice(0, 60).map((g) => (
          <GroupCard key={keyOf(g)} group={g} onDone={() => setDone((d) => new Set(d).add(keyOf(g)))} />
        ))}
        {shown.length > 60 && (
          <p className="text-center text-sm text-ink-3">Showing 60 of {shown.length}. Work through these and the rest will appear.</p>
        )}
      </div>
    </div>
  );
}

function GroupCard({ group, onDone }: { group: DupGroup; onDone: () => void }) {
  const [keepId, setKeepId] = useState(group.contacts[0].id);
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<"merge" | "dismiss" | null>(null);
  const keep = group.contacts.find((c) => c.id === keepId)!;
  const others = group.contacts.filter((c) => c.id !== keepId);
  const merged = useMemo(() => preview(keep, others), [keep, others]);
  const reasons = [...new Set(group.pairs.flatMap((p) => p.reasons))];

  const act = (kind: "merge" | "dismiss") => {
    setBusy(kind);
    startTransition(async () => {
      try {
        if (kind === "merge") {
          await mergeContacts(keepId, others.map((o) => o.id));
          toast.success(`Merged into ${keep.first_name} ${keep.last_name}.`);
        } else {
          await markNotDuplicates(group.contacts.map((c) => c.id));
          toast.success("Got it. They won't be suggested again.");
        }
        onDone();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Something went wrong. Please try again.");
      } finally {
        setBusy(null);
      }
    });
  };

  return (
    <Card className="p-0">
      <div className="flex flex-wrap items-center gap-1.5 border-b border-border px-5 py-3">
        {reasons.map((r) => (
          <span
            key={r}
            className={cx(
              "rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset",
              r.startsWith("Different") ? "bg-amber-50 text-amber-800 ring-amber-200" : "bg-sky-50 text-sky-700 ring-sky-200",
            )}
          >
            {r}
          </span>
        ))}
      </div>

      <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
        {group.contacts.map((c) => {
          const on = c.id === keepId;
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => setKeepId(c.id)}
              aria-pressed={on}
              className={cx(
                "relative rounded-xl p-3.5 text-left ring-1 transition-all",
                on ? "bg-accent-soft/40 ring-2 ring-accent" : "bg-surface-2 ring-border hover:ring-border-strong",
              )}
            >
              <span
                className={cx(
                  "absolute top-3 right-3 flex size-5 items-center justify-center rounded-full ring-1",
                  on ? "bg-accent text-white ring-accent" : "bg-surface ring-border",
                )}
              >
                {on && <Check className="size-3" strokeWidth={3} />}
              </span>
              <span className="block pr-7 font-medium text-ink">
                {c.first_name} {c.last_name}
              </span>
              <span className="mt-1 block space-y-0.5 text-[13px] text-ink-2 tabular-nums">
                {[c.phone, c.alt_phone].filter(Boolean).map((p) => (
                  <span key={p} className="block">
                    {formatPhone(p)}
                  </span>
                ))}
                {!c.phone && !c.alt_phone && <span className="block text-ink-3">No phone</span>}
                <span className="block truncate">{c.email || <span className="text-ink-3">No email</span>}</span>
              </span>
              <span className="mt-2 block text-xs text-ink-3">
                {c.events_count} event{c.events_count === 1 ? "" : "s"}
                {c.attended_count > 0 && ` · ${c.attended_count} attended`} · {SOURCE[c.source] ?? c.source}
              </span>
              <span className="mt-2 block text-xs font-medium text-accent">{on ? "Keeping this one" : "Keep this one instead"}</span>
            </button>
          );
        })}
      </div>

      <div className="mx-4 mb-4 rounded-xl bg-surface p-3.5 text-[13px] ring-1 ring-border">
        <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-ink-3 uppercase">
          <ArrowRight className="size-3" /> After merging
        </div>
        <div className="grid gap-x-6 gap-y-0.5 sm:grid-cols-2">
          <Row label="Name" value={`${merged.first_name} ${merged.last_name}`} />
          <Row label="Phone" value={formatPhone(merged.phone) || "—"} changed={merged.phone !== keep.phone} />
          <Row label="2nd phone" value={formatPhone(merged.alt_phone) || "—"} changed={merged.alt_phone !== keep.alt_phone} />
          <Row label="Email" value={merged.email || "—"} changed={merged.email !== keep.email} />
          {merged.notes !== keep.notes && <Row label="Notes" value={`Adds: ${merged.notes.slice(keep.notes.length).trim().replace(/\n/g, " · ")}`} changed />}
        </div>
        <p className="mt-2 text-xs text-ink-3">
          Events, call notes and tags from {others.length === 1 ? "the other contact" : "the others"} move to this one. Nothing is deleted.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-3">
        <Link href={`/contacts?c=${keepId}`} target="_blank" className="text-[13px] text-ink-2 hover:text-ink">
          Open contact
        </Link>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={() => act("dismiss")} loading={busy === "dismiss"} disabled={pending}>
            Not duplicates
          </Button>
          <Button variant="primary" size="sm" icon={<GitMerge className="size-3.5" />} onClick={() => act("merge")} loading={busy === "merge"} disabled={pending}>
            Merge {group.contacts.length}
          </Button>
        </div>
      </div>
    </Card>
  );
}

function Row({ label, value, changed }: { label: string; value: string; changed?: boolean }) {
  return (
    <div className="flex gap-2">
      <span className="w-20 shrink-0 text-ink-3">{label}</span>
      <span className={cx("min-w-0 break-words", changed ? "font-medium text-emerald-700" : "text-ink")}>{value}</span>
    </div>
  );
}
