"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { animate, AnimatePresence, motion } from "motion/react";
import Papa from "papaparse";
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Copy,
  Download,
  FileSpreadsheet,
  RefreshCw,
  SkipForward,
  Tag as TagIcon,
  UploadCloud,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { importContacts, matchExisting, type ExistingMatch, type ImportResult } from "@/app/actions/contacts";
import { fetchTags } from "@/app/actions/tags";
import {
  applyMapping,
  dropBlankRows,
  findHeaderRow,
  guessMapping,
  sameName,
  IMPORT_FIELDS,
  rowError,
  type ColumnMapping,
  type ImportField,
  type MappedRow,
} from "@/lib/import";
import { downloadCsv } from "@/lib/csv";
import { formatPhone } from "@/lib/phone";
import { Page, PageHeader } from "@/components/page";
import { Button, Card, cx, Select } from "@/components/ui";

type Step = 0 | 1 | 2 | 3;
const STEPS = ["Upload", "Map columns", "Preview", "Done"];

type Analyzed = MappedRow & {
  status: "new" | "duplicate" | "in_file" | "error";
  reason?: string;
  match?: ExistingMatch;
  dupOfRow?: number;
};

// Rows per request; small enough to finish well inside a serverless time limit.
const CHUNK = 200;

function cellToString(v: unknown): string {
  if (v == null) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v);
}

async function parseFile(file: File): Promise<string[][]> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".xlsx")) {
    const { readSheet } = await import("read-excel-file/browser");
    const data = await readSheet(file);
    return (data as unknown[][]).map((r) => r.map(cellToString));
  }
  if (name.endsWith(".csv") || name.endsWith(".txt") || file.type === "text/csv") {
    return new Promise((resolve, reject) => {
      Papa.parse<string[]>(file, {
        skipEmptyLines: "greedy",
        complete: (res) => resolve(res.data.map((r) => r.map(cellToString))),
        error: reject,
      });
    });
  }
  throw new Error("Please choose a .csv or .xlsx file.");
}

