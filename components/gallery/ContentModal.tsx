"use client";

import { useState } from "react";
import Link from "next/link";
import * as actions from "@/app/actions/qrati";
import type { Content } from "@/lib/types";

export function ContentModal({
  content,
  eventId,
  reactionEmojis = [],
  curation = false,
  onClose,
}: {
  content: Content;
  eventId: string;
  /** The event's own configured reactions (event.reactionEmojis): the API rejects any other value. */
  reactionEmojis?: string[];
  /** Contest events only: curation (rating) links are shown. */
  curation?: boolean;
  onClose: () => void;
}) {
  const [item, setItem] = useState(content);
  const [eligibility, setEligibility] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reactionCounts = (item.reactionCounts ?? {}) as Record<string, number>;

  async function react(reaction: string) {
    if (!item._id) return setError("This content item has no id — can't react to it.");
    setError(null);
    try {
      const updated = await actions.reactToContent({ eventId, contentId: item._id, reaction });
      if (updated) setItem(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function checkEligibility() {
    if (!item._id) return setError("This content item has no id — can't check eligibility.");
    setError(null);
    try {
      const res = await actions.curationEligibility({ contentId: item._id });
      setEligibility(res?.ratingStatus ?? JSON.stringify(res));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="card bg-background max-h-[85vh] w-full max-w-lg overflow-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {item.type === "VIDEO" ? (
          <video src={item.url} controls className="w-full rounded-md" />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.url ?? item.thumbnailUrl} alt={item.caption ?? ""} className="w-full rounded-md" />
        )}
        {item.caption && <p className="mt-2 text-sm">{item.caption}</p>}

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {reactionEmojis.map((r) => (
            <button key={r} onClick={() => react(r)} className="btn-outline px-2 py-1">
              {r}
              <span className="text-muted-foreground ml-1 text-xs">{reactionCounts[r] ?? 0}</span>
            </button>
          ))}
          {reactionEmojis.length === 0 && (
            <p className="text-muted-foreground text-xs">Reactions are not enabled for this event.</p>
          )}
        </div>

        {curation && (
          <div className="text-muted-foreground mt-3 flex items-center gap-3 text-xs">
            <button onClick={checkEligibility} className="hover:text-primary underline underline-offset-2">
              Check curation eligibility
            </button>
            {eligibility && <span>{eligibility}</span>}
            <Link href={`/dashboard/events/${eventId}/curate`} className="hover:text-primary underline underline-offset-2">
              Go to curation queue
            </Link>
          </div>
        )}

        {error && <p className="text-destructive mt-2 text-xs">{error}</p>}
        <button onClick={onClose} className="btn-outline mt-4 px-3 py-1.5">
          Close
        </button>
      </div>
    </div>
  );
}
