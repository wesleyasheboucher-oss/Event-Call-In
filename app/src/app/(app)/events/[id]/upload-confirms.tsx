"use client";

import { useMemo, useState, useTransition } from "react";
import { AnimatePresence, motion } from "motion/react";
import Papa from "papaparse";
import { toast } from "sonner";
import { CheckCircle2, ChevronDown, ClipboardPaste, FileSpreadsheet, ListChecks, UploadCloud, UserPlus } from "lucide-react";
import { applyConfirms, matchConfirmNames, type ConfirmMatch, type ConfirmResult } from "@/app/actions/confirms";
import { Drawer } from "@/components/drawer";
import { RsvpChip } from "@/components/status";
import { Button, cx, Textarea } from "@/components/ui";

/* ------------------------------ Reading names ----------------------------- */

const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");
const NAME_COLS = ["name", "fullname", "contact", "contactname", "attendee", "guest", "guestname", "person"];
const FIRST_COLS = ["first", "firstname", "fname", "givenname"];
const LAST_COLS = ["last", "lastname", "lname", "surname", "familyname"];
const CONFIRM_COLS = ["confirmed", "confirm", "confirmation", "status", "rsvp", "attending", "coming", "yesno"];
const YES = new Set(["yes", "y", "x", "✓", "✔", "true", "1", "confirmed", "confirm", "c", "attending", "coming", "going"]);

type Extracted = { names: string[]; rows: number; confirmedColumn: string | null; notConfirmed: number };

/** Names from a spreadsheet: finds the header, the name column(s), and an optional Confirmed column. */
function namesFromRows(rows: string[][]): Extracted {
  const cell = (r: string[], i: number) => String(r[i] ?? "").trim();
  let header = -1;
  let full = -1, first = -1, last = -1, conf = -1;
  for (let i = 0; i < Math.min(rows.length, 15) && header < 0; i++) {
    const cols = rows[i].map((c) => norm(String(c ?? "")));
    const f = cols.findIndex((c) => NAME_COLS.includes(c));
    const fi = cols.findIndex((c) => FIRST_COLS.includes(c));
    const la = cols.findIndex((c) => LAST_COLS.includes(c));
    if (f >= 0 || (fi >= 0 && la >= 0)) {
      header = i;
      [full, first, last] = [f, fi, la];
      conf = cols.findIndex((c) => CONFIRM_COLS.includes(c));
    }
  }
  const body = header >= 0 ? rows.slice(header + 1) : rows;
  if (header < 0) {
    // No header: names in the first column, or first + last in the first two.
    const sample = body.find((r) => cell(r, 0));
    if (sample && !cell(sample, 0).includes(" ") && cell(sample, 1)) [first, last] = [0, 1];
    else full = 0;
  }
  const names: string[] = [];
  let notConfirmed = 0;
  for (const r of body) {
    const name = first >= 0 && last >= 0 && (full < 0 || !cell(r, full)) ? `${cell(r, first)} ${cell(r, last)}`.trim() : cell(r, full);
    if (!name) continue;
    if (conf >= 0 && !YES.has(cell(r, conf).toLowerCase())) {
      notConfirmed++;
      continue;
    }
    names.push(name);
  }
  return {
    names: [...new Set(names)],
    rows: names.length + notConfirmed,
    confirmedColumn: conf >= 0 ? String(rows[header][conf]) : null,
    notConfirmed,
  };
}

async function readFile(file: File): Promise<string[][]> {
  const lower = file.name.toLowerCase();
  if (lower.endsWith(".xlsx")) {
    const { readSheet } = await import("read-excel-file/browser");
    return ((await readSheet(file)) as unknown[][]).map((r) => r.map((c) => (c == null ? "" : String(c))));
  }
  if (lower.endsWith(".csv") || lower.endsWith(".txt")) {
    return new Promise((resolve, reject) =>
      Papa.parse<string[]>(file, { skipEmptyLines: "greedy", complete: (r) => resolve(r.data), error: reject }),
    );
  }
  throw new Error("Choose a .csv or .xlsx file, or paste names instead.");
}

