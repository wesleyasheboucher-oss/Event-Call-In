"use client";

import { useCallback, useRef, useState } from "react";
import Cropper, { type Area } from "react-easy-crop";
import { AnimatePresence, motion } from "motion/react";
import { toast } from "sonner";
import { ImagePlus, Trash2, Crop } from "lucide-react";
import { Modal } from "@/components/drawer";
import { Button } from "@/components/ui";
import { EventCover } from "@/components/event-cover";
import { cropCover, uploadFile } from "./uploads";

const ASPECT = 1920 / 1005;

/** Cover image picker: choose → crop to 1.91:1 → upload cover + thumbnail. */
export function CoverField({
  cover,
  name,
  category,
  onChange,
}: {
  cover: string;
  name: string;
  category: string;
  onChange: (cover: string, thumb: string) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [area, setArea] = useState<Area | null>(null);
  const [progress, setProgress] = useState<number | null>(null);

  const pick = (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) return toast.error("Choose an image file.");
    if (file.size > 10 * 1024 * 1024) return toast.error("Images can be up to 10 MB.");
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setSrc(URL.createObjectURL(file));
  };

  const close = () => {
    if (src) URL.revokeObjectURL(src);
    setSrc(null);
    if (input.current) input.current.value = "";
  };

  const onComplete = useCallback((_: Area, px: Area) => setArea(px), []);

  const save = async () => {
    if (!src || !area) return;
    try {
      setProgress(0);
      const { cover, thumb } = await cropCover(src, area);
      const [c, t] = await Promise.all([
        uploadFile(cover, "cover.jpg", (p) => setProgress(p * 0.85)),
        uploadFile(thumb, "cover-thumb.jpg"),
      ]);
      onChange(c.url, t.url);
      toast.success("Cover image updated");
      close();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setProgress(null);
    }
  };

  return (
    <div>
      <div
        className="group relative cursor-pointer overflow-hidden rounded-2xl ring-1 ring-border"
        onClick={() => input.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          pick(e.dataTransfer.files[0]);
        }}
      >
        <EventCover src={cover} category={category} name={name || "New event"} rounded="rounded-none" />
        <div className="absolute inset-0 flex items-center justify-center bg-stone-900/0 transition-colors group-hover:bg-stone-900/35">
          <span className="inline-flex translate-y-1 items-center gap-2 rounded-xl bg-white/95 px-4 py-2 text-sm font-medium opacity-0 shadow-sm transition-all group-hover:translate-y-0 group-hover:opacity-100">
            <ImagePlus className="size-4" /> {cover ? "Replace cover" : "Upload a cover image"}
          </span>
        </div>
      </div>
      <div className="mt-2 flex items-center justify-between text-xs text-ink-3">
        <span>Recommended 1920 × 1005 (about 1.91:1). Drag an image here or click to choose.</span>
        {cover && (
          <button type="button" onClick={() => onChange("", "")} className="inline-flex items-center gap-1 text-rose-600 hover:underline">
            <Trash2 className="size-3" /> Remove
          </button>
        )}
      </div>
      <input ref={input} type="file" accept="image/*" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />

      <Modal
        open={!!src}
        onClose={close}
        title={
          <span className="inline-flex items-center gap-2">
            <Crop className="size-4 text-ink-3" /> Crop cover
          </span>
        }
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={close} disabled={progress != null}>
              Cancel
            </Button>
            <Button variant="primary" onClick={save} loading={progress != null}>
              Use this crop
            </Button>
          </>
        }
      >
        {src && (
          <div>
            <div className="relative aspect-[1.91/1] w-full overflow-hidden rounded-xl bg-stone-900">
              <Cropper
                image={src}
                crop={crop}
                zoom={zoom}
                aspect={ASPECT}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={onComplete}
                showGrid={false}
              />
            </div>
            <div className="mt-4 flex items-center gap-3">
              <span className="text-xs text-ink-3">Zoom</span>
              <input
                type="range"
                min={1}
                max={3}
                step={0.01}
                value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
                className="flex-1 accent-[var(--accent)]"
              />
            </div>
            <AnimatePresence>
              {progress != null && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="mt-4 h-1.5 overflow-hidden rounded-full bg-stone-100"
                >
                  <motion.div className="h-full bg-accent" animate={{ width: `${Math.max(5, progress * 100)}%` }} />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </Modal>
    </div>
  );
}
