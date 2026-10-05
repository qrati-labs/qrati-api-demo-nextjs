import * as actions from "@/app/actions/qrati";

// GET /v1/events/{id}/leaderboard returns, per board, { topRankers: [...], userRank: [...] }.
// Point rows carry totalPoint, score rows carry maxScore; userRank is the caller's own row.
interface Board {
  topRankers?: Array<Record<string, unknown>>;
  userRank?: Array<Record<string, unknown>>;
}

function rows(list: Array<Record<string, unknown>> | undefined, valueKey: string) {
  return (list ?? []).map((row, i) => ({
    label: String(row.name ?? row._id ?? `#${i + 1}`),
    rank: typeof row.rank === "number" ? row.rank : i + 1,
    value: String(row[valueKey] ?? ""),
  }));
}

function BoardCard({ title, board, valueKey }: { title: string; board?: Board | null; valueKey: string }) {
  const top = rows(board?.topRankers, valueKey);
  const mine = rows(board?.userRank, valueKey)[0];

  return (
    <div className="card">
      <h3 className="mb-2 text-sm font-medium">{title}</h3>
      <ol className="space-y-1 text-sm">
        {top.map((e) => (
          <li key={`${e.rank}-${e.label}`} className="flex justify-between">
            <span>
              {e.rank}. {e.label}
            </span>
            <span className="text-muted-foreground">{e.value}</span>
          </li>
        ))}
        {top.length === 0 && <li className="text-muted-foreground">No data.</li>}
      </ol>
      {mine && (
        <p className="text-muted-foreground mt-3 text-xs">
          Your rank: {mine.rank} ({mine.value})
        </p>
      )}
    </div>
  );
}

export default async function LeaderboardPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const [leaderboard, points] = await Promise.all([
    actions.getEventLeaderboard(eventId),
    actions.getEventPoints(eventId).catch(() => null),
  ]);

  return (
    <div>
      {points && (
        <p className="text-muted-foreground mb-4 text-xs">
          Your points: {points.upload ?? 0} from uploads &bull; {points.curate ?? 0} from curation
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <BoardCard title="Top points" board={leaderboard?.leaderboardByPoint} valueKey="totalPoint" />
        <BoardCard title="Top rated / reactions" board={leaderboard?.leaderboardByScore} valueKey="maxScore" />
      </div>
    </div>
  );
}
