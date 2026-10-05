"use client";

import { useEffect, useState } from "react";
import * as actions from "@/app/actions/qrati";
import type { Content } from "@/lib/types";

// content.mine isn't event-scoped in the /v1 API (no eventId param) — this
// page lives under /events/:id/mine purely as nav convenience, same as
// qrati-connect-ts's "My Uploads" screen.
export default function MyUploadsPage() {
  const [items, setItems] = useState<Content[]>([]);
  const [after, setAfter] = useState<string | undefined>(undefined);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load(cursor?: string) {
    setLoading(true);
    setError(null);
    try {
      const res = await actions.myUploads({ limit: 24, after: cursor });
      const data: Content[] = res.data ?? [];
      setItems((prev) => (cursor ? [...prev, ...data] : data));
      setAfter(res.meta?.nextCursor);
      setHasMore(Boolean(res.meta?.hasMore));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void Promise.resolve().then(() => load());
  }, []);

  async function onDelete(contentId: string) {
    try {
      await actions.deleteContent(contentId);
      setItems((prev) => prev.filter((it) => it._id !== contentId));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div>
      {error && <p className="text-destructive text-sm">{error}</p>}
      <div className="grid gap-2 sm:grid-cols-2">
        {items.map((item) => (
          <div key={item._id} className="card flex items-center gap-3 p-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={item.thumbnailUrl ?? item.url} alt={item.caption ?? ""} className="bg-muted h-16 w-16 rounded-md object-cover" />
            <div className="flex-1 text-xs">
              <p className="line-clamp-2">{item.caption ?? item._id}</p>
              {item.status && <span className="badge mt-1">{String(item.status)}</span>}
            </div>
            <button onClick={() => onDelete(item._id)} className="text-destructive hover:bg-muted rounded-md px-2 py-1 text-xs">
              Delete
            </button>
          </div>
        ))}
      </div>
      {!loading && items.length === 0 && (
        <p className="text-muted-foreground mt-4 text-sm">You haven&apos;t uploaded anything here yet.</p>
      )}
      {hasMore && (
        <button onClick={() => load(after)} disabled={loading} className="btn-outline mt-4 w-full">
          {loading ? "Loading..." : "Load more"}
        </button>
      )}
    </div>
  );
}
