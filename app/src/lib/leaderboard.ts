import "server-only";
import { startOfMonth, startOfWeek } from "date-fns";
import { formatInTimeZone, fromZonedTime, toZonedTime } from "date-fns-tz";
import { all } from "./db";
import { DEFAULT_TZ } from "./time";

export const PERIODS = ["day", "week", "month"] as const;
export type Period = (typeof PERIODS)[number];
export const METRICS = ["confirms", "calls"] as const;
export type Metric = (typeof METRICS)[number];

export type Leader = { user_id: number; name: string; title: string; division: number | null; count: number };
export type DivisionScore = { division: number; count: number; members: number; top: string | null };
export type Leaderboard = {
  period: Period;
  metric: Metric;
  rangeLabel: string;
  people: Leader[];
  divisions: DivisionScore[];
};

/** Start of today / this week (Monday) / this month, in the organization's time zone. */
function periodStart(period: Period, tz = DEFAULT_TZ): Date {
  const zonedNow = toZonedTime(new Date(), tz);
  const zonedStart =
    period === "day"
      ? new Date(zonedNow.getFullYear(), zonedNow.getMonth(), zonedNow.getDate())
      : period === "week"
        ? startOfWeek(zonedNow, { weekStartsOn: 1 })
        : startOfMonth(zonedNow);
  return fromZonedTime(zonedStart, tz);
}

function rangeLabel(period: Period, from: Date, tz = DEFAULT_TZ): string {
  if (period === "day") return formatInTimeZone(from, tz, "EEEE, MMM d");
  if (period === "week") return `Week of ${formatInTimeZone(from, tz, "MMM d")}`;
  return formatInTimeZone(from, tz, "MMMM yyyy");
}

/**
 * Confirms: distinct registrations a caller moved to Confirmed or Reconfirmed in the
 * period (flipping someone back and forth counts once). Calls: logged calls.
 */
export async function getLeaderboard(period: Period, metric: Metric): Promise<Leaderboard> {
  const from = periodStart(period);
  const since = from.toISOString();

  const scoreSql =
    metric === "confirms"
      ? `SELECT user_id, COUNT(DISTINCT registration_id) AS n FROM status_changes
          WHERE kind = 'rsvp' AND via <> 'upload' AND to_value IN ('confirmed','reconfirmed') AND created_at >= ?
          GROUP BY user_id`
      : `SELECT user_id, COUNT(*) AS n FROM call_logs WHERE created_at >= ? GROUP BY user_id`;

  const people = await all<Leader>(
    `SELECT u.id AS user_id, u.name, u.title, u.division, COALESCE(s.n, 0) AS count
       FROM users u LEFT JOIN (${scoreSql}) s ON s.user_id = u.id
      WHERE u.active = 1
      ORDER BY count DESC, lower(u.name)`,
    [since],
  );

  const byDivision = new Map<number, DivisionScore>();
  for (const p of people) {
    if (p.division == null) continue;
    const d = byDivision.get(p.division) ?? { division: p.division, count: 0, members: 0, top: null };
    d.count += p.count;
    d.members += 1;
    if (!d.top && p.count > 0) d.top = p.name; // people are already sorted, so the first scorer leads
    byDivision.set(p.division, d);
  }
  const divisions = [...byDivision.values()].sort((a, b) => b.count - a.count || a.division - b.division);

  return { period, metric, rangeLabel: rangeLabel(period, from), people, divisions };
}