export function ImportWizard() {
  const router = useRouter();
  const [step, setStep] = useState<Step>(0);
  const [dir, setDir] = useState(1);
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [headerRow, setHeaderRow] = useState(0); // index of the header row in the file
  const [tagName, setTagName] = useState("");
  const [mapping, setMapping] = useState<ColumnMapping | null>(null);
  const [analyzed, setAnalyzed] = useState<Analyzed[] | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [mode, setMode] = useState<"skip" | "update">("skip");
  const [progress, setProgress] = useState<number | null>(null);
  const [result, setResult] = useState<(ImportResult & { inFile: number }) | null>(null);

  function go(next: Step) {
    setDir(next > step ? 1 : -1);
    setStep(next);
  }

  async function onFile(file: File) {
    try {
      const data = await parseFile(file);
      // Lists often start with a title or a note; the header is the first row naming known columns.
      const h = findHeaderRow(data);
      const head = data[h] ?? [];
      const body = data.slice(h + 1);
      if (dropBlankRows(body).length === 0) {
        toast.error("That file needs a header row and at least one contact.");
        return;
      }
      setFileName(file.name);
      setHeaderRow(h);
      setHeaders(head.map((c, i) => c.trim() || `Column ${i + 1}`));
      setRows(body);
      setMapping(guessMapping(head));
      setAnalyzed(null);
      setResult(null);
      go(1);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't read that file.");
    }
  }

  async function analyze() {
    if (!mapping) return;
    setAnalyzing(true);
    try {
      const mapped = applyMapping(rows, mapping, headerRow + 2);
      // Repeats within the file: same email, or same phone *and* same name. Households and
      // offices often share a phone, and those are different people.
      const phones = new Map<string, MappedRow[]>();
      const emails = new Map<string, number>();
      const noContact: MappedRow[] = []; // rows with no phone/email: matched by name only
      const out: Analyzed[] = mapped.map((r) => {
        const err = rowError(r);
        if (err) return { ...r, status: "error", reason: err };
        const byPhone = [r.phone, r.alt_phone]
          .filter(Boolean)
          .flatMap((p) => phones.get(p) ?? [])
          .find((p) => sameName(p, r));
        const byNameOnly = !r.phone && !r.alt_phone && !r.email ? noContact.find((p) => sameName(p, r)) : undefined;
        if (!r.phone && !r.alt_phone && !r.email) noContact.push(r);
        const prior = (r.email && emails.get(r.email)) || byPhone?.row || byNameOnly?.row;
        for (const p of [r.phone, r.alt_phone]) if (p) phones.set(p, [...(phones.get(p) ?? []), r]);
        if (r.email && !emails.has(r.email)) emails.set(r.email, r.row);
        if (prior) return { ...r, status: "in_file", dupOfRow: prior, reason: `Same person as row ${prior}` };
        return { ...r, status: "new" };
      });
      const candidates = out.filter((r) => r.status === "new");
      for (let i = 0; i < candidates.length; i += 2000) {
        const slice = candidates.slice(i, i + 2000);
        const matches = await matchExisting(
          slice.map((r) => ({ phone: r.phone, email: r.email, alt_phone: r.alt_phone, first_name: r.first_name, last_name: r.last_name })),
        );
        slice.forEach((r, j) => {
          if (matches[j]) {
            r.status = "duplicate";
            r.match = matches[j];
          }
        });
      }
      setAnalyzed(out);
      go(2);
    } catch {
      toast.error("Couldn't analyze the file. Please try again.");
    } finally {
      setAnalyzing(false);
    }
  }

  async function runImport() {
    if (!analyzed) return;
    const toSend = analyzed
      .filter((r) => r.status === "new" || r.status === "duplicate")
      .map((r) => ({
        row: r.row,
        first_name: r.first_name,
        last_name: r.last_name,
        phone: r.phone,
        alt_phone: r.alt_phone,
        email: r.email,
        street: r.street,
        city: r.city,
        state: r.state,
        zip: r.zip,
        notes: r.notes,
        training_level: r.training_level,
        processing_level: r.processing_level,
        fsm_name: r.fsm_name,
        active: r.active,
        warnings: [],
      }));
    const total: ImportResult = { added: 0, updated: 0, skipped: 0, errors: [] };
    setProgress(0);
    try {
      for (let i = 0; i < toSend.length; i += CHUNK) {
        const res = await importContacts(toSend.slice(i, i + CHUNK), mode, tagName);
        total.added += res.added;
        total.updated += res.updated;
        total.skipped += res.skipped;
        total.errors.push(...res.errors);
        setProgress(Math.min(1, (i + CHUNK) / Math.max(1, toSend.length)));
      }
      const clientErrors = analyzed.filter((r) => r.status === "error").map((r) => ({ row: r.row, reason: r.reason! }));
      const inFile = analyzed.filter((r) => r.status === "in_file").length;
      setResult({ ...total, skipped: total.skipped + inFile, errors: [...clientErrors, ...total.errors], inFile });
      router.refresh();
      go(3);
    } catch {
      toast.error("The import stopped partway. Rows already saved were kept.");
    } finally {
      setProgress(null);
    }
  }

  function downloadErrors() {
    if (!result) return;
    const byRow = new Map(rows.map((r, i) => [i + headerRow + 2, r]));
    const list = [...result.errors].sort((a, b) => a.row - b.row);
    downloadCsv(`import-errors-${fileName.replace(/\.[^.]+$/, "")}`, list, [
      { header: "Row", value: (e) => e.row },
      { header: "Reason", value: (e) => e.reason },
      ...headers.map((h, i) => ({ header: h, value: (e: { row: number }) => byRow.get(e.row)?.[i] ?? "" })),
    ]);
  }

  function reset() {
    setFileName("");
    setHeaders([]);
    setRows([]);
    setHeaderRow(0);
    setTagName("");
    setMapping(null);
    setAnalyzed(null);
    setResult(null);
    go(0);
  }

  return (
    <Page>
      <PageHeader
        eyebrow={
          <Link href="/contacts" className="inline-flex items-center gap-1 hover:text-ink">
            <ArrowLeft className="size-3.5" /> Contacts
          </Link>
        }
        title="Import contacts"
        description="Bring in a CSV or Excel file. You'll match columns and review everything before it's saved."
      />

      <Stepper step={step} />

      <div className="relative mt-8">
        <AnimatePresence mode="wait" custom={dir} initial={false}>
          <motion.div
            key={step}
            custom={dir}
            variants={{
              enter: (d: number) => ({ opacity: 0, x: d * 32 }),
              center: { opacity: 1, x: 0 },
              exit: (d: number) => ({ opacity: 0, x: d * -32 }),
            }}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ type: "spring", stiffness: 380, damping: 36 }}
          >
            {step === 0 && <UploadStep onFile={onFile} />}
            {step === 1 && mapping && (
              <MapStep
                fileName={fileName}
                headers={headers}
                rows={rows}
                mapping={mapping}
                onChange={setMapping}
                onBack={reset}
                onNext={analyze}
                loading={analyzing}
              />
            )}
            {step === 2 && analyzed && (
              <PreviewStep
                analyzed={analyzed}
                mode={mode}
                onMode={setMode}
                onBack={() => go(1)}
                onImport={runImport}
                progress={progress}
                tagName={tagName}
                onTagName={setTagName}
              />
            )}
            {step === 3 && result && <DoneStep result={result} onErrors={downloadErrors} onAgain={reset} />}
          </motion.div>
        </AnimatePresence>
      </div>
    </Page>
  );
}

