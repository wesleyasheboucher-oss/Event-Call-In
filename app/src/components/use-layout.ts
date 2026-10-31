"use client";

import { useSyncExternalStore } from "react";

const QUERY = "(min-width: 768px)";

function subscribe(onChange: () => void) {
  const mq = window.matchMedia(QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

/**
 * "table" from 768px up, "cards" on phones, null during the server render.
 * Long lists render only the layout in use (rendering both and hiding one with CSS
 * doubles the work, which phones feel most).
 */
export function useListLayout(): "table" | "cards" | null {
  return useSyncExternalStore(
    subscribe,
    () => (window.matchMedia(QUERY).matches ? "table" : "cards"),
    () => null,
  );
}
