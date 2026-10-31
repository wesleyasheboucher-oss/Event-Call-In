import { clsx as cx } from "clsx";

const GRADIENTS: Record<string, string> = {
  Networking: "from-indigo-500 via-violet-500 to-fuchsia-400",
  Workshop: "from-sky-500 via-cyan-500 to-emerald-400",
  Social: "from-amber-400 via-orange-400 to-rose-400",
  Fundraiser: "from-emerald-500 via-teal-500 to-sky-400",
  Meeting: "from-stone-500 via-stone-400 to-stone-300",
};

/** Cover image, or a category gradient when none has been uploaded. */
export function EventCover({
  src,
  category,
  name,
  className,
  rounded = "rounded-2xl",
}: {
  src?: string;
  category?: string;
  name: string;
  className?: string;
  rounded?: string;
}) {
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={src} alt="" className={cx("aspect-[1.91/1] w-full object-cover", rounded, className)} />
    );
  }
  const g = GRADIENTS[category ?? ""] ?? "from-indigo-400 via-sky-400 to-emerald-300";
  return (
    <div className={cx("relative aspect-[1.91/1] w-full overflow-hidden bg-gradient-to-br", g, rounded, className)}>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.35),transparent_45%),radial-gradient(circle_at_85%_90%,rgba(0,0,0,0.12),transparent_50%)]" />
      <span className="absolute right-4 bottom-2 text-[64px] leading-none font-bold tracking-tighter text-white/25 select-none">
        {name
          .split(/\s+/)
          .slice(0, 2)
          .map((w) => w[0])
          .join("")}
      </span>
    </div>
  );
}
