"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { ArrowRight, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { undoImportChange } from "@/app/actions/contacts";
import type { ImportAction, ImportChange, ImportSummary } from "@/lib/imports";
import { formatPhone } from "@/lib/phone";
import { Button, Card, cx } from "@/components/ui";

const FIELD_LABEL: Record<string, string> = {
  first_name: "First name",
  last_name: "Last name",
  phone: "Phone",
  alt_phone: "Alt phone",
  email: "Email",
  street: "Street",
  city: "City",
  state: "State",
  zip: "ZIP",
  notes: "Notes",
  training_level: "Training level",
  processing_level: "Processing level",
  fsm_name: "FSM",
  active: "Active",
};

const ACTION: Record<ImportAction, { label: string; chip: string }> = {
  added: { label: "Added", chip: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  updated: { label: "Updated", chip: "bg-sky-50 text-sky-700 ring-sky-200" },
  skipped: { label: "Matched, left as is", chip: "bg-amber-50 text-amber-800 ring-amber-200" },
  in_file: { label: "Repeat in file", chip: "bg-stone-100 text-stone-600 ring-stone-200" },
  error: { label: "Error", chip: "bg-rose-50 text-rose-700 ring-rose-200" },
};

function show(field: string, v: string | number) {
  if (field === "active") return v ? "Yes" : "No";
  if (v === "" || v == null) return "(blank)";
  if (field === "phone" || field === "alt_phone") return formatPhone(String(v));
  return String(v);
}

type Tab = "all" | ImportAction;

/** Every row of one import: what happened, and for updates each field's before → after, with Undo. */
export function ImportChanges({ summary, changes }: { summary: ImportSummary; changes: ImportChange[] }) {
  const [tab, setTab] = useState<Tab>(summary.updated ? "updated" : "all");
  const [query, setQuery] = useState("");
  const [undone, setUndone] = useState<Set<number>>(new Set());
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<number | null>(null);

  const tabs: { key: Tab; label: string; n: number }[] = [
    { key: "all", label: "All rows", n: changes.length },
    { key: "added", label: "Added", n: summary.added },
    { key: "updated", label: "Updated", n: summary.updated },
    { key: "skipped", label: "Matched, left as is", n: summary.skipped },
    { key: "in_file", label: "Repeats in file", n: summary.in_file },
    { key: "error", label: "Errors", n: summary.errors },
  ];

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return changes.filter(
      (c) =>
        (tab === "all" || c.action === tab) &&
        (!q || c.name.toLowerCase().includes(q) || (c.contact_name ?? "").toLowerCase().includes(q) || JSON.stringify(c.changes).includes(q)),
    );
  }, [changes, tab, query]);

  const undo = (c: ImportChange) => {
    setBusy(c.id);
    startTransition(async () => {
      try {
        const res = await undoImportChange(c.id);
        setUndone((s) => new Set(s).add(c.id));
        const label = (ks: string[]) => ks.map((k) => FIELD_LABEL[k] ?? k).join(", ");
        toast.success(
          res.kept.length
            ? `Restored ${label(res.restored) || "nothing"}. Kept ${label(res.kept)}: edited since the import.`
            : `Restored ${label(res.restored)} for ${c.contact_name ?? c.name}.`,
        );
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Couldn't undo that change.");
      } finally {
        setBusy(null);
      }
    });
  };

  if (!changes.length) {
    return (
      <Card className="p-8 text-center text-sm text-ink-2">
        This import finished before row-by-row history was recorded, so there&apos;s nothing to show for it.
      </Card>
    );
  }

  return (
    <div>
      <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] md:mx-0 md:flex-wrap md:px-0">
        {tabs
          .filter((t) => t.key === "all" || t.n > 0)
          .map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={cx(
                "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-medium ring-1 transition-colors ring-inset",
                tab === t.key ? "bg-ink text-white ring-ink" : "bg-surface text-ink-2 ring-border hover:text-ink",
              )}
            >
              {t.label}
              <span className={cx("tabular-nums", tab === t.key ? "text-white/70" : "text-ink-3")}>{t.n.toLocaleString()}</span>
            </button>
          ))}
      </div>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search names, phones or emails"
        className="mb-4 h-10 w-full rounded-xl bg-surface px-3.5 text-sm ring-1 ring-border ring-inset placeholder:text-ink-3 focus:ring-2 focus:ring-accent focus:outline-none sm:max-w-sm"
      />

      <Card className="divide-y divide-border overflow-hidden p-0">
        {shown.length === 0 && <div className="px-5 py-10 text-center text-sm text-ink-3">Nothing here.</div>}
        {shown.map((c) => {
          const fields = Object.keys(c.changes);
          const isUndone = !!c.undone_at || undone.has(c.id);
          const differentName = c.contact_name && c.contact_name.toLowerCase() !== c.name.toLowerCase();
          return (
            <div key={c.id} className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-start sm:gap-4">
              <div className="w-14 shrink-0 pt-0.5 text-xs text-ink-3 tabular-nums">Row {c.row_number}</div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  {c.contact_id ? (
                    <Link href={`/contacts?c=${c.contact_id}`} className="font-medium text-ink hover:text-accent">
                      {c.contact_name ?? c.name}
                    </Link>
                  ) : (
                    <span className="font-medium text-ink">{c.name || "(no name)"}</span>
                  )}
                  <span className={cx("rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset", ACTION[c.action].chip)}>
                    {ACTION[c.action].label}
                  </span>
                  {isUndone && (
                    <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[11px] font-medium text-stone-600 ring-1 ring-stone-200 ring-inset">
                      Undone
                    </span>
                  )}
                </div>
                {differentName && <div className="mt-0.5 text-xs text-ink-3">In the file as “{c.name}”</div>}
                {c.reason && c.action !== "updated" && <div className="mt-0.5 text-[13px] text-ink-2">{c.reason}</div>}
                {c.action === "updated" && (
                  <div className="mt-2 space-y-1">
                    {c.reason && <div className="text-xs text-ink-3">{c.reason}</div>}
                    {fields.length === 0 && <div className="text-[13px] text-ink-3">Nothing changed. The file had the same values.</div>}
                    {fields.map((f) => (
                      <div key={f} className={cx("flex flex-wrap items-center gap-x-2 text-[13px]", isUndone && "opacity-50")}>
                        <span className="w-24 shrink-0 text-ink-3">{FIELD_LABEL[f] ?? f}</span>
                        <span className={cx("text-ink-2", f !== "notes" && "line-through decoration-rose-400/70")}>{show(f, c.changes[f][0])}</span>
                        <ArrowRight className="size-3 shrink-0 text-ink-3" />
                        <span className="font-medium text-ink">{show(f, c.changes[f][1])}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              {c.action === "updated" && fields.length > 0 && !isUndone && (
                <Button
                  size="sm"
                  variant="secondary"
                  icon={<Undo2 className="size-3.5" />}
                  loading={pending && busy === c.id}
                  disabled={pending && busy !== c.id}
                  onClick={() => undo(c)}
                  className="self-start"
                >
                  Undo
                </Button>
              )}
            </div>
          );
        })}
      </Card>
    </div>
  );
}
