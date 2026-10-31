import { requireUser } from "@/lib/auth";
import { getLeaderboard, METRICS, PERIODS, type Metric, type Period } from "@/lib/leaderboard";
import { LeaderboardView } from "./leaderboard-view";

export default async function LeaderboardPage(props: PageProps<"/leaderboard">) {
  const me = await requireUser();
  const sp = await props.searchParams;
  const period = (PERIODS as readonly string[]).includes(String(sp.period)) ? (sp.period as Period) : "week";
  const metric = (METRICS as readonly string[]).includes(String(sp.metric)) ? (sp.metric as Metric) : "confirms";
  const data = await getLeaderboard(period, metric);
  return <LeaderboardView data={data} meId={me.id} />;
}
