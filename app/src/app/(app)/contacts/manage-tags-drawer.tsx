"use client";

import { useState, useTransition } from "react";
import { AnimatePresence, motion } from "motion/react";
import { toast } from "sonner";
import { Check, Plus, Tag as TagIcon, Trash2 } from "lucide-react";
import { createTag, deleteTag, updateTag } from "@/app/actions/tags";
import { Drawer, Modal } from "@/components/drawer";
import { Button, cx, EmptyState, Input } from "@/components/ui";
import { TAG_COLORS, TAG_STYLE, type TagColor, type TagWithCount } from "@/lib/tag-colors";

/** Admin: create, rename, recolor and delete tags. */
export function ManageTagsDrawer({
  open,
  onClose,
  tags,
}: {
  open: boolean;
  onClose: () => void;
  tags: TagWithCount[];
}) {
  const [newName, setNewName] = useState("");
  const [confirm, setConfirm] = useState<TagWithCount | null>(null);
  const [pending, start] = useTransition();

  const add = () =>
    start(async () => {
      if (!newName.trim()) return;
      const res = await createTag(newName);
      if (!res.ok) return void toast.error(res.error);
      setNewName("");
      toast.success(`Created “${res.tag.name}”`);
    });

  return (
    <Drawer open={open} onClose={onClose} title="Tags" subtitle="Labels you can put on any contact." width="sm">
      <div className="space-y-6 px-6 py-6">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            add();
          }}
          className="flex gap-2"
        >
          <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="New tag name" maxLength={40} />
          <Button type="submit" variant="primary" loading={pending} disabled={!newName.trim()} icon={<Plus className="size-4" />}>
            Add
          </Button>
        </form>

        {tags.length === 0 ? (
          <EmptyState icon={<TagIcon className="size-5" />} title="No tags yet" body="Create one above, or from any contact's record." />
        ) : (
          <ul className="space-y-2">
            <AnimatePresence initial={false}>
              {tags.map((t) => (
                <TagRow key={t.id} tag={t} onDelete={() => setConfirm(t)} />
              ))}
            </AnimatePresence>
          </ul>
        )}
      </div>

      <Modal
        open={!!confirm}
        onClose={() => setConfirm(null)}
        title={`Delete “${confirm?.name}”?`}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirm(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={pending}
              onClick={() =>
                start(async () => {
                  if (!confirm) return;
                  await deleteTag(confirm.id);
                  toast.success(`Deleted “${confirm.name}”`);
                  setConfirm(null);
                })
              }
            >
              Delete tag
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink-2">
          {confirm?.count
            ? `It will be removed from ${confirm.count} ${confirm.count === 1 ? "person" : "people"}. The contacts themselves stay.`
            : "No one has this tag yet."}
        </p>
      </Modal>
    </Drawer>
  );
}

function TagRow({ tag, onDelete }: { tag: TagWithCount; onDelete: () => void }) {
  const [name, setName] = useState(tag.name);
  const [colorOpen, setColorOpen] = useState(false);
  const [, start] = useTransition();

  const save = (patch: { name?: string; color?: TagColor }) =>
    start(async () => {
      const res = await updateTag(tag.id, patch);
      if (!res.ok) {
        toast.error(res.error);
        setName(tag.name);
      }
    });

  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: 16 }}
      className="rounded-2xl ring-1 ring-border"
    >
      <div className="flex items-center gap-2 p-2">
        <button
          onClick={() => setColorOpen((o) => !o)}
          className="flex size-10 shrink-0 items-center justify-center rounded-xl hover:bg-surface-2"
          aria-label="Change color"
          title="Change color"
        >
          <span className={cx("size-4 rounded-full ring-2 ring-white", TAG_STYLE[tag.color].dot)} />
        </button>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => name.trim() !== tag.name && save({ name })}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
          maxLength={40}
          className="h-10 min-w-0 flex-1 rounded-lg bg-transparent px-2 text-[15px] font-medium outline-none focus:bg-surface-2 sm:text-sm"
          aria-label="Tag name"
        />
        <span className="shrink-0 text-xs text-ink-3 tabular-nums">
          {tag.count} {tag.count === 1 ? "person" : "people"}
        </span>
        <button
          onClick={onDelete}
          className="flex size-10 shrink-0 items-center justify-center rounded-xl text-ink-3 hover:bg-rose-50 hover:text-rose-600"
          aria-label={`Delete ${tag.name}`}
        >
          <Trash2 className="size-4" />
        </button>
      </div>
      <AnimatePresence initial={false}>
        {colorOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="flex flex-wrap gap-2 px-3 pb-3">
              {TAG_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => {
                    save({ color: c });
                    setColorOpen(false);
                  }}
                  className={cx(
                    "flex size-9 items-center justify-center rounded-full ring-2 ring-offset-2 transition-transform active:scale-95",
                    TAG_STYLE[c].dot,
                    c === tag.color ? "ring-ink" : "ring-transparent",
                  )}
                  aria-label={c}
                >
                  {c === tag.color && <Check className="size-4 text-white" strokeWidth={3} />}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.li>
  );
}
