"use server";

/*
 * SCOPE MAP — read this first (humans and crawling agents).
 *
 * This file wraps the PUBLIC Qrati REST API (https://api.qrati.com/v1; spec:
 * https://api.qrati.com/v1/openapi.json; docs: https://api.qrati.com/docs).
 * The API is a runtime/data plane: it reads and writes content, uploads and
 * moderation decisions for events that ALREADY EXIST. It does not configure
 * anything. Configuration happens in the Qrati dashboard (https://qrati.com).
 * There is no /v1 endpoint for any row of this table, so do not look for one:
 *
 *   Concern                          Where it is done        What the API / this demo offers
 *   -------------------------------  ----------------------  ------------------------------------------------
 *   Event creation, edit, delete,    Dashboard               Read-only: listEvents(), getEvent(), folders.
 *   folders, cover images
 *   Event settings (visibility,      Dashboard (event        Read-only echo in getEvent(): status, visibility,
 *   status, engagement style,        settings)               engagementStyle, reactionEmojis, points, uploadLimit.
 *   reactions, language, points,
 *   theme, rating parameters,
 *   admins, access)
 *   Content moderation SETTINGS      Dashboard               The policy decides what lands IN_REVIEW. The API
 *   (auto-approve policy, NSFW/AI                            queue (moderationQueue/moderateContent) acts only
 *   checks, duplicates)                                      on items the policy left IN_REVIEW.
 *   Moderation workspace (bulk,      Dashboard               The API decides one item at a time.
 *   re-evaluation, feedback)
 *   Analytics (views, uploads,       Dashboard               Only getEventStats(), getEventLeaderboard() and
 *   curation, org activity)                                  getEventPoints() are exposed.
 *   Ad management (event ads, ad     Dashboard               No API surface.
 *   server sync, ad analytics)
 *   Organization settings (API       Dashboard               getOrganization() and listFolders() only. Keys,
 *   keys, webhooks, storage, brand-                          the webhook URL and storage are set in the
 *   ing, AI/face settings, identity                          dashboard; the API key used here comes from it.
 *   verification, roles)
 *   Search                           API                     Keyword search: GET /content?q= (caption and AI
 *                                                            description, org-wide) and ?keywords= (one event's
 *                                                            gallery). Facial search is NOT available in the API.
 *
 * Rule of thumb: if it changes how an event or organization BEHAVES, it is done in
 * the dashboard; if it moves content through that behaviour (upload, list, react,
 * curate, moderate, stream), it is in this file.
 *
 * Engagement style: an event has exactly one of SIMPLE, REACTION or CONTEST. REACTION
 * events let attendees react with the event's own reactionEmojis (arbitrary short
 * strings chosen by the owner; the API rejects any other value). CONTEST events use
 * ratings (curation). The API does not enforce the style, so the demo follows it in
 * the UI (see lib/engagement.ts).
 *
 * Moderation: the dashboard owns the policy and the human review UI; the API owns
 * programmatic decisions. Both write the same content record, so a decision is
 * recorded as moderation.source USER (dashboard) or API (this file), and a late AI
 * verdict never overrides either. An API decision fires the organization's webhook
 * and a live event-stream update.
 *
 * Auth: a SECRET key (QRATI_API_KEY, server-only). Moderation routes require it;
 * identity-bound routes also need x-qrati-uid (see lib/qrati.ts). Publishable keys
 * are for browser clients and cannot moderate.
 */

// Thin 1:1 wrappers around every api.qrati.com/v1 route via a raw fetch
// client (lib/qrati.ts) — no SDK, so the dashboard's client components can
// call the API without ever seeing the server-side API key. No extra
// validation layer here: the Qrati API validates everything —
// this is a demo, not a product surface.
//
// Every export below must be an `async function` (not a plain arrow-
// returning-a-promise) — that's the shape Next.js's "use server" transform
// recognizes as a callable Server Action reference; anything else silently
// drops from the client bundle.

import type { ModerationItem, PaginationMeta, UploadStatus } from "@/lib/types";
import { QratiApiError, currentIdentity, qratiGet, qratiList, qratiProbe, qratiRaw } from "@/lib/qrati";

// In a production build Next.js redacts the message of any error thrown from a Server Action. API errors are
// therefore returned as data ({ __qratiError }) and turned back into thrown errors, with their real message
// and problem code, by the `actions` wrapper in lib/actions.ts.
async function call<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof QratiApiError) {
      return { __qratiError: { status: err.status, code: err.code, message: err.message } } as unknown as T;
    }
    throw err;
  }
}

// Liveness and readiness are served at the API root, outside /v1.
export async function getStatus() {
  return call(async () => {
    return qratiProbe("/health");
  });
}
export async function getReadiness() {
  return call(async () => {
    return qratiProbe("/ready");
  });
}
export async function getOrganization() {
  return call(async () => {
    return qratiGet("/organization");
  });
}

export async function listFolders() {
  return call(async () => {
    return qratiGet("/folders");
  });
}
export async function getFolder(folderId: string) {
  return call(async () => {
    return qratiGet(`/folders/${folderId}`);
  });
}

