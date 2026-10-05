import * as actions from "@/app/actions/qrati";
import { GalleryGrid } from "@/components/gallery/GalleryGrid";
import { isContest, reactionsFor } from "@/lib/engagement";

export default async function GalleryPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  // Reactions only exist on REACTION events and the API accepts only event.reactionEmojis;
  // curation (rating) only exists on CONTEST events.
  const event = await actions.getEvent(eventId).catch(() => null);
  return <GalleryGrid eventId={eventId} reactionEmojis={reactionsFor(event?.event)} curation={isContest(event?.event)} />;
}
