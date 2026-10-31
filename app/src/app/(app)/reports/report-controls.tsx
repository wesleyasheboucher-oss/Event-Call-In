"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Download } from "lucide-react";
import { Button, Select } from "@/components/ui";
import { downloadCsv, slug } from "@/lib/csv";
import { formatPhone } from "@/lib/phone";
import { RSVP, ATTENDANCE } from "@/lib/status";
import { fmt } from "@/lib/time";
import { fetchAttendanceExport, fetchCallListExport, fetchContactsExport } from "./actions";

export function EventPicker({ events, value }: { events: { id: number; label: string }[]; value: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Select
      value={value}
      onChange={(e) => start(() => router.push(`/reports?event=${e.target.value}`))}
      className={`sm:w-96 ${pending ? "opacity-60" : ""}`}
    >
      {events.map((e) => (
        <option key={e.id} value={e.id}>
          {e.label}
        </option>
      ))}
    </Select>
  );
}

export function ExportButtons({ eventId, eventName, timeZone }: { eventId: number; eventName: string; timeZone: string }) {
  const [busy, setBusy] = useState<string | null>(null);

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try {
      await fn();
    } catch {
      toast.error("Export failed");
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <Button
        size="sm"
        icon={<Download className="size-4" />}
        loading={busy === "call"}
        onClick={() =>
          run("call", async () =>
            downloadCsv(`${slug(eventName)}-call-list`, await fetchCallListExport(eventId), [
              { header: "First name", value: (r) => r.first_name },
              { header: "Last name", value: (r) => r.last_name },
              { header: "Phone", value: (r) => formatPhone(r.phone) },
              { header: "Email", value: (r) => r.email },
              { header: "RSVP", value: (r) => RSVP[r.rsvp].label },
              { header: "Guests", value: (r) => r.guest_names },
              { header: "Last called", value: (r) => (r.last_called_at ? fmt(r.last_called_at, timeZone, "yyyy-MM-dd h:mm a") : "") },
              { header: "Called by", value: (r) => r.called_by_name },
              { header: "Latest note", value: (r) => r.last_note },
            ]),
          )
        }
      >
        Call list
      </Button>
      <Button
        size="sm"
        icon={<Download className="size-4" />}
        loading={busy === "att"}
        onClick={() =>
          run("att", async () =>
            downloadCsv(`${slug(eventName)}-attendance`, await fetchAttendanceExport(eventId), [
              { header: "First name", value: (r) => r.first_name },
              { header: "Last name", value: (r) => r.last_name },
              { header: "Phone", value: (r) => formatPhone(r.phone) },
              { header: "Email", value: (r) => r.email },
              { header: "RSVP", value: (r) => RSVP[r.rsvp as keyof typeof RSVP]?.label ?? r.rsvp },
              { header: "Attendance", value: (r) => ATTENDANCE[r.attendance as keyof typeof ATTENDANCE]?.label ?? r.attendance },
              { header: "Walk-in", value: (r) => (r.walk_in ? "Yes" : "") },
              { header: "Guest of", value: (r) => r.guest_of_name },
              { header: "Checked in", value: (r) => (r.checked_in_at ? fmt(r.checked_in_at, timeZone, "yyyy-MM-dd h:mm a") : "") },
            ]),
          )
        }
      >
        Attendance
      </Button>
      <Button
        size="sm"
        icon={<Download className="size-4" />}
        loading={busy === "contacts"}
        onClick={() =>
          run("contacts", async () =>
            downloadCsv("contacts", await fetchContactsExport(), [
              { header: "First name", value: (r) => r.first_name },
              { header: "Last name", value: (r) => r.last_name },
              { header: "Phone", value: (r) => formatPhone(r.phone) },
              { header: "Email", value: (r) => r.email },
              { header: "Street", value: (r) => r.street },
              { header: "City", value: (r) => r.city },
              { header: "State", value: (r) => r.state },
              { header: "ZIP", value: (r) => r.zip },
              { header: "Source", value: (r) => r.source },
              { header: "Events", value: (r) => r.events_count },
              { header: "Attended", value: (r) => r.attended_count },
              { header: "No-shows", value: (r) => r.no_show_count },
              { header: "Notes", value: (r) => r.notes },
            ]),
          )
        }
      >
        All contacts
      </Button>
    </>
  );
}
