"use client";

import { useId, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { toast } from "sonner";
import { FileText, ImagePlus, Loader2, Plus, Trash2, Upload, X } from "lucide-react";
import { Button, cx, IconButton } from "@/components/ui";
import type { FileItem } from "@/lib/types";
import { downscaleImage, uploadFile } from "./uploads";

/* --------------------------------- Segmented ------------------------------- */

export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: ReactNode }[];
  onChange: (v: T) => void;
}) {
  const id = useId();
  return (
    <div className="inline-flex flex-wrap rounded-xl bg-surface-2 p-1 ring-1 ring-inset ring-border">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={cx(
              "relative h-8 rounded-lg px-3.5 text-[13px] font-medium transition-colors",
              active ? "text-ink" : "text-ink-2 hover:text-ink",
            )}
          >
            {active && (
              <motion.span
                layoutId={`seg-${id}`}
                className="absolute inset-0 rounded-lg bg-surface shadow-sm ring-1 ring-border"
                transition={{ type: "spring", stiffness: 520, damping: 38 }}
              />
            )}
            <span className="relative">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/* --------------------------------- Tag input ------------------------------- */

export function TagInput({
  value,
  onChange,
  placeholder,
  suggestions = [],
  invalid,
}: {
  value: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
  suggestions?: string[];
  invalid?: boolean;
}) {
  const [draft, setDraft] = useState("");
  const [focus, setFocus] = useState(false);
  const add = (raw: string) => {
    const parts = raw.split(",").map((s) => s.trim()).filter(Boolean);
    if (!parts.length) return;
    onChange([...new Set([...value, ...parts])]);
    setDraft("");
  };
  const open = suggestions.filter(
    (s) => !value.includes(s) && (!draft || s.toLowerCase().includes(draft.toLowerCase())),
  );
  return (
    <div className="relative">
      <div
        className={cx(
          "flex min-h-10 flex-wrap items-center gap-1.5 rounded-xl bg-surface px-2 py-1.5 ring-1 ring-inset transition-shadow focus-within:ring-2 focus-within:ring-accent",
          invalid ? "ring-rose-300" : "ring-border",
        )}
      >
        <AnimatePresence initial={false}>
          {value.map((t) => (
            <motion.span
              key={t}
              layout
              initial={{ opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.85 }}
              className="inline-flex items-center gap-1 rounded-lg bg-accent-soft py-1 pr-1 pl-2.5 text-[13px] font-medium text-accent-ink"
            >
              {t}
              <button
                type="button"
                onClick={() => onChange(value.filter((v) => v !== t))}
                className="rounded p-0.5 hover:bg-indigo-100"
                aria-label={`Remove ${t}`}
              >
                <X className="size-3" />
              </button>
            </motion.span>
          ))}
        </AnimatePresence>
        <input
          value={draft}
          onChange={(e) => (e.target.value.endsWith(",") ? add(e.target.value) : setDraft(e.target.value))}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add(draft);
            } else if (e.key === "Backspace" && !draft && value.length) onChange(value.slice(0, -1));
          }}
          onFocus={() => setFocus(true)}
          onBlur={() => {
            setTimeout(() => setFocus(false), 120);
            add(draft);
          }}
          placeholder={value.length ? "" : placeholder}
          className="min-w-32 flex-1 bg-transparent px-1.5 text-sm outline-none placeholder:text-ink-3"
        />
      </div>
      <AnimatePresence>
        {focus && open.length > 0 && (
          <motion.ul
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="absolute z-20 mt-1.5 max-h-56 w-full overflow-y-auto rounded-xl bg-surface p-1 shadow-[var(--shadow-lift)] ring-1 ring-border"
          >
            {open.slice(0, 8).map((s) => (
              <li key={s}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => add(s)}
                  className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-surface-2"
                >
                  {s}
                </button>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}

/* --------------------------------- Repeater -------------------------------- */

export function Repeater<T>({
  items,
  onChange,
  blank,
  addLabel,
  render,
}: {
  items: T[];
  onChange: (items: T[]) => void;
  blank: () => T;
  addLabel: string;
  render: (item: T, update: (patch: Partial<T>) => void, index: number) => ReactNode;
}) {
  // Stable keys so rows animate correctly when one in the middle is removed.
  const [keys, setKeys] = useState(() => items.map((_, i) => i));
  const [nextKey, setNextKey] = useState(items.length);
  if (keys.length !== items.length) {
    // Items changed from outside (e.g. reset): re-key them.
    setKeys(items.map((_, i) => nextKey + i));
    setNextKey(nextKey + items.length);
  }
  const add = () => {
    setKeys([...keys, nextKey]);
    setNextKey(nextKey + 1);
    onChange([...items, blank()]);
  };
  const remove = (i: number) => {
    setKeys(keys.filter((_, j) => j !== i));
    onChange(items.filter((_, j) => j !== i));
  };

  return (
    <div className="space-y-3">
      <AnimatePresence initial={false}>
        {items.map((item, i) => (
          <motion.div
            key={keys[i] ?? `k${i}`}
            layout
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ type: "spring", stiffness: 400, damping: 36 }}
            className="overflow-hidden"
          >
            <div className="relative rounded-2xl bg-surface-2/60 p-4 pr-12 ring-1 ring-border">
              {render(item, (patch) => onChange(items.map((x, j) => (j === i ? { ...x, ...patch } : x))), i)}
              <IconButton
                type="button"
                label="Remove"
                className="absolute top-3 right-2 text-ink-3 hover:text-rose-600"
                onClick={() => remove(i)}
              >
                <Trash2 className="size-4" />
              </IconButton>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
      <Button type="button" variant="ghost" size="sm" icon={<Plus className="size-3.5" />} onClick={add}>
        {addLabel}
      </Button>
    </div>
  );
}

/* ---------------------------------- Uploads -------------------------------- */

function useUploader() {
  const [progress, setProgress] = useState<number | null>(null);
  const upload = async (file: File) => {
    const isPdf = file.type === "application/pdf";
    if (!isPdf && !file.type.startsWith("image/")) throw new Error("Choose an image or PDF.");
    if (file.size > (isPdf ? 25 : 10) * 1024 * 1024) throw new Error(isPdf ? "PDFs can be up to 25 MB." : "Images can be up to 10 MB.");
    setProgress(0);
    try {
      const { blob, name } = isPdf ? { blob: file as Blob, name: file.name } : await downscaleImage(file);
      return await uploadFile(blob, name, setProgress);
    } finally {
      setProgress(null);
    }
  };
  return { progress, upload };
}

function ProgressBar({ progress }: { progress: number | null }) {
  return (
    <AnimatePresence>
      {progress != null && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-x-2 bottom-2 h-1 overflow-hidden rounded-full bg-white/60"
        >
          <motion.div className="h-full bg-accent" animate={{ width: `${Math.max(6, progress * 100)}%` }} />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Small square image slot (headshots, logos). */
export function ImageSlot({
  value,
  onChange,
  round,
  label = "Add",
}: {
  value: string;
  onChange: (url: string) => void;
  round?: boolean;
  label?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const { progress, upload } = useUploader();
  const choose = async (f?: File) => {
    if (!f) return;
    try {
      onChange((await upload(f)).url);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => input.current?.click()}
        className={cx(
          "group relative flex size-16 items-center justify-center overflow-hidden bg-surface text-ink-3 ring-1 ring-border transition-colors hover:text-accent",
          round ? "rounded-full" : "rounded-xl",
        )}
      >
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={value} alt="" className={cx("size-full", round ? "object-cover" : "object-contain p-1.5")} />
        ) : progress != null ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <span className="flex flex-col items-center gap-0.5 text-[10px] font-medium">
            <ImagePlus className="size-4" />
            {label}
          </span>
        )}
        <ProgressBar progress={progress} />
      </button>
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          className="absolute -top-1 -right-1 flex size-5 items-center justify-center rounded-full bg-surface text-ink-2 shadow ring-1 ring-border hover:text-rose-600"
          aria-label="Remove image"
        >
          <X className="size-3" />
        </button>
      )}
      <input ref={input} type="file" accept="image/*" className="hidden" onChange={(e) => choose(e.target.files?.[0])} />
    </div>
  );
}

/** Grid of images with an add tile (venue photos, gallery). */
export function ImageGrid({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const { progress, upload } = useUploader();
  const choose = async (files: FileList | null) => {
    if (!files) return;
    const urls: string[] = [];
    for (const f of Array.from(files)) {
      try {
        urls.push((await upload(f)).url);
      } catch (e) {
        toast.error(`${f.name}: ${(e as Error).message}`);
      }
    }
    if (urls.length) onChange([...value, ...urls]);
    if (input.current) input.current.value = "";
  };
  return (
    <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
      <AnimatePresence initial={false}>
        {value.map((url) => (
          <motion.div
            key={url}
            layout
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="group relative overflow-hidden rounded-xl ring-1 ring-border"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt="" className="aspect-[4/3] w-full object-cover" />
            <button
              type="button"
              onClick={() => onChange(value.filter((v) => v !== url))}
              className="absolute top-1.5 right-1.5 flex size-6 items-center justify-center rounded-full bg-white/90 text-ink-2 opacity-0 shadow transition-opacity group-hover:opacity-100 hover:text-rose-600"
              aria-label="Remove photo"
            >
              <X className="size-3.5" />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
      <button
        type="button"
        onClick={() => input.current?.click()}
        className="relative flex aspect-[4/3] flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-border-strong text-xs font-medium text-ink-3 transition-colors hover:border-accent hover:text-accent"
      >
        {progress != null ? <Loader2 className="size-4 animate-spin" /> : <ImagePlus className="size-4" />}
        Add photos
        <ProgressBar progress={progress} />
      </button>
      <input ref={input} type="file" accept="image/*" multiple className="hidden" onChange={(e) => choose(e.target.files)} />
    </div>
  );
}

/** One file (image or PDF), shown as a row. Used for the flyer. */
export function SingleFile({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  const input = useRef<HTMLInputElement>(null);
  const { progress, upload } = useUploader();
  const choose = async (f?: File) => {
    if (!f) return;
    try {
      onChange((await upload(f)).url);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  const isPdf = value.endsWith(".pdf");
  return (
    <div className="flex items-center gap-3">
      {value ? (
        <a href={value} target="_blank" rel="noopener noreferrer" className="flex min-w-0 flex-1 items-center gap-3 rounded-xl px-3 py-2 ring-1 ring-border hover:bg-surface-2">
          {isPdf ? (
            <span className="flex size-10 items-center justify-center rounded-lg bg-rose-50 text-rose-600">
              <FileText className="size-4" />
            </span>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={value} alt="" className="size-10 rounded-lg object-cover" />
          )}
          <span className="truncate text-sm font-medium">{label}</span>
        </a>
      ) : (
        <Button type="button" variant="secondary" icon={<Upload className="size-4" />} loading={progress != null} onClick={() => input.current?.click()}>
          Upload {label.toLowerCase()}
        </Button>
      )}
      {value && (
        <IconButton type="button" label="Remove" onClick={() => onChange("")} className="hover:text-rose-600">
          <Trash2 className="size-4" />
        </IconButton>
      )}
      <input ref={input} type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => choose(e.target.files?.[0])} />
    </div>
  );
}

/** List of named attachments. */
export function Attachments({ value, onChange }: { value: FileItem[]; onChange: (v: FileItem[]) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const { progress, upload } = useUploader();
  const choose = async (files: FileList | null) => {
    if (!files) return;
    const out: FileItem[] = [];
    for (const f of Array.from(files)) {
      try {
        const u = await upload(f);
        out.push({ name: f.name.replace(/\.\w+$/, ""), url: u.url });
      } catch (e) {
        toast.error(`${f.name}: ${(e as Error).message}`);
      }
    }
    if (out.length) onChange([...value, ...out]);
    if (input.current) input.current.value = "";
  };
  return (
    <div className="space-y-2">
      <AnimatePresence initial={false}>
        {value.map((a, i) => (
          <motion.div
            key={a.url}
            layout
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="flex items-center gap-3 rounded-xl px-3 py-2 ring-1 ring-border">
              <FileText className="size-4 shrink-0 text-ink-3" />
              <input
                value={a.name}
                onChange={(e) => onChange(value.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
                className="min-w-0 flex-1 bg-transparent text-sm outline-none"
              />
              <a href={a.url} target="_blank" rel="noopener noreferrer" className="text-xs text-accent hover:underline">
                View
              </a>
              <IconButton type="button" label="Remove" onClick={() => onChange(value.filter((_, j) => j !== i))} className="size-7 hover:text-rose-600">
                <Trash2 className="size-3.5" />
              </IconButton>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
      <Button type="button" variant="ghost" size="sm" icon={<Plus className="size-3.5" />} loading={progress != null} onClick={() => input.current?.click()}>
        Add files
      </Button>
      <input ref={input} type="file" accept="image/*,application/pdf" multiple className="hidden" onChange={(e) => choose(e.target.files)} />
    </div>
  );
}
