import Link from "next/link";
import * as actions from "@/app/actions/qrati";
import { engagementStyle, isContest } from "@/lib/engagement";

export default async function EventLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;
  const [event, stats, uploadCount] = await Promise.all([
    actions.getEvent(eventId),
    actions.getEventStats(eventId).catch(() => null),
    actions.getEventUploadCount(eventId).catch(() => null),
  ]);

  // The OpenAPI spec says eventViews is a number, but the live API returns { views }: accept both.
  const views = typeof stats?.eventViews === "number" ? stats.eventViews : stats?.eventViews?.views;

  const contest = isContest(event?.event);
  const tabs = [
    { href: `/dashboard/events/${eventId}`, label: "Gallery" },
    { href: `/dashboard/events/${eventId}/upload`, label: "Upload" },
    { href: `/dashboard/events/${eventId}/mine`, label: "My uploads" },
    { href: `/dashboard/events/${eventId}/leaderboard`, label: "Leaderboard" },
    // Rating (curation) only exists on CONTEST events.
    ...(contest ? [{ href: `/dashboard/events/${eventId}/curate`, label: "Curate" }] : []),
  ];

  return (
    <div className="mx-auto max-w-4xl">
      <Link href="/dashboard" className="text-muted-foreground text-xs underline underline-offset-2">
        &larr; all events
      </Link>
      <div className="mt-2 mb-4">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold">{event?.event?.name ?? eventId}</h2>
          <span className="badge">{engagementStyle(event?.event)}</span>
        </div>
        {event?.event?.description && (
          <p className="text-muted-foreground text-sm">{String(event.event.description)}</p>
        )}
        <div className="text-muted-foreground mt-2 flex flex-wrap gap-3 text-xs">
          {stats?.contentCount !== undefined && <span>{stats.contentCount} uploads</span>}
          {views !== undefined && <span>{views} views</span>}
          {contest && stats?.curationCount !== undefined && <span>{stats.curationCount} curated</span>}
          {uploadCount?.uploadCount && (
            <span>
              your uploads: {uploadCount.uploadCount.APPROVED ?? 0} approved, {uploadCount.uploadCount.IN_REVIEW ?? 0} in review,{" "}
              {uploadCount.uploadCount.REJECTED ?? 0} rejected
            </span>
          )}
        </div>
      </div>
      <nav className="border-border mb-6 flex gap-5 border-b text-sm">
        {tabs.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            className="hover:text-primary text-muted-foreground pb-2 transition-colors"
          >
            {tab.label}
          </Link>
        ))}
      </nav>
      {children}
    </div>
  );
}
