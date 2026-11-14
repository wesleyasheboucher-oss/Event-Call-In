"use client";

import { useRef, useState, useTransition } from "react";
import { MessageSquareText, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteTextTemplate, saveTextTemplate } from "@/app/actions/text-templates";
import { fieldValues, fillTemplate, missingFields, TEXT_FIELDS, type TextEvent, type TextTemplate } from "@/lib/texting";
import { fmt } from "@/lib/time";
import { Drawer } from "@/components/drawer";
import { Button, Card, EmptyState, Field, Input, Select, Textarea } from "@/components/ui";

type Draft = { id?: number; name: string; body: string; eventId: number | null };

const STARTER =
  "Hi {first_name}, it's {my_name}! Just a reminder about {event_name} on {event_date} at {event_time}, at {venue}. Can we count on you to be there?";

export function TemplatesView({ templates, events, me }: { templates: TextTemplate[]; events: TextEvent[]; me: string }) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const eventName = (id: number | null) => (id == null ? null : events.find((e) => e.id === id)?.name ?? "An earlier event");

  return (
    <>
      <div className="mb-4 flex justify-end">
        <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setDraft({ name: "", body: STARTER, eventId: null })}>
          New template
        </Button>
      </div>
      {templates.length === 0 ? (
        <Card className="p-0">
          <EmptyState
            icon={<MessageSquareText className="size-5" />}
            title="No text templates yet"
            body="Create one, and callers get a Text button in Call In that opens their Messages app with it typed out."
            action={
              <Button variant="primary" onClick={() => setDraft({ name: "Reminder", body: STARTER, eventId: null })}>
                Create the first one
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {templates.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setDraft({ id: t.id, name: t.name, body: t.body, eventId: t.event_id })}
              className="rounded-2xl bg-surface p-4 text-left ring-1 ring-border transition-all hover:ring-border-strong"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-medium text-ink">{t.name}</span>
                <span className="shrink-0 rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-ink-2 ring-1 ring-border">
                  {eventName(t.event_id) ?? "Any event"}
                </span>
              </div>
              <p className="mt-2 line-clamp-3 text-[13px] whitespace-pre-line text-ink-2">{t.body}</p>
            </button>
          ))}
        </div>
      )}

      {draft && <Editor draft={draft} events={events} me={me} onClose={() => setDraft(null)} />}
    </>
  );
}

function Editor({ draft: initial, events, me, onClose }: { draft: Draft; events: TextEvent[]; me: string; onClose: () => void }) {
  const [d, setD] = useState(initial);
  const [pending, startTransition] = useTransition();
  const box = useRef<HTMLTextAreaElement>(null);
  const previewEvent = events.find((e) => e.id === d.eventId) ?? events[0] ?? null;
  const values = fieldValues({
    person: { first_name: "Maria", last_name: "Lopez" },
    event: previewEvent,
    me,
    origin: typeof window === "undefined" ? "" : window.location.origin,
  });
  const preview = fillTemplate(d.body, values);
  const missing = missingFields(d.body, values);

  // Put {field} where the cursor is, then leave the cursor after it.
  const insert = (key: string) => {
    const el = box.current;
    const token = `{${key}}`;
    const start = el?.selectionStart ?? d.body.length;
    const end = el?.selectionEnd ?? d.body.length;
    const body = d.body.slice(0, start) + token + d.body.slice(end);
    setD({ ...d, body });
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + token.length, start + token.length);
    });
  };

  const save = () =>
    startTransition(async () => {
      try {
        await saveTextTemplate(d);
        toast.success("Template saved.");
        onClose();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Couldn't save the template.");
      }
    });
  const remove = () =>
    startTransition(async () => {
      if (!d.id || !confirm(`Delete “${d.name}”?`)) return;
      await deleteTextTemplate(d.id);
      toast.success("Template deleted.");
      onClose();
    });

  return (
    <Drawer
      open
      onClose={onClose}
      title={d.id ? "Edit template" : "New template"}
      width="lg"
      footer={
        <div className="flex items-center justify-between gap-2">
          {d.id ? (
            <Button variant="ghost" icon={<Trash2 className="size-4" />} onClick={remove} disabled={pending} className="text-rose-600">
              Delete
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose} disabled={pending}>
              Cancel
            </Button>
            <Button variant="primary" onClick={save} loading={pending}>
              Save template
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-5 px-6 py-5">
        <Field label="Name" hint="Callers pick templates by name.">
          <Input value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} placeholder="e.g. Reminder, Thank you, Directions" maxLength={80} />
        </Field>
        <Field label="Use it for" hint="An event's own templates are listed first when calling for that event.">
          <Select value={d.eventId ?? ""} onChange={(e) => setD({ ...d, eventId: e.target.value ? Number(e.target.value) : null })}>
            <option value="">Any event</option>
            {events.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name} · {fmt(e.start_at, e.time_zone, "MMM d")}
              </option>
            ))}
          </Select>
        </Field>
        <div>
          <Field label="Message">
            <Textarea ref={box} value={d.body} onChange={(e) => setD({ ...d, body: e.target.value })} className="min-h-36" maxLength={1600} />
          </Field>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {TEXT_FIELDS.map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => insert(f.key)}
                className="rounded-full bg-surface-2 px-2.5 py-1 text-xs font-medium text-ink-2 ring-1 ring-border transition-colors hover:text-ink"
              >
                + {f.label}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-ink-3">
            {preview.length} characters{preview.length > 160 && `, about ${Math.ceil(preview.length / 153)} texts long`}.
          </p>
        </div>

        <div>
          <div className="mb-2 text-[13px] font-medium text-ink-2">
            Preview{previewEvent ? ` for ${previewEvent.name}` : ""}, sent to Maria
          </div>
          <div className="rounded-2xl bg-surface-2 p-4">
            <div className="ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-sky-500 px-3.5 py-2 text-[14px] whitespace-pre-line text-white">
              {preview || " "}
            </div>
          </div>
          {missing.length > 0 && (
            <p className="mt-2 text-xs text-amber-700">
              Nothing to fill in for {missing.map((k) => `{${k}}`).join(", ")}
              {missing.includes("signup_link") ? ". The event needs Visibility set to Shareable to have a sign-up page" : ""}. It will be left blank.
            </p>
          )}
        </div>
      </div>
    </Drawer>
  );
}
