import { Suspense } from "react";
import { requireUser } from "@/lib/auth";
import { all } from "@/lib/db";
import { listUsers } from "@/lib/queries";
import { Skeleton } from "@/components/ui";
import { TeamScreen } from "./team-screen";

async function Team() {
  const me = await requireUser(["admin"]);
  const [users, activity] = await Promise.all([
    listUsers(),
    all<{ user_id: number; calls: number; checkins: number }>(
    `SELECT u.id AS user_id,
            (SELECT COUNT(*) FROM call_logs l WHERE l.user_id = u.id) AS calls,
            (SELECT COUNT(*) FROM status_changes s WHERE s.user_id = u.id AND s.kind = 'attendance' AND s.to_value = 'attended') AS checkins
       FROM users u`,
    ),
  ]);
  return <TeamScreen users={users} meId={me.id} activity={activity} />;
}

export default function UsersPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-6xl px-4 py-8 sm:px-8 lg:py-12">
          <Skeleton className="mb-10 h-8 w-40" />
          <Skeleton className="h-80 rounded-2xl" />
        </div>
      }
    >
      <Team />
    </Suspense>
  );
}
