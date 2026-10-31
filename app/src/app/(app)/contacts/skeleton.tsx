import { Skeleton } from "@/components/ui";

export function ContactsSkeleton() {
  return (
    <div className="mx-auto max-w-[1400px] px-4 py-8 sm:px-8 lg:py-12">
      <Skeleton className="mb-3 h-8 w-48" />
      <Skeleton className="mb-10 h-4 w-72" />
      <Skeleton className="mb-4 h-11 w-full max-w-md" />
      <div className="mb-5 flex gap-2">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-8 w-24 rounded-full" />
        ))}
      </div>
      <div className="space-y-2 rounded-2xl bg-surface p-4 ring-1 ring-border">
        {Array.from({ length: 10 }, (_, i) => (
          <Skeleton key={i} className="h-10" />
        ))}
      </div>
    </div>
  );
}