export async function listEvents(params: {
  folderId?: string;
  includeAllFolders?: boolean;
  sort?: string;
  page?: number;
  limit?: number;
  contentLimit?: number;
  after?: string;
}) {
  return call(async () => {
    return qratiList("/events", { query: params });
  });
}
export async function searchEvents(params: { query: string; page?: number; limit?: number; contentLimit?: number; after?: string }) {
  return call(async () => {
    const { query, ...rest } = params;
    return qratiList("/events", { query: { ...rest, q: query } });
  });
}
export async function getEvent(eventId: string) {
  return call(async () => {
    return qratiGet(`/events/${eventId}`);
  });
}
export async function getEventStats(eventId: string) {
  return call(async () => {
    return qratiGet(`/events/${eventId}/stats`);
  });
}
export async function getEventLeaderboard(eventId: string) {
  return call(async () => {
    // Identity is optional here; with it the API also returns the caller's own rank (userRank).
    return qratiGet(`/events/${eventId}/leaderboard`, { identity: await currentIdentity() });
  });
}
export async function getEventUploadCount(eventId: string) {
  return call(async () => {
    return qratiGet(`/events/${eventId}/upload-count`, { identity: await currentIdentity(), requireIdentity: true });
  });
}
export async function getEventPoints(eventId: string) {
  return call(async () => {
    return qratiGet(`/events/${eventId}/points`, { identity: await currentIdentity(), requireIdentity: true });
  });
}

export async function listContent(params: {
  eventId: string;
  page?: number;
  limit?: number;
  contentLimit?: number;
  keywords?: string;
  sort?: string;
  after?: string;
}) {
  return call(async () => {
    return qratiList("/content", { query: params });
  });
}
export async function searchContent(params: { query: string; page?: number; limit?: number; after?: string }) {
  return call(async () => {
    const { query, ...rest } = params;
    return qratiList("/content", { query: { ...rest, q: query } });
  });
}
export async function getContentByIds(contentIds: string[], eventId?: string) {
  return call(async () => {
    return qratiGet("/content", { query: { ids: contentIds.join(","), eventId } });
  });
}
export async function getContent(contentId: string) {
  return call(async () => {
    return qratiGet(`/content/${contentId}`);
  });
}
export async function countContent(params: { eventId: string; filter?: string }) {
  return call(async () => {
    const result = await qratiGet("/content/count", { query: params });
    return result?.count;
  });
}
export async function myUploads(params?: { page?: number; limit?: number; sort?: string; after?: string }) {
  return call(async () => {
    return qratiList("/content/mine", { query: params, identity: await currentIdentity(), requireIdentity: true });
  });
}
export async function deleteContent(contentId: string) {
  return call(async () => {
    return qratiGet(`/content/${contentId}`, { method: "DELETE", identity: await currentIdentity(), requireIdentity: true });
  });
}
export async function reactToContent(params: { eventId: string; contentId: string; reaction: string }) {
  return call(async () => {
    const { contentId, ...body } = params;
    return qratiGet(`/content/${contentId}/reaction`, { method: "PUT", body, identity: await currentIdentity(), requireIdentity: true });
  });
}

export async function curationQueue(params: { eventId: string; page?: number; limit?: number; includeDescription?: boolean }) {
  return call(async () => {
    const { eventId, ...query } = params;
    return qratiGet(`/events/${eventId}/curation-queue`, { query, identity: await currentIdentity(), requireIdentity: true });
  });
}
export async function curationEligibility(params: { contentId: string; includeDescription?: boolean }) {
  return call(async () => {
    const { contentId, ...query } = params;
    return qratiGet(`/content/${contentId}/curation-eligibility`, { query, identity: await currentIdentity(), requireIdentity: true });
  });
}
export async function curationDecide(params: {
  eventId: string;
  contentId: string;
  parameterCount: number;
  inappropriate: string;
  userRatings: Array<{ parameterId?: string; rate: number }>;
}) {
  return call(async () => {
    const { contentId, ...body } = params;
    return qratiGet(`/content/${contentId}/curation`, { method: "POST", body, identity: await currentIdentity(), requireIdentity: true });
  });
}

export async function createUpload(params: {
  eventId: string;
  fileName: string;
  fileSize: number;
  rawContentType: string;
  type: "IMAGE" | "VIDEO";
  caption?: string;
  /** Idempotency key: retrying create with the same id returns the same upload, and uploadStatus can look it up. */
  clientUploadId?: string;
}) {
  return call(async () => {
    return qratiRaw("/uploads", { method: "POST", body: params, identity: await currentIdentity(), requireIdentity: true }) as Promise<{
      contentId: string;
      key: string;
      uploadUrl: string;
    }>;
  });
}
export async function completeUpload(params: { contentId: string; key: string }) {
  return call(async () => {
    return qratiRaw("/uploads/complete", {
      method: "POST",
      body: params,
      identity: await currentIdentity(),
      requireIdentity: true,
    }) as Promise<{ contentId: string }>;
  });
}
export async function failUpload(contentId: string) {
  return call(async () => {
    return qratiRaw("/uploads/fail", { method: "POST", body: { contentId }, identity: await currentIdentity(), requireIdentity: true });
  });
}
export async function abortUpload(params: { contentId: string; key?: string }) {
  return call(async () => {
    return qratiRaw("/uploads/abort", { method: "POST", body: params, identity: await currentIdentity(), requireIdentity: true });
  });
}

export async function uploadStatus(params: { contentId: string } | { eventId: string; clientUploadId: string }) {
  return call(async () => {
    return qratiRaw("/uploads/status", { query: params, identity: await currentIdentity(), requireIdentity: true }) as Promise<UploadStatus>;
  });
}

// Moderation is an owner surface: secret key only, scoped to the key's organization, no end-user identity.
export async function moderationQueue(params?: { eventId?: string; metadata?: string; after?: string; limit?: number }) {
  return call(async () => {
    return qratiList("/moderation/queue", { query: params }) as Promise<{ data: ModerationItem[]; meta?: PaginationMeta }>;
  });
}
export async function moderateContent(params: { contentId: string; status: "APPROVED" | "REJECTED"; reason?: string }) {
  return call(async () => {
    const { contentId, ...body } = params;
    return qratiGet(`/content/${contentId}/moderation`, { method: "PATCH", body }) as Promise<ModerationItem>;
  });
}
