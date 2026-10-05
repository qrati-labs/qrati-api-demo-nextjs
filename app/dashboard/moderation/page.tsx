"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { actions } from "@/lib/actions";
import type { ModerationItem } from "@/lib/types";

const errorMessage = (err: unknown) => (err instanceof Error ? err.message : String(err));

/**
 * Moderation API demo (GET /v1/moderation/queue, PATCH /v1/content/{id}/moderation).
 * Moderation SETTINGS (what auto-approves, NSFW/AI policy) and bulk review are
 * not in the API: they are managed in the Qrati dashboard. See the scope map at
 * the top of app/actions/qrati.ts.
 *
 * Owner moderation queue: content still IN_REVIEW and fully processed, oldest
 * first. Uses the organization's secret key (server-side) — no end-user identity.
 */
export default function ModerationPage() {
  const [items, setItems] = useState<ModerationItem[]>([]);
  const [cursor, setCursor] = useState<string | undefined>();
  const [hasMore, setHasMore] = useState(false);
  const [metadata, setMetadata] = useState("");
  const [applied, setApplied] = useState("");
  const [reason, setReason] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async (filter: string, after?: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await actions.moderationQueue({ metadata: filter || undefined, after, limit: 10 });
      setItems((prev) => (after ? [...prev, ...(res.data ?? [])] : (res.data ?? [])));
      setHasMore(Boolean(res.meta?.hasMore));
      setCursor(res.meta?.nextCursor);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(() => load(applied));
  }, [applied, load]);

  async function decide(item: ModerationItem, status: "APPROVED" | "REJECTED") {
    setError(null);
    setNotice(null);
    try {
      await actions.moderateContent({ contentId: item._id, status, reason: reason[item._id] || undefined });
      setItems((prev) => prev.filter((i) => i._id !== item._id));
      setNotice(`${status === "APPROVED" ? "Approved" : "Rejected"} ${item._id}.`);
    } catch (err) {
      // 409 conflict = another decision landed first; content_not_ready = still processing. Both are safe to retry.
      const code = (err as { code?: string }).code;
      setError(code ? `${errorMessage(err)} (${code})` : errorMessage(err));
    }
  }

  function applyFilter(e: React.FormEvent) {
    e.preventDefault();
    setApplied(metadata.trim());
  }

  return (
    <div className="mx-auto max-w-4xl">
      <Link href="/dashboard" className="text-muted-foreground text-xs underline underline-offset-2">
        &larr; all events
      </Link>
      <h2 className="mt-2 mb-4 text-lg font-semibold">Moderation queue</h2>

      <form onSubmit={applyFilter} className="mb-4">
        <label htmlFor="metadata-filter" className="mb-1 block text-xs font-medium">
          Filter by upload metadata
        </label>
        <div className="flex gap-2">
          <input
            id="metadata-filter"
            className="input-field flex-1"
            placeholder='{"businessId":"b-42"}'
            value={metadata}
            onChange={(e) => setMetadata(e.target.value)}
          />
          <button className="btn-outline">Filter</button>
        </div>
        <p className="text-muted-foreground mt-1 text-xs">
          A JSON object of the key-values attached to uploads in their <code>metadata</code> field. Sent as the{" "}
          <code>metadata</code> query parameter; every key must match exactly. Leave empty to show everything.
        </p>
      </form>

      {error && <p className="text-destructive mb-2 text-sm">{error}</p>}
      {notice && <p className="text-success mb-2 text-sm">{notice}</p>}
      {loading && <p className="text-muted-foreground text-sm">Loading queue...</p>}
      {!loading && items.length === 0 && !error && (
        <p className="text-muted-foreground text-sm">Nothing waiting for review.</p>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {items.map((item) => (
          <div key={item._id} className="card">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={item.thumbnailUrl ?? item.url} alt={item.caption ?? ""} className="w-full rounded-md" />
            {item.caption && <p className="mt-2 text-sm">{item.caption}</p>}
            <p className="text-muted-foreground mt-1 text-xs">AI analysis: {item.moderationAnalysisState ?? "n/a"}</p>
            <input
              className="input-field mt-2 w-full"
              placeholder="Reason (optional)"
              value={reason[item._id] ?? ""}
              onChange={(e) => setReason((r) => ({ ...r, [item._id]: e.target.value }))}
            />
            <div className="mt-2 flex gap-2">
              <button className="btn-primary" onClick={() => decide(item, "APPROVED")}>
                Approve
              </button>
              <button className="btn-outline" onClick={() => decide(item, "REJECTED")}>
                Reject
              </button>
            </div>
          </div>
        ))}
      </div>

      {hasMore && (
        <button className="btn-outline mt-4" disabled={loading} onClick={() => load(applied, cursor)}>
          Load more
        </button>
      )}
    </div>
  );
}
