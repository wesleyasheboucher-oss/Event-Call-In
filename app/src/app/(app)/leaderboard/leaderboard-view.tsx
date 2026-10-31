"use client";

import { useTransition, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { motion } from "motion/react";
import { Crown, PhoneCall, Trophy, Users } from "lucide-react";
import type { Leaderboard, Metric, Period } from "@/lib/leaderboard";
import { Page, PageHeader } from "@/components/page";
import { AnimatedNumber } from "@/components/animated-number";
import { Avatar, cx } from "@/components/ui";

const PERIOD_LABEL: Record<Period, string> = { day: "Today", week: "This week", month: "This month" };
const METRIC_LABEL: Record<Metric, { one: string; many: string }> = {
  confirms: { one: "confirm", many: "confirms" },
  calls: { one: "call", many: "calls" },
};

/** Podium steps by rank (1–5): height and finish. 1st gold, 2nd silver, 3rd bronze. */
const STEP: Record<number, { h: string; step: string; ring: string; text: string }> = {
  1: { h: "h-36 sm:h-44", step: "from-amber-300 to-amber-400", ring: "ring-amber-300", text: "text-amber-900" },
  2: { h: "h-28 sm:h-36", step: "from-stone-200 to-stone-300", ring: "ring-stone-300", text: "text-stone-700" },
  3: { h: "h-20 sm:h-28", step: "from-orange-200 to-orange-300", ring: "ring-orange-300", text: "text-orange-900" },
  4: { h: "h-14 sm:h-20", step: "from-stone-100 to-stone-200", ring: "ring-border", text: "text-ink-2" },
  5: { h: "h-10 sm:h-14", step: "from-stone-50 to-stone-100", ring: "ring-border", text: "text-ink-2" },
};
// Left-to-right order on the podium: 4th, 2nd, 1st, 3rd, 5th.
const PODIUM_ORDER = [4, 2, 1, 3, 5];

type PodiumEntry = { key: string | number; rank: number; title: ReactNode; sub?: string; count: number; badge: ReactNode; isMe?: boolean };

function Toggle<T extends string>({
  value,
  options,
  onChange,
  id,
  size = "md",
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  id: string;
  size?: "sm" | "md";
}) {
  return (
    <div className="inline-flex rounded-xl bg-surface-2 p-1 ring-1 ring-border ring-inset">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            onClick={() => !on && onChange(o.value)}
            aria-pressed={on}
            className={cx(
              "relative rounded-lg font-medium transition-colors",
              size === "md" ? "h-10 px-4 text-sm sm:px-5" : "h-8 px-3 text-[13px]",
              on ? "text-ink" : "text-ink-2 hover:text-ink",
            )}
          >
            {on && (
              <motion.span
                layoutId={`toggle-${id}`}
                className="absolute inset-0 rounded-lg bg-surface shadow-sm ring-1 ring-border"
                transition={{ type: "spring", stiffness: 500, damping: 38 }}
              />
            )}
            <span className="relative">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function Podium({ entries, unit }: { entries: PodiumEntry[]; unit: Metric }) {
  return (
    <div className="flex items-end justify-center gap-1.5 sm:gap-3">
      {PODIUM_ORDER.map((rank, i) => {
        const e = entries.find((x) => x.rank === rank);
        const s = STEP[rank];
        return (
          <div key={rank} className="flex min-w-0 flex-1 flex-col items-center sm:max-w-40">
            {e ? (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.35 + (5 - rank) * 0.08, type: "spring", stiffness: 300, damping: 26 }}
                className="mb-2 flex w-full flex-col items-center text-center"
              >
                <div className="relative">
                  {rank === 1 && (
                    <motion.span
                      initial={{ y: 6, opacity: 0, rotate: -12 }}
                      animate={{ y: 0, opacity: 1, rotate: 0 }}
                      transition={{ delay: 0.9, type: "spring", stiffness: 400, damping: 14 }}
                      className="absolute -top-5 left-1/2 -translate-x-1/2 text-amber-500"
                    >
                      <Crown className="size-5 fill-amber-300" />
                    </motion.span>
                  )}
                  <div className={cx("rounded-full ring-2 ring-offset-2", s.ring, e.isMe && "ring-accent")}>{e.badge}</div>
                </div>
                <div className="mt-2 w-full truncate px-0.5 text-[12px] font-semibold sm:text-sm">{e.title}</div>
                {e.sub && <div className="hidden w-full truncate text-xs text-ink-3 sm:block">{e.sub}</div>}
                <div className="mt-0.5 text-[13px] font-semibold tabular-nums sm:text-base">
                  <AnimatedNumber value={e.count} />
                  <span className="ml-1 hidden text-xs font-normal text-ink-3 sm:inline">
                    {e.count === 1 ? METRIC_LABEL[unit].one : METRIC_LABEL[unit].many}
                  </span>
                </div>
              </motion.div>
            ) : (
              <div className="mb-2 flex h-[88px] w-full flex-col items-center justify-end pb-1 text-xs text-ink-3 sm:h-[104px]">—</div>
            )}
            <motion.div
              initial={{ scaleY: 0 }}
              animate={{ scaleY: 1 }}
              transition={{ delay: 0.05 * i, type: "spring", stiffness: 160, damping: 20 }}
              style={{ originY: 1 }}
              className={cx(
                "flex w-full items-start justify-center rounded-t-xl bg-gradient-to-b pt-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]",
                s.h,
                s.step,
                !e && "opacity-40",
              )}
            >
              <span className={cx("text-lg font-bold tabular-nums sm:text-2xl", s.text)}>{rank}</span>
            </motion.div>
          </div>
        );
      })}
    </div>
  );
}

function Section({ icon, title, sub, children }: { icon: ReactNode; title: string; sub?: string; children: ReactNode }) {
  return (
    <section className="rounded-3xl bg-surface p-5 ring-1 ring-border sm:p-8">
      <div className="mb-8 flex items-center gap-3">
        <span className="flex size-9 items-center justify-center rounded-xl bg-accent-soft text-accent">{icon}</span>
        <div>
          <h2 className="text-[17px] font-semibold tracking-tight">{title}</h2>
          {sub && <p className="text-sm text-ink-2">{sub}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

export function LeaderboardView({ data, meId }: { data: Leaderboard; meId: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, start] = useTransition();
  const { period, metric } = data;
  const go = (p: Period, m: Metric) => start(() => router.replace(`${pathname}?period=${p}&metric=${m}`, { scroll: false }));

  const scorers = data.people.filter((p) => p.count > 0);
  const top10 = scorers.slice(0, 10);
  const max = top10[0]?.count ?? 0;
  const unit = METRIC_LABEL[metric];
  const myRank = scorers.findIndex((p) => p.user_id === meId) + 1;

  const peoplePodium: PodiumEntry[] = scorers.slice(0, 5).map((p, i) => ({
    key: p.user_id,
    rank: i + 1,
    title: p.name.split(" ")[0] + (p.name.includes(" ") ? ` ${p.name.split(" ").slice(-1)[0][0]}.` : ""),
    sub: p.title,
    count: p.count,
    badge: <Avatar name={p.name} size="lg" />,
    isMe: p.user_id === meId,
  }));
  const divisionScorers = data.divisions.filter((d) => d.count > 0);
  const divisionPodium: PodiumEntry[] = divisionScorers.slice(0, 5).map((d, i) => ({
    key: d.division,
    rank: i + 1,
    title: (
      <>
        <span className="sm:hidden">Div {d.division}</span>
        <span className="hidden sm:inline">Division {d.division}</span>
      </>
    ),
    sub: `${d.members} ${d.members === 1 ? "member" : "members"}`,
    count: d.count,
    badge: (
      <span className="flex size-12 items-center justify-center rounded-full bg-ink text-base font-bold text-white tabular-nums">
        {d.division}
      </span>
    ),
  }));

  return (
    <Page>
      <PageHeader
        title="Leaderboard"
        description={`${data.rangeLabel}${myRank ? ` · You're #${myRank}` : ""}`}
        actions={
          <Toggle
            id="metric"
            size="sm"
            value={metric}
            onChange={(m) => go(period, m)}
            options={[
              { value: "confirms", label: "Confirms" },
              { value: "calls", label: "Calls" },
            ]}
          />
        }
      />

      <div className="mb-8 flex justify-center">
        <Toggle
          id="period"
          value={period}
          onChange={(p) => go(p, metric)}
          options={(["day", "week", "month"] as Period[]).map((p) => ({ value: p, label: PERIOD_LABEL[p] }))}
        />
      </div>

      <motion.div key={`${period}-${metric}`} animate={{ opacity: pending ? 0.5 : 1 }} className="space-y-6">
        <Section icon={<Trophy className="size-4" />} title={metric === "confirms" ? "Top confirmers" : "Top callers"} sub={`Most ${unit.many}, ${PERIOD_LABEL[period].toLowerCase()}`}>
          {scorers.length === 0 ? (
            <p className="py-10 text-center text-sm text-ink-2">
              No {unit.many} yet {period === "day" ? "today" : `this ${period}`}. First one takes the top spot.
            </p>
          ) : (
            <>
              <Podium entries={peoplePodium} unit={metric} />

              <h3 className="mt-10 mb-3 text-xs font-semibold tracking-wide text-ink-3 uppercase">Top 10</h3>
              <ol className="divide-y divide-border">
                {top10.map((p, i) => (
                  <motion.li
                    key={p.user_id}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.5 + i * 0.04 }}
                    className={cx(
                      "flex items-center gap-3 rounded-xl px-2 py-3 sm:gap-4",
                      p.user_id === meId && "bg-accent-soft/60",
                    )}
                  >
                    <span
                      className={cx(
                        "w-6 shrink-0 text-center text-sm font-bold tabular-nums",
                        i === 0 ? "text-amber-500" : i === 1 ? "text-stone-400" : i === 2 ? "text-orange-400" : "text-ink-3",
                      )}
                    >
                      {i + 1}
                    </span>
                    <Avatar name={p.name} size="md" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-medium">{p.name}</span>
                        {p.user_id === meId && <span className="text-xs text-accent">you</span>}
                      </div>
                      <div className="truncate text-xs text-ink-3">
                        {p.title}
                        {p.division != null && ` · Div ${p.division}`}
                      </div>
                    </div>
                    <div className="hidden h-2 w-32 overflow-hidden rounded-full bg-stone-100 sm:block lg:w-48">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${max ? (p.count / max) * 100 : 0}%` }}
                        transition={{ delay: 0.6 + i * 0.04, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                        className={cx("h-full rounded-full", i === 0 ? "bg-amber-400" : "bg-accent")}
                      />
                    </div>
                    <span className="w-12 shrink-0 text-right font-semibold tabular-nums">{p.count}</span>
                  </motion.li>
                ))}
              </ol>
            </>
          )}
        </Section>

        <Section icon={<Users className="size-4" />} title="By division" sub={`Team ${unit.many} added up per division`}>
          {divisionScorers.length === 0 ? (
            <p className="py-10 text-center text-sm text-ink-2">No division has any {unit.many} yet for this period.</p>
          ) : (
            <>
              <Podium entries={divisionPodium} unit={metric} />
              <ol className="mt-10 grid gap-2 sm:grid-cols-2">
                {data.divisions.map((d, i) => (
                  <li key={d.division} className="flex items-center gap-3 rounded-2xl px-4 py-3 ring-1 ring-border">
                    <span className="w-5 text-center text-sm font-bold text-ink-3 tabular-nums">{d.count > 0 ? i + 1 : "–"}</span>
                    <span className="flex size-8 items-center justify-center rounded-full bg-ink text-xs font-bold text-white">{d.division}</span>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium">Division {d.division}</div>
                      <div className="truncate text-xs text-ink-3">
                        {d.members} {d.members === 1 ? "member" : "members"}
                        {d.top && ` · led by ${d.top}`}
                      </div>
                    </div>
                    <span className="font-semibold tabular-nums">{d.count}</span>
                  </li>
                ))}
              </ol>
            </>
          )}
        </Section>

        <p className="flex items-center justify-center gap-2 pb-4 text-xs text-ink-3">
          <PhoneCall className="size-3.5" />
          {metric === "confirms"
            ? "A confirm is moving someone to Confirmed or Reconfirmed; each person counts once per event."
            : "Calls are counted each time a status or note is logged (repeat touches within 15 minutes count once)."}
        </p>
      </motion.div>
    </Page>
  );
}