/** Pasted names, one per line; numbering and bullets are ignored. */
function namesFromPaste(text: string): Extracted {
  const names = text
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*(\d+[.)]|[-*•])\s*/, "").trim())
    .filter(Boolean);
  return { names: [...new Set(names)], rows: names.length, confirmedColumn: null, notConfirmed: 0 };
}

/* --------------------------------- Drawer --------------------------------- */

export function UploadConfirmsButton({ eventId, eventName }: { eventId: number; eventName: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="secondary" className="w-full" icon={<ListChecks className="size-4" />} onClick={() => setOpen(true)}>
        Upload confirms
      </Button>
      {open && <UploadConfirmsDrawer eventId={eventId} eventName={eventName} onClose={() => setOpen(false)} />}
    </>
  );
}

function UploadConfirmsDrawer({ eventId, eventName, onClose }: { eventId: number; eventName: string; onClose: () => void }) {
  const [step, setStep] = useState<"input" | "review" | "done">("input");
  const [paste, setPaste] = useState("");
  const [source, setSource] = useState<Extracted | null>(null);
  const [matches, setMatches] = useState<ConfirmMatch[]>([]);
  // For "close" / "ambiguous" rows: chosen contact id, or null = skip.
  const [choice, setChoice] = useState<Record<number, number | null>>({});
  const [addMissing, setAddMissing] = useState(false);
  const [showExact, setShowExact] = useState(false);
  const [result, setResult] = useState<ConfirmResult | null>(null);
  const [busy, start] = useTransition();

  const analyze = (ex: Extracted) =>
    start(async () => {
      if (ex.names.length === 0) return void toast.error("No names found. Check the file has a Name (or First/Last) column.");
      setSource(ex);
      const m = await matchConfirmNames(eventId, ex.names);
      setMatches(m);
      // A single close match is pre-selected (you can still skip it); same-name choices are not.
      setChoice(Object.fromEntries(m.map((x, i) => [i, x.kind === "close" && x.options.length === 1 ? x.options[0].id : null])));
      setStep("review");
    });

  const onFile = async (f: File) => {
    try {
      analyze(namesFromRows(await readFile(f)));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't read that file.");
    }
  };

  const groups = useMemo(() => {
    const exact = matches.map((m, i) => ({ m, i })).filter(({ m }) => m.kind === "exact");
    const review = matches.map((m, i) => ({ m, i })).filter(({ m }) => m.kind === "close" || m.kind === "ambiguous");
    const missing = matches.map((m, i) => ({ m, i })).filter(({ m }) => m.kind === "none");
    return { exact, review, missing };
  }, [matches]);

  const chosenIds = [
    ...groups.exact.map(({ m }) => m.options[0].id),
    ...groups.review.map(({ i }) => choice[i]).filter((v): v is number => v != null),
  ];
  const alreadyConfirmed = [...groups.exact.map(({ m }) => m.options[0]), ...groups.review.flatMap(({ m, i }) => m.options.filter((o) => o.id === choice[i]))].filter(
    (o) => o.status === "confirmed" || o.status === "reconfirmed",
  ).length;
  const total = chosenIds.length + (addMissing ? groups.missing.length : 0);

  const apply = () =>
    start(async () => {
      try {
        const ids = [...new Set(chosenIds)];
        const fresh = addMissing ? groups.missing.map(({ m }) => m.input) : [];
        const sum: ConfirmResult = { confirmed: 0, already: 0, addedToList: 0, created: 0 };
        // Send in batches so each request stays quick.
        for (let i = 0; i < Math.max(ids.length, 1); i += 150) {
          const r = await applyConfirms(eventId, { contactIds: ids.slice(i, i + 150), newPeople: i === 0 ? fresh : [] });
          for (const k of Object.keys(sum) as (keyof ConfirmResult)[]) sum[k] += r[k];
        }
        setResult(sum);
        setStep("done");
      } catch {
        toast.error("Something went wrong saving. Nothing after the error was changed; try again.");
      }
    });

  return (
    <Drawer
      open
      onClose={onClose}
      width="lg"
      title="Upload confirms"
      subtitle={`Mark people Confirmed for ${eventName}`}
      footer={
        step === "review" ? (
          <div className="flex items-center justify-between gap-3">
            <Button variant="ghost" onClick={() => setStep("input")} disabled={busy}>
              Back
            </Button>
            <Button variant="primary" loading={busy} disabled={total - alreadyConfirmed === 0} onClick={apply}>
              {total - alreadyConfirmed === 0
                ? "Everyone's already confirmed"
                : `Confirm ${total - alreadyConfirmed} ${total - alreadyConfirmed === 1 ? "person" : "people"}`}
            </Button>
          </div>
        ) : step === "done" ? (
          <div className="flex justify-end">
            <Button variant="primary" onClick={onClose}>
              Done
            </Button>
          </div>
        ) : undefined
      }
    >
      <AnimatePresence mode="wait" initial={false}>
        {step === "input" && (
          <motion.div key="input" initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} className="space-y-6 px-6 py-6">
            <label
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const f = e.dataTransfer.files[0];
                if (f) onFile(f);
              }}
              className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border-strong px-6 py-10 text-center transition-colors hover:border-accent hover:bg-accent-soft/40"
            >
              <UploadCloud className="mb-3 size-8 text-ink-3" />
              <span className="text-sm font-medium">Drop a CSV or Excel file, or click to choose</span>
              <span className="mt-1 text-xs text-ink-3">
                A Name column (or First + Last). Optional Confirmed column: only rows marked yes / x / ✓ count.
              </span>
              <input
                type="file"
                accept=".csv,.xlsx,.txt"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
              />
            </label>

            <div className="flex items-center gap-3 text-xs text-ink-3">
              <span className="h-px flex-1 bg-border" /> or paste names <span className="h-px flex-1 bg-border" />
            </div>

            <div>
              <Textarea
                value={paste}
                onChange={(e) => setPaste(e.target.value)}
                placeholder={"One name per line\nJane Doe\nSmith, John"}
                className="min-h-40 font-mono text-[13px]"
              />
              <div className="mt-3 flex justify-end">
                <Button
                  variant="primary"
                  icon={<ClipboardPaste className="size-4" />}
                  loading={busy}
                  disabled={!paste.trim()}
                  onClick={() => analyze(namesFromPaste(paste))}
                >
                  Find these people
                </Button>
              </div>
            </div>
            {busy && <p className="text-center text-sm text-ink-2">Matching names…</p>}
          </motion.div>
        )}

        {step === "review" && source && (
          <motion.div key="review" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 12 }} className="space-y-7 px-6 py-6">
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: "Exact match", n: groups.exact.length, tone: "text-emerald-600" },
                { label: "Need a look", n: groups.review.length, tone: "text-amber-600" },
                { label: "Not found", n: groups.missing.length, tone: "text-ink-2" },
              ].map((t) => (
                <div key={t.label} className="rounded-xl bg-surface-2 px-3 py-2.5">
                  <div className={cx("text-xl font-semibold tabular-nums", t.tone)}>{t.n}</div>
                  <div className="text-xs text-ink-2">{t.label}</div>
                </div>
              ))}
            </div>
            <p className="-mt-3 text-xs text-ink-3">
              {source.names.length} names
              {source.confirmedColumn && ` marked confirmed in “${source.confirmedColumn}”`}
              {source.notConfirmed > 0 &&
                ` · ${source.notConfirmed} ${source.notConfirmed === 1 ? "row" : "rows"} not marked confirmed ${source.notConfirmed === 1 ? "was" : "were"} left out`}
              {alreadyConfirmed > 0 && ` · ${alreadyConfirmed} already confirmed (left as-is)`}
            </p>

            {groups.review.length > 0 && (
              <section>
                <h3 className="mb-2 text-xs font-semibold tracking-wide text-ink-3 uppercase">Need a look</h3>
                <ul className="space-y-3">
                  {groups.review.map(({ m, i }) => (
                    <li key={i} className="rounded-2xl p-4 ring-1 ring-amber-200">
                      <div className="mb-2 text-sm">
                        <span className="text-ink-3">List says </span>
                        <span className="font-semibold">“{m.input}”</span>
                        <span className="text-ink-3">{m.kind === "ambiguous" ? " · more than one contact has this name" : " · close match"}</span>
                      </div>
                      <div className="space-y-1.5">
                        {m.options.map((o) => (
                          <label
                            key={o.id}
                            className={cx(
                              "flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 ring-1 transition-colors",
                              choice[i] === o.id ? "bg-accent-soft/60 ring-accent" : "ring-border hover:bg-surface-2",
                            )}
                          >
                            <input
                              type="radio"
                              name={`pick-${i}`}
                              checked={choice[i] === o.id}
                              onChange={() => setChoice((c) => ({ ...c, [i]: o.id }))}
                              className="accent-[var(--accent)]"
                            />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-medium">{o.name}</span>
                              <span className="block truncate text-xs text-ink-3">
                                {o.phone ? `···${o.phone.slice(-4)}` : "no phone"}
                                {o.why && ` · ${o.why}`}
                              </span>
                            </span>
                            {o.status ? <RsvpChip status={o.status} /> : <span className="text-xs text-ink-3">Not on list</span>}
                          </label>
                        ))}
                        <label className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2 text-sm text-ink-2 hover:bg-surface-2">
                          <input
                            type="radio"
                            name={`pick-${i}`}
                            checked={choice[i] == null}
                            onChange={() => setChoice((c) => ({ ...c, [i]: null }))}
                            className="accent-[var(--accent)]"
                          />
                          Skip. None of these.
                        </label>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {groups.exact.length > 0 && (
              <section>
                <button onClick={() => setShowExact((v) => !v)} className="mb-2 flex w-full items-center justify-between text-left">
                  <h3 className="text-xs font-semibold tracking-wide text-ink-3 uppercase">Exact matches ({groups.exact.length})</h3>
                  <ChevronDown className={cx("size-4 text-ink-3 transition-transform", showExact && "rotate-180")} />
                </button>
                <AnimatePresence initial={false}>
                  {showExact && (
                    <motion.ul
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="divide-y divide-border overflow-hidden rounded-2xl ring-1 ring-border"
                    >
                      {groups.exact.map(({ m, i }) => (
                        <li key={i} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                          <CheckCircle2 className="size-4 shrink-0 text-emerald-500" />
                          <span className="min-w-0 flex-1 truncate">{m.options[0].name}</span>
                          {m.options[0].status ? <RsvpChip status={m.options[0].status} /> : <span className="text-xs text-ink-3">Not on list</span>}
                        </li>
                      ))}
                    </motion.ul>
                  )}
                </AnimatePresence>
              </section>
            )}

            {groups.missing.length > 0 && (
              <section>
                <h3 className="mb-2 text-xs font-semibold tracking-wide text-ink-3 uppercase">Not found ({groups.missing.length})</h3>
                <p className="mb-2 text-sm text-ink-2">{groups.missing.map(({ m }) => m.input).join(" · ")}</p>
                <label className="flex cursor-pointer items-center gap-3 rounded-xl bg-surface-2/60 px-4 py-3 text-sm ring-1 ring-border">
                  <input type="checkbox" checked={addMissing} onChange={(e) => setAddMissing(e.target.checked)} className="size-4 accent-[var(--accent)]" />
                  <UserPlus className="size-4 text-ink-3" />
                  {groups.missing.length === 1
                    ? "Add this person as a new contact and confirm them"
                    : `Add these ${groups.missing.length} as new contacts and confirm them`}
                </label>
              </section>
            )}
          </motion.div>
        )}

        {step === "done" && result && (
          <motion.div key="done" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="px-6 py-10 text-center">
            <CheckCircle2 className="mx-auto mb-3 size-12 text-emerald-500" />
            <h3 className="text-lg font-semibold">
              {result.confirmed} {result.confirmed === 1 ? "person" : "people"} marked Confirmed
            </h3>
            <ul className="mt-3 space-y-1 text-sm text-ink-2">
              {result.already > 0 && <li>{result.already} were already confirmed and left as-is</li>}
              {result.addedToList > 0 && <li>{result.addedToList} added to the {eventName} list</li>}
              {result.created > 0 && <li>{result.created} new contacts created</li>}
            </ul>
            <p className="mt-4 flex items-center justify-center gap-1.5 text-xs text-ink-3">
              <FileSpreadsheet className="size-3.5" /> Recorded as “via upload”, so they don&apos;t count toward the leaderboard.
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </Drawer>
  );
}
