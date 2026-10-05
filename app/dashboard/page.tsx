"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { actions } from "@/lib/actions";
import type { QratiEvent, QratiFolder } from "@/lib/types";

// Read-only org/event browser. Creating events, event/org settings, ad
// management and analytics dashboards are NOT in the public API; they are done
// in the Qrati dashboard (see the scope map in app/actions/qrati.ts).
export default function OrgHomePage() {
  const [status, setStatus] = useState<string | null>(null);
  const [ready, setReady] = useState<string | null>(null);
  const [orgName, setOrgName] = useState<string | null>(null);
  const [folders, setFolders] = useState<QratiFolder[]>([]);
  const [events, setEvents] = useState<QratiEvent[]>([]);
  const [activeFolder, setActiveFolder] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    actions.getStatus().then((s) => setStatus(s.status)).catch(() => {});
    actions.getReadiness().then((r) => setReady(r.status)).catch(() => {});
    actions.getOrganization().then((o) => setOrgName(o?.name ?? o?._id ?? "org")).catch(() => {});
    actions.listFolders().then(setFolders).catch(() => {});
  }, []);

  useEffect(() => {
    void Promise.resolve().then(() => {
      setLoading(true);
      setError(null);
      return actions
        // Without a folder the API lists only top-level events; "All events" must ask for every folder's.
        .listEvents(activeFolder ? { folderId: activeFolder, limit: 30 } : { includeAllFolders: true, limit: 30 })
        .then((res) => setEvents(res.data ?? []))
        .catch((err) => setError(err.message))
        .finally(() => setLoading(false));
    });
  }, [activeFolder]);

  async function onSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await actions.searchEvents({ query, limit: 30 });
      setEvents(res.data ?? []);
      setActiveFolder(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">{orgName ?? "..."}</h2>
          <p className="text-muted-foreground text-xs">
            status: {status ?? "..."} · ready: {ready ?? "..."}
          </p>
        </div>
        <Link href="/dashboard/moderation" className="btn-outline">
          Moderation
        </Link>
      </div>

      <form onSubmit={onSearch} className="mb-4 flex gap-2">
        <input
          className="input-field flex-1"
          placeholder="Search events (or content) across the org..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button className="btn-outline">Search</button>
      </form>

      {folders.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          <button
            onClick={() => setActiveFolder(null)}
            className={`rounded-full border px-3 py-1 text-xs transition ${
              activeFolder === null
                ? "bg-primary border-primary text-primary-foreground"
                : "border-border hover:bg-muted"
            }`}
          >
            All events
          </button>
          {folders.map((f) => (
            <button
              key={f._id}
              onClick={() => setActiveFolder(f._id)}
              className={`rounded-full border px-3 py-1 text-xs transition ${
                activeFolder === f._id
                  ? "bg-primary border-primary text-primary-foreground"
                  : "border-border hover:bg-muted"
              }`}
            >
              {f.name ?? f._id}
            </button>
          ))}
        </div>
      )}

      {error && <p className="text-destructive text-sm">{error}</p>}
      {loading && <p className="text-muted-foreground text-sm">Loading events...</p>}

      <div className="grid gap-3 sm:grid-cols-2">
        {events.map((ev) => (
          <Link
            key={ev._id}
            href={`/dashboard/events/${ev._id}`}
            className="card hover:border-primary/50 transition"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium">{ev.name ?? ev._id}</h3>
              {ev.status && <span className="badge">{String(ev.status)}</span>}
            </div>
            {ev.description && (
              <p className="text-muted-foreground mt-1 line-clamp-2 text-xs">{String(ev.description)}</p>
            )}
          </Link>
        ))}
        {!loading && events.length === 0 && <p className="text-muted-foreground text-sm">No events found.</p>}
      </div>
    </div>
  );
}
