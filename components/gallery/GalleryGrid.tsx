"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { actions } from "@/lib/actions";
import type { Content } from "@/lib/types";
import { ContentModal } from "./ContentModal";

// Frames on GET /v1/events/{id}/stream. A public item that is rejected or soft-deleted is announced as
// "content.removed" (minimal, no media URL); approvals, reactions and curation use the CONTENT_* names.
type StreamPayload = {
  type: "CONTENT_APPROVED" | "CONTENT_CURATED" | "CONTENT_REACTED" | "content.removed";
  content: { id: string };
};

export function GalleryGrid({
  eventId,
  reactionEmojis,
  curation = false,
}: {
  eventId: string;
  reactionEmojis?: string[];
  curation?: boolean;
}) {
  const [items, setItems] = useState<Content[]>([]);
  const [after, setAfter] = useState<string | undefined>(undefined);
  const [hasMore, setHasMore] = useState(false);
  const [count, setCount] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  // The query the visible results belong to ("" while browsing the event gallery).
  const [searchTerm, setSearchTerm] = useState("");
  const searchTermRef = useRef("");
  const [selected, setSelected] = useState<Content | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  const seen = useRef(new Set<string>());

  const loadFirstPage = useCallback(async () => {
    setLoading(true);
    setError(null);
    seen.current = new Set();
    searchTermRef.current = "";
    setSearchTerm("");
    try {
      const res = await actions.listContent({ eventId, limit: 24 });
      const data: Content[] = res.data ?? [];
      data.forEach((d) => seen.current.add(d._id));
      setItems(data);
      setAfter(res.meta?.nextCursor);
      setHasMore(Boolean(res.meta?.hasMore));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    void Promise.resolve().then(() => loadFirstPage());
    void actions.countContent({ eventId, filter: "status:APPROVED" }).then(setCount).catch(() => {});
  }, [eventId, loadFirstPage]);

  useEffect(() => {
    const source = new EventSource(`/api/events/${eventId}/stream`);
    source.onopen = () => setLive(true);
    source.onerror = () => setLive(false);
    source.onmessage = async (e) => {
      try {
        const payload = JSON.parse(e.data) as StreamPayload;
        // Live inserts belong to the event gallery, not to org-wide search results.
        if (payload.type === "CONTENT_APPROVED" && !searchTermRef.current && !seen.current.has(payload.content.id)) {
          const [fresh] = await actions.getContentByIds([payload.content.id], eventId);
          if (fresh) {
            seen.current.add(fresh._id);
            setItems((prev) => [fresh, ...prev]);
          }
        }
        if (payload.type === "content.removed") {
          seen.current.delete(payload.content.id);
          setItems((prev) => prev.filter((it) => it._id !== payload.content.id));
        }
      } catch {
        // ignore malformed/heartbeat messages
      }
    };
    return () => source.close();
  }, [eventId]);

  async function loadMore() {
    setLoading(true);
    try {
      const res = searchTerm
        ? await actions.searchContent({ query: searchTerm, limit: 24, after })
        : await actions.listContent({ eventId, limit: 24, after });
      const data: Content[] = res.data ?? [];
      data.forEach((d) => seen.current.add(d._id));
      setItems((prev) => [...prev, ...data]);
      setAfter(res.meta?.nextCursor);
      setHasMore(Boolean(res.meta?.hasMore));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  async function onSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return loadFirstPage();
    setLoading(true);
    setError(null);
    try {
      // content.search is org-wide (no eventId filter server-side) — a real
      // gap in the /v1 content API, not something to paper over here.
      const term = query.trim();
      const res = await actions.searchContent({ query: term, limit: 24 });
      const data: Content[] = res.data ?? [];
      seen.current = new Set(data.map((d) => d._id));
      searchTermRef.current = term;
      setSearchTerm(term);
      setItems(data);
      setAfter(res.meta?.nextCursor);
      setHasMore(Boolean(res.meta?.hasMore));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-2">
        <form onSubmit={onSearch} className="flex flex-1 gap-2">
          <input
            className="input-field flex-1"
            placeholder="Search content (org-wide)..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button className="btn-outline">Search</button>
        </form>
        <span className="text-muted-foreground flex items-center gap-1.5 text-xs whitespace-nowrap">
          {count ?? "..."} items
          {live && (
            <span className="text-success flex items-center gap-1">
              <span className="bg-success inline-block h-1.5 w-1.5 rounded-full" />
              live
            </span>
          )}
        </span>
      </div>

      {error && <p className="text-destructive text-sm">{error}</p>}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {items.map((item) => (
          <button
            key={item._id}
            onClick={() => setSelected(item)}
            className="bg-muted hover:ring-primary aspect-square overflow-hidden rounded-md transition hover:ring-2"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={item.thumbnailUrl ?? item.url}
              alt={item.caption ?? ""}
              className="h-full w-full object-cover"
            />
          </button>
        ))}
      </div>

      {!loading && items.length === 0 && (
        <p className="text-muted-foreground mt-4 text-sm">
          {searchTerm ? `No results for "${searchTerm}".` : "No content yet."}
        </p>
      )}

      {hasMore && (
        <button onClick={loadMore} disabled={loading} className="btn-outline mt-4 w-full">
          {loading ? "Loading..." : "Load more"}
        </button>
      )}

      {selected && <ContentModal content={selected} eventId={eventId} reactionEmojis={reactionEmojis} curation={curation} onClose={() => setSelected(null)} />}
    </div>
  );
}
