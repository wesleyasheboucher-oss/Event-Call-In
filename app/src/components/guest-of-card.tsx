"use client";

import { motion } from "motion/react";
import { Phone, UserPlus } from "lucide-react";
import { formatPhone, telHref } from "@/lib/phone";

export type GuestHost = { name: string; phone: string | null; eventName?: string; onOpen?: () => void };

/**
 * Shown on a guest's drawer: who brought them, with that person's phone
 * one tap away (the host is usually the one to call about a guest).
 */
export function GuestOfCard({ hosts }: { hosts: GuestHost[] }) {
  if (hosts.length === 0) return null;
  return (
    <div className="space-y-2">
      {hosts.map((h, i) => (
        <motion.div
          key={`${h.name}-${h.eventName ?? i}`}
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-3 rounded-2xl bg-violet-50 px-4 py-3 ring-1 ring-violet-200"
        >
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-white text-violet-600 ring-1 ring-violet-200">
            <UserPlus className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm text-violet-900">
              Guest of{" "}
              {h.onOpen ? (
                <button onClick={h.onOpen} className="font-semibold underline-offset-2 hover:underline">
                  {h.name}
                </button>
              ) : (
                <span className="font-semibold">{h.name}</span>
              )}
            </div>
            {h.eventName && <div className="truncate text-xs text-violet-700/80">{h.eventName}</div>}
          </div>
          {h.phone ? (
            <a
              href={telHref(h.phone)}
              className="inline-flex h-10 shrink-0 items-center gap-2 rounded-xl bg-white px-3 text-sm font-medium text-violet-900 tabular-nums ring-1 ring-violet-200 transition-colors hover:bg-violet-100"
              aria-label={`Call ${h.name}`}
            >
              <Phone className="size-4 text-violet-600" />
              {formatPhone(h.phone)}
            </a>
          ) : (
            <span className="shrink-0 text-xs text-violet-700/70">No phone</span>
          )}
        </motion.div>
      ))}
    </div>
  );
}
