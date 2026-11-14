"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, MessageSquareText, PenLine } from "lucide-react";
import { fieldValues, fillTemplate, smsHref, type TextEvent, type TextTemplate } from "@/lib/texting";
import { formatPhone } from "@/lib/phone";
import { fmt } from "@/lib/time";
import { BottomSheet } from "./drawer";
import { cx, Textarea } from "./ui";

export type TextPerson = { first_name: string; last_name: string; phone: string; alt_phone: string };

/**
 * "Share via text": pick a template (filled in for this person and event), adjust it if
 * needed, then open the phone's Messages app with the number and message ready to send.
 */
export function TextSheet({
  open,
  onClose,
  person,
  templates,
  events,
  eventIds,
  me,
  onSent,
}: {
  open: boolean;
  onClose: () => void;
  person: TextPerson | null;
  templates: TextTemplate[];
  events: TextEvent[];
  /** events this text could be about (e.g. the selected Call In events they're on), first = default */
  eventIds: number[];
  me: string;
  onSent?: () => void;
}) {
  const [eventId, setEventId] = useState<number | null>(eventIds[0] ?? null);
  const [message, setMessage] = useState<string | null>(null);
  const [to, setTo] = useState<"phone" | "alt_phone">("phone");
  const [prevKey, setPrevKey] = useState("");
  // Start fresh each time it opens for someone.
  const key = `${open}:${person?.phone}:${eventIds.join(",")}`;
  if (key !== prevKey) {
    setPrevKey(key);
    setEventId(eventIds[0] ?? null);
    setMessage(null);
    setTo(person?.phone ? "phone" : "alt_phone");
  }
  if (!person) return null;

  const byId = new Map(events.map((e) => [e.id, e]));
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const fill = (t: TextTemplate) =>
    fillTemplate(t.body, fieldValues({ person, event: byId.get(t.event_id ?? eventId ?? -1) ?? null, me, origin }));
  // This event's own templates first, then the general ones. Other events' templates stay out of the way.
  const list = [
    ...templates.filter((t) => t.event_id != null && t.event_id === eventId),
    ...templates.filter((t) => t.event_id == null),
    ...(eventId == null ? templates.filter((t) => t.event_id != null) : []),
  ];
  const number = person[to] || person.phone || person.alt_phone;
  const name = `${person.first_name} ${person.last_name}`.trim();

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={message === null ? `Text ${person.first_name}` : "Your message"}
      footer={
        message !== null && (
          <div className="flex items-center justify-between gap-3">
            <button type="button" onClick={() => setMessage(null)} className="inline-flex items-center gap-1 text-sm font-medium text-ink-2 hover:text-ink">
              <ChevronLeft className="size-4" /> Templates
            </button>
            <a
              href={smsHref(number, message)}
              onClick={() => {
                onSent?.();
                onClose();
              }}
              className={cx(
                "inline-flex h-11 items-center gap-2 rounded-xl bg-emerald-600 px-5 text-[15px] font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700",
                !message.trim() && "pointer-events-none opacity-50",
              )}
            >
              <MessageSquareText className="size-4" /> Open in Messages
            </a>
          </div>
        )
      }
    >
      <div className="space-y-5 px-6 py-5">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-ink-3">To</span>
          {(["phone", "alt_phone"] as const)
            .filter((k) => person[k])
            .map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setTo(k)}
                className={cx(
                  "h-8 rounded-full px-3 font-medium tabular-nums ring-1 transition-colors ring-inset",
                  to === k ? "bg-ink text-white ring-ink" : "bg-surface text-ink-2 ring-border",
                )}
              >
                {formatPhone(person[k])}
                {k === "alt_phone" && <span className="ml-1 text-xs opacity-70">2nd</span>}
              </button>
            ))}
          <span className="text-ink-3">· {name}</span>
        </div>

        {eventIds.length > 1 && message === null && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-sm text-ink-3">About</span>
            {eventIds.map((id) => {
              const e = byId.get(id);
              if (!e) return null;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setEventId(id)}
                  className={cx(
                    "h-8 rounded-full px-3 text-[13px] font-medium ring-1 transition-colors ring-inset",
                    eventId === id ? "bg-accent text-white ring-accent" : "bg-surface text-ink-2 ring-border",
                  )}
                >
                  {e.name} · {fmt(e.start_at, e.time_zone, "MMM d")}
                </button>
              );
            })}
          </div>
        )}

        {message === null ? (
          <div className="space-y-2">
            {list.length === 0 && (
              <p className="rounded-xl bg-surface-2 px-4 py-3 text-sm text-ink-2">
                No text templates yet. An admin can add them under Text templates. You can still write your own below.
              </p>
            )}
            {list.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setMessage(fill(t))}
                className="flex w-full items-start gap-3 rounded-2xl bg-surface p-4 text-left ring-1 ring-border transition-all hover:ring-border-strong active:scale-[0.99]"
              >
                <span className="min-w-0 flex-1">
                  <span className="block font-medium text-ink">{t.name}</span>
                  <span className="mt-1 line-clamp-3 block text-[13px] whitespace-pre-line text-ink-2">{fill(t)}</span>
                </span>
                <ChevronRight className="mt-0.5 size-4 shrink-0 text-ink-3" />
              </button>
            ))}
            <button
              type="button"
              onClick={() => setMessage("")}
              className="flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm font-medium text-ink-2 ring-1 ring-border ring-dashed transition-colors hover:text-ink"
            >
              <PenLine className="size-4" /> Write my own
            </button>
          </div>
        ) : (
          <div>
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              autoFocus={message === ""}
              className="min-h-44 text-[15px]"
              placeholder={`Hi ${person.first_name}…`}
            />
            <p className="mt-2 text-xs text-ink-3">You can still change it in Messages before you send.</p>
          </div>
        )}
      </div>
    </BottomSheet>
  );
}
