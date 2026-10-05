// Minimal shapes for the fields the UI actually renders — Qrati's API
// returns richer objects than this; unknown fields just pass through.

export interface Content {
  _id: string;
  url?: string;
  thumbnailUrl?: string;
  type?: string;
  caption?: string;
  status?: string;
  uploaderName?: string;
  [key: string]: unknown;
}

export type EngagementStyle = "SIMPLE" | "CONTEST" | "REACTION";

export interface QratiEvent {
  _id: string;
  slug?: string;
  name?: string;
  description?: string;
  status?: string;
  /** One style per event: REACTION events use reactionEmojis, CONTEST events use ratings (curation). */
  engagementStyle?: EngagementStyle;
  reactionEmojis?: string[];
  [key: string]: unknown;
}

export interface QratiFolder {
  _id: string;
  name?: string;
  [key: string]: unknown;
}

export interface PaginationMeta {
  nextCursor?: string;
  hasMore?: boolean;
  totalCount?: number;
  [key: string]: unknown;
}

export interface ModerationItem extends Content {
  status: "IN_REVIEW" | "APPROVED" | "REJECTED";
  nsfwStatus?: Record<string, unknown>;
  moderationAnalysisState?: "NOT_REQUIRED" | "QUEUED" | "RUNNING" | "COMPLETE" | "FAILED";
  /** Who made the current decision; null while undecided. */
  decidedBy: "USER" | "API" | "AI" | null;
  decidedAt: string | null;
}

export interface UploadStatus {
  contentId: string;
  uploadStatus: string;
  processingStatus: "uploading" | "queued" | "processing" | "ready" | "failed" | "closed";
  moderationStatus: string;
  renditionReady: boolean;
  publicDiscovery: boolean;
  failureCode: string | null;
}
