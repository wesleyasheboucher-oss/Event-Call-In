"use client";

import { useTransition } from "react";
import { WifiOff } from "lucide-react";
import { Button, EmptyState } from "@/components/ui";

// Shown when a page fails to load (a dropped connection, a timeout) instead of a blank screen.
export default function AppError({ retry }: { error: Error; retry: () => void }) {
  const [retrying, startRetry] = useTransition();
  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-8 lg:py-12">
      <EmptyState
        icon={<WifiOff className="size-6" />}
        title="This page didn't load"
        body="Usually a weak connection. Try again in a moment."
        action={
          <Button
            disabled={retrying}
            onClick={() => startRetry(() => retry())}
          >
            {retrying ? "Trying…" : "Try again"}
          </Button>
        }
      />
    </div>
  );
}
