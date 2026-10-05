"use client";

import { use, useEffect, useState } from "react";
import { actions } from "@/lib/actions";
import { isContest } from "@/lib/engagement";
import type { Content } from "@/lib/types";

interface Parameter {
  _id?: string;
  id?: string;
  name?: string;
}

export default function CuratePage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = use(params);
  return <CurateView eventId={eventId} />;
}

// Split from CuratePage so it can be unit-tested directly, without a
// Suspense boundary around use(params) — the params-unwrapping and the
// actual curation logic are independent concerns.
export function CurateView({ eventId }: { eventId: string }) {
  const [contest, setContest] = useState(true);
  const [parameters, setParameters] = useState<Parameter[]>([]);
  const [queue, setQueue] = useState<Content[]>([]);
  const [index, setIndex] = useState(0);
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    void Promise.resolve().then(() => {
      setLoading(true);
      return actions
        .getEvent(eventId)
        .then(async (event) => {
          const isContestEvent = isContest(event?.event);
          setContest(isContestEvent);
          if (!isContestEvent) return;
          const items = await actions.curationQueue({ eventId, limit: 20 });
          setParameters((event?.parameters as Parameter[]) ?? []);
          setQueue(items ?? []);
          setIndex(0);
        })
        .catch((err) => setError(err instanceof Error ? err.message : String(err)))
        .finally(() => setLoading(false));
    });
  }, [eventId]);

  const current = queue[index];
  const paramList = parameters.length > 0 ? parameters : [{ _id: "overall", name: "Overall rating" }];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!current) return;
    setError(null);
    setMessage(null);
    try {
      await actions.curationDecide({
        eventId,
        contentId: current._id,
        parameterCount: paramList.length,
        // Flagging content as inappropriate is not supported by the API (unsupported_inappropriate_report):
        // a normal rating is always sent with an empty string.
        inappropriate: "",
        userRatings: paramList.map((p) => ({
          parameterId: p._id ?? p.id,
          rate: ratings[p._id ?? p.id ?? "overall"] ?? 3,
        })),
      });
      setMessage("Submitted.");
      setRatings({});
      setIndex((i) => i + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  if (loading) return <p className="text-muted-foreground text-sm">Loading queue...</p>;
  if (!contest)
    return <p className="text-muted-foreground text-sm">Rating applies to contest events only; this event is not a contest.</p>;
  if (error && !current) return <p className="text-destructive text-sm">{error}</p>;
  if (!current)
    return <p className="text-muted-foreground text-sm">Curation queue is empty — nothing waiting to be rated right now.</p>;

  return (
    <div className="card max-w-sm">
      <p className="text-muted-foreground mb-2 text-xs">
        {index + 1} of {queue.length} in queue
      </p>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={current.thumbnailUrl ?? current.url} alt={current.caption ?? ""} className="w-full rounded-md" />
      {current.caption && <p className="mt-2 text-sm">{current.caption}</p>}

      <form onSubmit={submit} className="mt-4 flex flex-col gap-3">
        {paramList.map((p) => {
          const key = p._id ?? p.id ?? "overall";
          return (
            <label key={key} className="flex flex-col gap-1 text-xs">
              {p.name ?? key} ({ratings[key] ?? 3}/5)
              <input
                type="range"
                min={1}
                max={5}
                value={ratings[key] ?? 3}
                onChange={(e) => setRatings((r) => ({ ...r, [key]: Number(e.target.value) }))}
                className="accent-primary"
              />
            </label>
          );
        })}
        <button className="btn-primary">Submit rating</button>
      </form>

      {message && <p className="text-success mt-2 text-xs">{message}</p>}
      {error && <p className="text-destructive mt-2 text-xs">{error}</p>}
    </div>
  );
}
