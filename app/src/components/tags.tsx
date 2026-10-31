"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { AnimatePresence, motion } from "motion/react";
import { toast } from "sonner";
import { Check, Plus, Search, Tag as TagIcon, X } from "lucide-react";
import { addTagToContact, fetchTags, removeTagFromContact } from "@/app/actions/tags";
import { TAG_STYLE, type Tag, type TagWithCount } from "@/lib/tag-colors";
import { cx } from "./ui";

export function TagChip({
  tag,
  onRemove,
  size = "sm",
  className,
}: {
  tag: Tag;
  onRemove?: () => void;
  size?: "xs" | "sm";
  className?: string;
}) {
  const s = TAG_STYLE[tag.color] ?? TAG_STYLE.slate;
  return (
    <span
      className={cx(
        "inline-flex max-w-full items-center gap-1 rounded-full font-medium whitespace-nowrap ring-1 ring-inset",
        size === "xs" ? "px-2 py-px text-[11px]" : "px-2.5 py-0.5 text-xs",
        s.chip,
        className,
      )}
    >
      <span className={cx("size-1.5 shrink-0 rounded-full", s.dot)} />
      <span className="truncate">{tag.name}</span>
      {onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="-mr-1 ml-0.5 flex size-4 items-center justify-center rounded-full opacity-60 transition-opacity hover:bg-black/5 hover:opacity-100"
          aria-label={`Remove tag ${tag.name}`}
        >
          <X className="size-3" />
        </button>
      )}
    </span>
  );
}

/**
 * Inline search-and-pick list of tags with "Create" for new names.
 * Expands in place (no floating popover) so it behaves the same in drawers and on phones.
 */
export function TagSelector({
  allTags,
  selectedIds,
  onPick,
  onCreate,
  onClose,
  busy,
  placeholder = "Find or create a tag",
}: {
  allTags: TagWithCount[] | null;
  selectedIds: Set<number>;
  onPick: (tag: TagWithCount) => void;
  onCreate: (name: string) => void;
  onClose: () => void;
  busy?: boolean;
  placeholder?: string;
}) {
  const [q, setQ] = useState("");
  const query = q.trim();
  const matches = useMemo(() => {
    if (!allTags) return [];
    const lower = query.toLowerCase();
    return allTags.filter((t) => t.name.toLowerCase().includes(lower));
  }, [allTags, query]);
  const exact = allTags?.some((t) => t.name.toLowerCase() === query.toLowerCase());

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") onClose();
    if (e.key === "Enter") {
      e.preventDefault();
      if (query && !exact) onCreate(query);
      else if (matches[0]) onPick(matches[0]);
      setQ("");
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.2 }}
      className="overflow-hidden"
    >
      <div className="mt-2 rounded-2xl bg-surface ring-1 ring-border shadow-[var(--shadow-soft)]">
        <div className="relative border-b border-border">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-ink-3" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={placeholder}
            maxLength={40}
            className="h-12 w-full rounded-t-2xl bg-transparent pr-10 pl-10 text-[15px] outline-none placeholder:text-ink-3 sm:h-11 sm:text-sm"
          />
          <button
            type="button"
            onClick={onClose}
            className="absolute top-1/2 right-2 flex size-8 -translate-y-1/2 items-center justify-center rounded-lg text-ink-3 hover:bg-surface-2"
            aria-label="Close tag picker"
          >
            <X className="size-4" />
          </button>
        </div>
        <ul className="max-h-64 overflow-y-auto overscroll-contain p-1.5">
          {query && !exact && (
            <li>
              <button
                type="button"
                disabled={busy}
                onClick={() => (onCreate(query), setQ(""))}
                className="flex min-h-11 w-full items-center gap-2.5 rounded-xl px-3 text-left text-sm text-accent-ink transition-colors hover:bg-accent-soft"
              >
                <Plus className="size-4" />
                Create <span className="font-semibold">“{query}”</span>
              </button>
            </li>
          )}
          {allTags === null ? (
            <li className="px-3 py-3 text-sm text-ink-3">Loading tags…</li>
          ) : matches.length === 0 && !query ? (
            <li className="px-3 py-3 text-sm text-ink-3">No tags yet. Type a name to create one.</li>
          ) : (
            matches.map((t) => {
              const on = selectedIds.has(t.id);
              return (
                <li key={t.id}>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onPick(t)}
                    className="flex min-h-11 w-full items-center gap-2.5 rounded-xl px-3 text-left text-sm transition-colors hover:bg-surface-2"
                  >
                    <span className={cx("size-2.5 shrink-0 rounded-full", TAG_STYLE[t.color]?.dot)} />
                    <span className="min-w-0 flex-1 truncate">{t.name}</span>
                    <span className="text-xs text-ink-3 tabular-nums">{t.count}</span>
                    <span
                      className={cx(
                        "flex size-5 items-center justify-center rounded-md ring-1 transition-colors",
                        on ? "bg-accent text-white ring-accent" : "ring-border-strong",
                      )}
                    >
                      {on && <Check className="size-3.5" strokeWidth={3} />}
                    </span>
                  </button>
                </li>
              );
            })
          )}
        </ul>
      </div>
    </motion.div>
  );
}

