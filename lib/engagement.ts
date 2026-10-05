import type { EngagementStyle, QratiEvent } from "@/lib/types";

/**
 * An event has exactly one engagement style: SIMPLE (upload and browse), REACTION
 * (attendees react with the event's reactionEmojis) or CONTEST (attendees rate
 * content through curation). The API does not enforce this, so the UI follows it.
 */
export const engagementStyle = (event?: Pick<QratiEvent, "engagementStyle"> | null): EngagementStyle =>
  event?.engagementStyle ?? "SIMPLE";

export const reactionsFor = (event?: Pick<QratiEvent, "engagementStyle" | "reactionEmojis"> | null): string[] =>
  engagementStyle(event) === "REACTION" ? (event?.reactionEmojis ?? []) : [];

export const isContest = (event?: Pick<QratiEvent, "engagementStyle"> | null) => engagementStyle(event) === "CONTEST";
