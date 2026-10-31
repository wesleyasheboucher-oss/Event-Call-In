"use client";

import type { Area } from "react-easy-crop";

export type Uploaded = { url: string; name: string; size: number };

const EXT_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  pdf: "application/pdf",
};

/**
 * Uploads one file, reporting progress from 0 to 1. The server validates and
 * returns a one-time target (Supabase Storage in production); the bytes go
 * straight there, never through a serverless function.
 */
export async function uploadFile(file: Blob, filename: string, onProgress?: (p: number) => void): Promise<Uploaded> {
  const type = file.type || EXT_TYPES[filename.split(".").pop()?.toLowerCase() ?? ""] || "";
  const res = await fetch("/api/upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filename, type, size: file.size }),
  });
  const target = (await res.json().catch(() => ({}))) as { uploadUrl?: string; url?: string; error?: string };
  if (!res.ok || !target.uploadUrl || !target.url) throw new Error(target.error || `Upload failed (${res.status})`);

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", target.uploadUrl!);
    xhr.setRequestHeader("Content-Type", type);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Upload failed (${xhr.status})`));
    xhr.onerror = () => reject(new Error("Network error while uploading"));
    xhr.send(file);
  });
  return { url: target.url, name: filename, size: file.size };
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Couldn't read that image"));
    img.src = src;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, type = "image/jpeg", quality = 0.88): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't encode image"))), type, quality),
  );
}

/** Downscale an image so its longest side is at most `max` px. PNGs stay PNG (transparency). */
export async function downscaleImage(file: File, max = 1920): Promise<{ blob: Blob; name: string }> {
  if (file.type === "image/gif") return { blob: file, name: file.name };
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    if (scale === 1 && file.size < 2 * 1024 * 1024) return { blob: file, name: file.name };
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
    const png = file.type === "image/png";
    const blob = await canvasToBlob(canvas, png ? "image/png" : "image/jpeg");
    return { blob, name: file.name.replace(/\.\w+$/, png ? ".png" : ".jpg") };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Render the cropped region at 1920×1005 (cover) and 640×335 (thumbnail) as JPEGs. */
export async function cropCover(src: string, area: Area): Promise<{ cover: Blob; thumb: Blob }> {
  const img = await loadImage(src);
  const render = (w: number, h: number) => {
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d")!;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, area.x, area.y, area.width, area.height, 0, 0, w, h);
    return canvasToBlob(canvas, "image/jpeg", 0.86);
  };
  const [cover, thumb] = await Promise.all([render(1920, 1005), render(640, 335)]);
  return { cover, thumb };
}