/** A contact's tags with add/remove; used in every contact drawer. */
export function ContactTagsEditor({
  contactId,
  tags,
  onChange,
}: {
  contactId: number;
  tags: Tag[];
  onChange: (tags: Tag[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [allTags, setAllTags] = useState<TagWithCount[] | null>(null);
  const [busy, start] = useTransition();
  const loaded = useRef(false);
  const selected = useMemo(() => new Set(tags.map((t) => t.id)), [tags]);

  const openPicker = () => {
    setOpen(true);
    if (!loaded.current) {
      loaded.current = true;
      fetchTags().then(setAllTags);
    }
  };

  const bump = (id: number, delta: number) =>
    setAllTags((all) => all?.map((t) => (t.id === id ? { ...t, count: t.count + delta } : t)) ?? all);

  const add = (tag: { id: number } | { name: string }) =>
    start(async () => {
      const res = await addTagToContact(contactId, tag);
      if (!res.ok) return void toast.error(res.error);
      onChange(res.tags);
      if (res.created) setAllTags((all) => (all ? [...all, { ...res.created!, count: 1 }].sort((a, b) => a.name.localeCompare(b.name)) : all));
      else if ("id" in tag) bump(tag.id, 1);
    });

  const remove = (tag: Tag) =>
    start(async () => {
      onChange(tags.filter((t) => t.id !== tag.id));
      try {
        onChange(await removeTagFromContact(contactId, tag.id));
        bump(tag.id, -1);
      } catch {
        onChange(tags);
        toast.error("Couldn't remove that tag.");
      }
    });

  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5">
        <AnimatePresence initial={false}>
          {tags.map((t) => (
            <motion.span
              key={t.id}
              layout
              initial={{ opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.85 }}
              transition={{ type: "spring", stiffness: 600, damping: 32 }}
            >
              <TagChip tag={t} onRemove={() => remove(t)} />
            </motion.span>
          ))}
        </AnimatePresence>
        {!open && (
          <button
            type="button"
            onClick={openPicker}
            className="inline-flex h-7 items-center gap-1 rounded-full px-2.5 text-xs font-medium text-ink-2 ring-1 ring-border ring-inset transition-colors hover:bg-surface-2 hover:text-ink"
          >
            {tags.length ? <Plus className="size-3" /> : <TagIcon className="size-3" />}
            {tags.length ? "Tag" : "Add a tag"}
          </button>
        )}
      </div>
      <AnimatePresence>
        {open && (
          <TagSelector
            allTags={allTags}
            selectedIds={selected}
            busy={busy}
            onPick={(t) => (selected.has(t.id) ? remove(t) : add({ id: t.id }))}
            onCreate={(name) => add({ name })}
            onClose={() => setOpen(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
