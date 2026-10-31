import { requireUser } from "@/lib/auth";
import { all } from "@/lib/db";
import { callableEvents, getCallInRows } from "@/lib/call-in";
import { listTags } from "@/lib/tags";
import { CallIn } from "./call-in";

/**
 * Call In: contacts down the side, one column per selected upcoming event.
 * `?e=5,6` picks the events; without it we default to the caller's assigned
 * events, or the next three coming up.
 */
export default async function CallInPage(props: PageProps<"/call">) {
  const user = await requireUser(["caller"]);
  const [events, tags, sp] = await Promise.all([callableEvents(), listTags(), props.searchParams]);
  const param = typeof sp.e === "string" ? sp.e : undefined;

  let selectedIds: number[];
  if (param !== undefined) {
    const valid = new Set(events.map((e) => e.id));
    selectedIds = param.split(",").map(Number).filter((id) => valid.has(id));
  } else {
    const assigned = new Set(
      (
        await all<{ event_id: number }>("SELECT event_id FROM event_staff WHERE user_id = ? AND role = 'caller'", [user.id])
      ).map((r) => r.event_id),
    );
    const mine = events.filter((e) => assigned.has(e.id)).map((e) => e.id);
    selectedIds = mine.length ? mine.slice(0, 4) : events.slice(0, 3).map((e) => e.id);
  }

  const rows = await getCallInRows(selectedIds);
  return <CallIn events={events} selectedIds={selectedIds} initialRows={rows} tags={tags} />;
}
