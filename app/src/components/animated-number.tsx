"use client";

import { useEffect, useRef } from "react";
import { animate } from "motion/react";

/** Counts smoothly from the previous value to the new one. */
export function AnimatedNumber({ value, format }: { value: number; format?: (n: number) => string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const prev = useRef(value);
  const fmtRef = useRef(format);
  useEffect(() => {
    fmtRef.current = format;
  });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const controls = animate(prev.current, value, {
      duration: 0.5,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => {
        const n = Math.round(v);
        el.textContent = fmtRef.current ? fmtRef.current(n) : String(n);
      },
    });
    prev.current = value;
    return () => controls.stop();
  }, [value]);

  return <span ref={ref}>{format ? format(value) : value}</span>;
}