/* --------------------------------- Stepper -------------------------------- */

function Stepper({ step }: { step: Step }) {
  return (
    <div className="flex items-center gap-3">
      {STEPS.map((label, i) => {
        const done = i < step;
        const active = i === step;
        return (
          <div key={label} className={cx("flex items-center gap-3", i < STEPS.length - 1 && "flex-1")}>
            <div className="flex items-center gap-2.5">
              <motion.span
                animate={{
                  backgroundColor: done || active ? "var(--accent)" : "var(--surface)",
                  color: done || active ? "#fff" : "var(--ink-3)",
                  scale: active ? 1.08 : 1,
                }}
                transition={{ type: "spring", stiffness: 400, damping: 28 }}
                className="flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ring-1 ring-border"
              >
                {done ? <Check className="size-3.5" /> : i + 1}
              </motion.span>
              <span className={cx("hidden text-sm font-medium sm:inline", active ? "text-ink" : "text-ink-3")}>{label}</span>
            </div>
            {i < STEPS.length - 1 && (
              <div className="relative h-px flex-1 bg-border">
                <motion.div
                  className="absolute inset-y-0 left-0 bg-accent"
                  initial={false}
                  animate={{ width: done ? "100%" : "0%" }}
                  transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* --------------------------------- Upload --------------------------------- */

function UploadStep({ onFile }: { onFile: (f: File) => void }) {
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  function template() {
    downloadCsv("contacts-template", [{}], [
      { header: "First Name", value: () => "Jane" },
      { header: "Last Name", value: () => "Doe" },
      { header: "Phone", value: () => "(813) 555-1234" },
      { header: "Email", value: () => "jane@example.com" },
      { header: "Street", value: () => "100 Main St" },
      { header: "City", value: () => "Tampa" },
      { header: "State", value: () => "FL" },
      { header: "ZIP", value: () => "33602" },
      { header: "Notes", value: () => "" },
    ]);
  }

  return (
    <div>
      <motion.button
        type="button"
        onClick={() => input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          const f = e.dataTransfer.files[0];
          if (f) onFile(f);
        }}
        animate={{ scale: over ? 1.01 : 1 }}
        className={cx(
          "flex w-full flex-col items-center justify-center rounded-3xl border-2 border-dashed px-6 py-20 text-center transition-colors",
          over ? "border-accent bg-accent-soft/60" : "border-border-strong bg-surface hover:border-accent/50 hover:bg-surface-2/40",
        )}
      >
        <motion.span
          animate={{ y: over ? -6 : 0 }}
          transition={{ type: "spring", stiffness: 400, damping: 20 }}
          className="mb-5 flex size-14 items-center justify-center rounded-2xl bg-accent-soft text-accent"
        >
          <UploadCloud className="size-6" />
        </motion.span>
        <span className="text-base font-semibold">{over ? "Drop to upload" : "Drag a file here, or click to browse"}</span>
        <span className="mt-1.5 text-sm text-ink-2">CSV or Excel (.xlsx). Column headers are found automatically, even under a title.</span>
      </motion.button>
      <input
        ref={input}
        type="file"
        accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = "";
        }}
      />
      <div className="mt-6 grid gap-4 text-sm text-ink-2 sm:grid-cols-3">
        {[
          ["Match columns", "Your headers are matched automatically; adjust anything that's off."],
          ["Catch duplicates", "Rows sharing a phone or email with an existing contact are flagged."],
          ["Nothing saved yet", "You'll see a full preview before anything is written."],
        ].map(([t, b]) => (
          <div key={t} className="rounded-2xl px-1">
            <div className="font-medium text-ink">{t}</div>
            <div className="mt-0.5">{b}</div>
          </div>
        ))}
      </div>
      <button onClick={template} className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:underline">
        <Download className="size-3.5" /> Download a template CSV
      </button>
    </div>
  );
}

/* ---------------------------------- Map ----------------------------------- */

function MapStep({
  fileName,
  headers,
  rows,
  mapping,
  onChange,
  onBack,
  onNext,
  loading,
}: {
  fileName: string;
  headers: string[];
  rows: string[][];
  mapping: ColumnMapping;
  onChange: (m: ColumnMapping) => void;
  onBack: () => void;
  onNext: () => void;
  loading: boolean;
}) {
  const hasName = mapping.full_name >= 0 || (mapping.first_name >= 0 && mapping.last_name >= 0);
  const hasContact = mapping.phone >= 0 || mapping.email >= 0;
  const sample = rows.slice(0, 3);
  const preview = useMemo(() => applyMapping(rows.slice(0, 3), mapping), [rows, mapping]);
  const usedBy = new Map<number, ImportField>();
  for (const f of IMPORT_FIELDS) if (mapping[f.key] >= 0) usedBy.set(mapping[f.key], f.key);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 rounded-2xl bg-surface px-5 py-4 ring-1 ring-border">
        <FileSpreadsheet className="size-5 text-emerald-600" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{fileName}</div>
          <div className="text-xs text-ink-3">
            {rows.length.toLocaleString()} rows · {headers.length} columns
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={onBack}>
          Choose another file
        </Button>
      </div>

      <Card className="divide-y divide-border">
        <div className="grid grid-cols-12 gap-4 px-6 py-3 text-xs font-semibold tracking-wide text-ink-3 uppercase">
          <div className="col-span-4 sm:col-span-3">App field</div>
          <div className="col-span-8 sm:col-span-4">File column</div>
          <div className="hidden sm:col-span-5 sm:block">Sample values</div>
        </div>
        {IMPORT_FIELDS.map((f, i) => {
          const col = mapping[f.key];
          return (
            <motion.div
              key={f.key}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03 }}
              className="grid grid-cols-12 items-center gap-4 px-6 py-3"
            >
              <div className="col-span-4 sm:col-span-3">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <motion.span
                    animate={{ scale: col >= 0 ? 1 : 0.6, opacity: col >= 0 ? 1 : 0.3 }}
                    className={cx("size-1.5 rounded-full", col >= 0 ? "bg-emerald-500" : "bg-stone-300")}
                  />
                  {f.label}
                </div>
                {"hint" in f && <div className="ml-3.5 text-xs text-ink-3">{f.hint}</div>}
              </div>
              <div className="col-span-8 sm:col-span-4">
                <Select
                  value={col}
                  onChange={(e) => onChange({ ...mapping, [f.key]: Number(e.target.value) })}
                  className={cx(col < 0 && "text-ink-3")}
                >
                  <option value={-1}>— Don&apos;t import —</option>
                  {headers.map((h, idx) => (
                    <option key={idx} value={idx}>
                      {h}
                      {usedBy.has(idx) && usedBy.get(idx) !== f.key ? " (in use)" : ""}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="col-span-12 hidden min-w-0 truncate text-[13px] text-ink-2 sm:col-span-5 sm:block">
                {col >= 0 ? (
                  sample
                    .map((r) => r[col])
                    .filter(Boolean)
                    .join(" · ") || <span className="text-ink-3">(empty)</span>
                ) : (
                  <span className="text-ink-3">—</span>
                )}
              </div>
            </motion.div>
          );
        })}
      </Card>

      {preview.length > 0 && hasName && (
        <div>
          <div className="mb-2 text-xs font-semibold tracking-wide text-ink-3 uppercase">How the first rows will look</div>
          <div className="grid gap-3 sm:grid-cols-3">
            {preview.map((r) => (
              <div key={r.row} className="rounded-2xl bg-surface px-4 py-3 text-sm ring-1 ring-border">
                <div className="font-medium">{`${r.first_name} ${r.last_name}`.trim() || <span className="text-ink-3">No name</span>}</div>
                <div className="mt-0.5 text-ink-2 tabular-nums">{formatPhone(r.phone) || "—"}</div>
                <div className="truncate text-ink-2">{r.email || "—"}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <AnimatePresence>
        {(!hasName || !hasContact) && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="flex items-start gap-2 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-amber-200">
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              {!hasName
                ? "Map first and last name columns (or a single Full name column) to continue."
                : "Neither phone nor email is mapped, so every row will be flagged as an error."}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex justify-between">
        <Button variant="ghost" icon={<ArrowLeft className="size-4" />} onClick={onBack}>
          Back
        </Button>
        <Button variant="primary" onClick={onNext} disabled={!hasName} loading={loading}>
          Review import <ArrowRight className="size-4" />
        </Button>
      </div>
    </div>
  );
}

/* --------------------------------- Preview -------------------------------- */

type Tab = "new" | "duplicate" | "error";

function PreviewStep({
  analyzed,
  mode,
  onMode,
  onBack,
  onImport,
  progress,
  tagName,
  onTagName,
}: {
  analyzed: Analyzed[];
  mode: "skip" | "update";
  onMode: (m: "skip" | "update") => void;
  onBack: () => void;
  onImport: () => void;
  progress: number | null;
  tagName: string;
  onTagName: (v: string) => void;
}) {
  const [tagOptions, setTagOptions] = useState<string[]>([]);
  useEffect(() => {
    fetchTags().then((t) => setTagOptions(t.map((x) => x.name)));
  }, []);
  // Importable rows with something worth a look (unreadable phone, no contact info…)
  const warned = analyzed.filter((r) => r.status !== "error" && r.status !== "in_file" && r.warnings.length);
  const warningCounts = new Map<string, number>();
  for (const r of warned) for (const w of r.warnings) {
    const k = w.replace(/\s*\(.*\)/, "");
    warningCounts.set(k, (warningCounts.get(k) ?? 0) + 1);
  }
  const groups = {
    new: analyzed.filter((r) => r.status === "new"),
    duplicate: analyzed.filter((r) => r.status === "duplicate" || r.status === "in_file"),
    error: analyzed.filter((r) => r.status === "error"),
  };
  const existingDupes = groups.duplicate.filter((r) => r.status === "duplicate").length;
  const [tab, setTab] = useState<Tab>(groups.new.length ? "new" : groups.duplicate.length ? "duplicate" : "error");
  const willWrite = groups.new.length + (mode === "update" ? existingDupes : 0);

  const tiles: { key: Tab; label: string; value: number; tone: string; ring: string; sub: string }[] = [
    { key: "new", label: "New contacts", value: groups.new.length, tone: "text-emerald-600", ring: "ring-emerald-300", sub: "Will be added" },
    { key: "duplicate", label: "Likely duplicates", value: groups.duplicate.length, tone: "text-amber-600", ring: "ring-amber-300", sub: "Same phone or email" },
    { key: "error", label: "Errors", value: groups.error.length, tone: "text-rose-600", ring: "ring-rose-300", sub: "Won't be imported" },
  ];
  const list = groups[tab];

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        {tiles.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cx(
              "rounded-2xl bg-surface px-5 py-4 text-left ring-1 transition-all",
              tab === t.key ? cx("ring-2 shadow-[var(--shadow-soft)]", t.ring) : "ring-border hover:ring-border-strong",
            )}
          >
            <div className="text-[13px] text-ink-2">{t.label}</div>
            <div className={cx("mt-1 text-3xl font-semibold tracking-tight tabular-nums", t.tone)}>
              <Counter value={t.value} />
            </div>
            <div className="mt-0.5 text-xs text-ink-3">{t.sub}</div>
          </button>
        ))}
      </div>

      {groups.duplicate.length > 0 && (
        <div>
          <div className="mb-2 text-sm font-medium">When a row matches an existing contact</div>
          <div className="grid gap-3 sm:grid-cols-2">
            {(
              [
                { key: "skip", icon: SkipForward, title: "Skip duplicates", body: "Leave existing contacts exactly as they are." },
                { key: "update", icon: RefreshCw, title: "Update existing", body: "Fill in or replace fields with non-empty values from this file." },
              ] as const
            ).map((o) => (
              <button
                key={o.key}
                onClick={() => onMode(o.key)}
                className={cx(
                  "relative flex gap-3 rounded-2xl bg-surface p-4 text-left ring-1 transition-all",
                  mode === o.key ? "ring-2 ring-accent" : "ring-border hover:ring-border-strong",
                )}
              >
                <o.icon className={cx("mt-0.5 size-4 shrink-0", mode === o.key ? "text-accent" : "text-ink-3")} />
                <span>
                  <span className="block text-sm font-medium">{o.title}</span>
                  <span className="mt-0.5 block text-[13px] text-ink-2">{o.body}</span>
                </span>
                {mode === o.key && (
                  <motion.span
                    layoutId="mode-check"
                    className="absolute top-3 right-3 flex size-5 items-center justify-center rounded-full bg-accent text-white"
                  >
                    <Check className="size-3" />
                  </motion.span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {warningCounts.size > 0 && (
        <div className="flex gap-3 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
          <div>
            <div className="font-medium">
              {warned.length} {warned.length === 1 ? "row imports" : "rows import"} with something to check later
            </div>
            <ul className="mt-1 space-y-0.5 text-[13px] text-amber-800">
              {[...warningCounts].map(([w, n]) => (
                <li key={w}>
                  {w}: <span className="font-semibold tabular-nums">{n}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <Card className="overflow-hidden">
        <div className="flex gap-1 border-b border-border px-3 pt-3">
          {tiles.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cx("relative px-3 pb-3 text-sm font-medium transition-colors", tab === t.key ? "text-ink" : "text-ink-3 hover:text-ink-2")}
            >
              {t.label} <span className="text-ink-3 tabular-nums">{t.value}</span>
              {tab === t.key && <motion.span layoutId="preview-tab" className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-accent" />}
            </button>
          ))}
        </div>
        {list.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-ink-3">Nothing here.</div>
        ) : (
          <div className="max-h-[420px] overflow-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="sticky top-0 bg-surface/95 backdrop-blur">
                <tr className="text-left text-[13px] text-ink-2">
                  <th className="w-16 px-6 py-2.5 font-medium">Row</th>
                  <th className="px-3 py-2.5 font-medium">Name</th>
                  <th className="px-3 py-2.5 font-medium">Phone</th>
                  <th className="px-3 py-2.5 font-medium">Email</th>
                  <th className="px-3 py-2.5 pr-6 font-medium">{tab === "error" ? "Problem" : tab === "duplicate" ? "Matches" : "Check"}</th>
                </tr>
              </thead>
              <tbody>
                {list.slice(0, 200).map((r) => (
                  <tr key={r.row} className="border-t border-border/70">
                    <td className="px-6 py-2.5 text-ink-3 tabular-nums">{r.row}</td>
                    <td className="px-3 py-2.5 font-medium">{`${r.first_name} ${r.last_name}`.trim() || <span className="text-ink-3">—</span>}</td>
                    <td className="px-3 py-2.5 text-ink-2 tabular-nums">{formatPhone(r.phone) || "—"}</td>
                    <td className="max-w-[220px] truncate px-3 py-2.5 text-ink-2">{r.email || "—"}</td>
                    {tab === "error" && <td className="px-3 py-2.5 pr-6 text-rose-600">{r.reason}</td>}
                    {tab === "new" && <td className="px-3 py-2.5 pr-6 text-xs text-amber-700">{r.warnings.join(" · ")}</td>}
                    {tab === "duplicate" && (
                      <td className="px-3 py-2.5 pr-6">
                        {r.status === "in_file" ? (
                          <span className="inline-flex items-center gap-1.5 text-amber-700">
                            <Copy className="size-3.5" /> Row {r.dupOfRow} in this file
                          </span>
                        ) : (
                          <Link href={`/contacts?c=${r.match?.id}`} target="_blank" className="text-amber-700 hover:underline">
                            {r.match?.name}
                          </Link>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            {list.length > 200 && <div className="px-6 py-3 text-center text-xs text-ink-3">…and {list.length - 200} more</div>}
          </div>
        )}
      </Card>

      {groups.duplicate.length > existingDupes && (
        <p className="text-[13px] text-ink-3">Rows repeated within the file are always skipped; the first occurrence is imported.</p>
      )}

      <div className="rounded-2xl bg-surface p-4 ring-1 ring-border">
        <label className="block">
          <span className="flex items-center gap-2 text-sm font-medium">
            <TagIcon className="size-4 text-ink-3" /> Tag everyone in this import <span className="font-normal text-ink-3">(optional)</span>
          </span>
          <span className="mt-0.5 block text-[13px] text-ink-2">
            Added and updated people get this tag, so you can find this list later. Pick one or type a new name.
          </span>
          <input
            list="import-tag-options"
            value={tagName}
            onChange={(e) => onTagName(e.target.value)}
            placeholder="e.g. Fully Paid – Oct 2026"
            maxLength={40}
            className="mt-2.5 h-10 w-full max-w-sm rounded-xl bg-surface px-3.5 text-sm ring-1 ring-border ring-inset placeholder:text-ink-3 focus:ring-2 focus:ring-accent focus:outline-none"
          />
          <datalist id="import-tag-options">
            {tagOptions.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </label>
      </div>

      <div className="flex items-center justify-between gap-4">
        <Button variant="ghost" icon={<ArrowLeft className="size-4" />} onClick={onBack} disabled={progress != null}>
          Back
        </Button>
        <div className="flex items-center gap-4">
          <AnimatePresence>
            {progress != null && (
              <motion.div initial={{ opacity: 0, width: 0 }} animate={{ opacity: 1, width: 160 }} exit={{ opacity: 0, width: 0 }} className="h-1.5 overflow-hidden rounded-full bg-stone-100">
                <motion.div className="h-full bg-accent" animate={{ width: `${progress * 100}%` }} />
              </motion.div>
            )}
          </AnimatePresence>
          <Button variant="primary" onClick={onImport} disabled={willWrite === 0} loading={progress != null}>
            {willWrite === 0
              ? "Nothing to import"
              : `Import ${groups.new.length.toLocaleString()} new${mode === "update" && existingDupes ? ` · update ${existingDupes}` : ""}`}
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------- Done ---------------------------------- */

function DoneStep({
  result,
  onErrors,
  onAgain,
}: {
  result: ImportResult & { inFile: number };
  onErrors: () => void;
  onAgain: () => void;
}) {
  const items = [
    { label: "Added", value: result.added, tone: "text-emerald-600" },
    { label: "Updated", value: result.updated, tone: "text-sky-600" },
    { label: "Skipped", value: result.skipped, tone: "text-amber-600" },
    { label: "Errors", value: result.errors.length, tone: "text-rose-600" },
  ];
  return (
    <div className="flex flex-col items-center py-6 text-center">
      <motion.div
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 300, damping: 18 }}
        className="mb-5 flex size-16 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 ring-8 ring-emerald-50/60"
      >
        <CheckCircle2 className="size-8" />
      </motion.div>
      <h2 className="text-xl font-semibold tracking-tight">Import complete</h2>
      <p className="mt-1 text-sm text-ink-2">Here&apos;s what happened.</p>
      <div className="mt-8 grid w-full max-w-2xl grid-cols-2 gap-4 sm:grid-cols-4">
        {items.map((i, idx) => (
          <motion.div
            key={i.label}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 + idx * 0.07 }}
            className="rounded-2xl bg-surface px-4 py-5 ring-1 ring-border"
          >
            <div className={cx("text-3xl font-semibold tracking-tight tabular-nums", i.tone)}>
              <Counter value={i.value} />
            </div>
            <div className="mt-1 text-[13px] text-ink-2">{i.label}</div>
          </motion.div>
        ))}
      </div>
      {result.inFile > 0 && (
        <p className="mt-4 text-[13px] text-ink-3">
          Skipped includes {result.inFile} {result.inFile === 1 ? "row" : "rows"} repeated within the file.
        </p>
      )}
      <div className="mt-8 flex flex-wrap justify-center gap-2">
        {result.errors.length > 0 && (
          <Button variant="secondary" icon={<Download className="size-4" />} onClick={onErrors}>
            Download error list
          </Button>
        )}
        <Button variant="ghost" icon={<X className="size-4" />} onClick={onAgain}>
          Import another file
        </Button>
        <Link href="/contacts">
          <Button variant="primary">
            Go to contacts <ArrowRight className="size-4" />
          </Button>
        </Link>
      </div>
    </div>
  );
}

function Counter({ value }: { value: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const controls = animate(0, value, {
      duration: Math.min(1.2, 0.4 + value / 500),
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => (el.textContent = Math.round(v).toLocaleString()),
    });
    return () => controls.stop();
  }, [value]);
  return <span ref={ref}>0</span>;
}
