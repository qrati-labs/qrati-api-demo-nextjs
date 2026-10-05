import { describe, expect, it, vi, beforeEach } from "vitest";

const { FakeQratiApiError } = vi.hoisted(() => ({
  FakeQratiApiError: class extends Error {
    constructor(
      readonly status: number,
      message: string,
      readonly code?: string
    ) {
      super(message);
    }
  },
}));

vi.mock("@/lib/qrati", () => ({
  QratiApiError: FakeQratiApiError,
  qratiGet: vi.fn(async () => ({ ok: "get" })),
  qratiList: vi.fn(async () => ({ ok: "list" })),
  qratiRaw: vi.fn(async () => ({ ok: "raw" })),
  qratiProbe: vi.fn(async () => ({ status: "ok" })),
  currentIdentity: vi.fn(async () => ({ uid: "u1", fname: "Ada", lname: "Lovelace" })),
}));

import * as qrati from "@/lib/qrati";
import * as actions from "./qrati";

const identity = { identity: { uid: "u1", fname: "Ada", lname: "Lovelace" }, requireIdentity: true };

describe("server actions — thin wiring to /v1 routes", () => {
  beforeEach(() => vi.clearAllMocks());

  it("getStatus -> unversioned GET /health (liveness lives at the API root, not /v1)", async () => {
    await actions.getStatus();
    expect(qrati.qratiProbe).toHaveBeenCalledWith("/health");
  });

  it("getReadiness -> unversioned GET /ready", async () => {
    await actions.getReadiness();
    expect(qrati.qratiProbe).toHaveBeenCalledWith("/ready");
  });

  it("getOrganization -> GET /organization", async () => {
    await actions.getOrganization();
    expect(qrati.qratiGet).toHaveBeenCalledWith("/organization");
  });

  it("listFolders -> GET /folders", async () => {
    await actions.listFolders();
    expect(qrati.qratiGet).toHaveBeenCalledWith("/folders");
  });

  it("getFolder -> GET /folders/:id", async () => {
    await actions.getFolder("f1");
    expect(qrati.qratiGet).toHaveBeenCalledWith("/folders/f1");
  });

  it("listEvents -> GET /events with query", async () => {
    await actions.listEvents({ folderId: "f1", limit: 10 });
    expect(qrati.qratiList).toHaveBeenCalledWith("/events", { query: { folderId: "f1", limit: 10 } });
  });

  it("searchEvents -> GET /events with q= and query stripped of its own `query` key", async () => {
    await actions.searchEvents({ query: "beach", limit: 5 });
    expect(qrati.qratiList).toHaveBeenCalledWith("/events", { query: { limit: 5, q: "beach" } });
  });

  it("getEvent -> GET /events/:id", async () => {
    await actions.getEvent("e1");
    expect(qrati.qratiGet).toHaveBeenCalledWith("/events/e1");
  });

  it("getEventStats -> GET /events/:id/stats", async () => {
    await actions.getEventStats("e1");
    expect(qrati.qratiGet).toHaveBeenCalledWith("/events/e1/stats");
  });

  it("getEventLeaderboard -> GET /events/:id/leaderboard, sends identity (optional) so userRank is returned", async () => {
    await actions.getEventLeaderboard("e1");
    expect(qrati.qratiGet).toHaveBeenCalledWith("/events/e1/leaderboard", { identity: identity.identity });
  });

  it("getEventUploadCount requires identity", async () => {
    await actions.getEventUploadCount("e1");
    expect(qrati.qratiGet).toHaveBeenCalledWith("/events/e1/upload-count", identity);
  });

  it("getEventPoints requires identity", async () => {
    await actions.getEventPoints("e1");
    expect(qrati.qratiGet).toHaveBeenCalledWith("/events/e1/points", identity);
  });

  it("listContent -> GET /content with query", async () => {
    await actions.listContent({ eventId: "e1", limit: 24 });
    expect(qrati.qratiList).toHaveBeenCalledWith("/content", { query: { eventId: "e1", limit: 24 } });
  });

  it("searchContent -> GET /content with q=", async () => {
    await actions.searchContent({ query: "cat" });
    expect(qrati.qratiList).toHaveBeenCalledWith("/content", { query: { q: "cat" } });
  });

  it("getContentByIds -> GET /content joins ids with commas", async () => {
    await actions.getContentByIds(["a", "b"], "e1");
    expect(qrati.qratiGet).toHaveBeenCalledWith("/content", { query: { ids: "a,b", eventId: "e1" } });
  });

  it("getContent -> GET /content/:id", async () => {
    await actions.getContent("c1");
    expect(qrati.qratiGet).toHaveBeenCalledWith("/content/c1");
  });

  it("countContent unwraps .count from the response", async () => {
    vi.mocked(qrati.qratiGet).mockResolvedValueOnce({ count: 42 });
    const result = await actions.countContent({ eventId: "e1" });
    expect(qrati.qratiGet).toHaveBeenCalledWith("/content/count", { query: { eventId: "e1" } });
    expect(result).toBe(42);
  });

  it("myUploads requires identity, hits /content/mine", async () => {
    await actions.myUploads({ limit: 24 });
    expect(qrati.qratiList).toHaveBeenCalledWith("/content/mine", { query: { limit: 24 }, ...identity });
  });

  it("deleteContent -> DELETE /content/:id, requires identity", async () => {
    await actions.deleteContent("c1");
    expect(qrati.qratiGet).toHaveBeenCalledWith("/content/c1", { method: "DELETE", ...identity });
  });

  it("reactToContent -> PUT /content/:id/reaction, requires identity, strips contentId from body", async () => {
    await actions.reactToContent({ eventId: "e1", contentId: "c1", reaction: "LIKE" });
    expect(qrati.qratiGet).toHaveBeenCalledWith("/content/c1/reaction", {
      method: "PUT",
      body: { eventId: "e1", reaction: "LIKE" },
      ...identity,
    });
  });

  it("curationQueue -> GET /events/:id/curation-queue, requires identity", async () => {
    await actions.curationQueue({ eventId: "e1", limit: 20 });
    expect(qrati.qratiGet).toHaveBeenCalledWith("/events/e1/curation-queue", { query: { limit: 20 }, ...identity });
  });

  it("curationEligibility -> GET /content/:id/curation-eligibility, requires identity", async () => {
    await actions.curationEligibility({ contentId: "c1" });
    expect(qrati.qratiGet).toHaveBeenCalledWith("/content/c1/curation-eligibility", { query: {}, ...identity });
  });

  it("curationDecide -> POST /content/:id/curation, requires identity, strips contentId from body", async () => {
    await actions.curationDecide({ eventId: "e1", contentId: "c1", parameterCount: 1, inappropriate: "", userRatings: [] });
    expect(qrati.qratiGet).toHaveBeenCalledWith("/content/c1/curation", {
      method: "POST",
      body: { eventId: "e1", parameterCount: 1, inappropriate: "", userRatings: [] },
      ...identity,
    });
  });

  it("createUpload -> raw POST /uploads, requires identity", async () => {
    const params = { eventId: "e1", fileName: "a.jpg", fileSize: 10, rawContentType: "image/jpeg", type: "IMAGE" as const };
    await actions.createUpload(params);
    expect(qrati.qratiRaw).toHaveBeenCalledWith("/uploads", { method: "POST", body: params, ...identity });
  });

  it("completeUpload -> raw POST /uploads/complete, requires identity", async () => {
    await actions.completeUpload({ contentId: "c1", key: "k1" });
    expect(qrati.qratiRaw).toHaveBeenCalledWith("/uploads/complete", { method: "POST", body: { contentId: "c1", key: "k1" }, ...identity });
  });

  it("failUpload -> raw POST /uploads/fail, requires identity", async () => {
    await actions.failUpload("c1");
    expect(qrati.qratiRaw).toHaveBeenCalledWith("/uploads/fail", { method: "POST", body: { contentId: "c1" }, ...identity });
  });

  it("abortUpload -> raw POST /uploads/abort, requires identity", async () => {
    await actions.abortUpload({ contentId: "c1", key: "k1" });
    expect(qrati.qratiRaw).toHaveBeenCalledWith("/uploads/abort", { method: "POST", body: { contentId: "c1", key: "k1" }, ...identity });
  });

  it("createUpload forwards clientUploadId untouched", async () => {
    const params = { eventId: "e1", fileName: "a.jpg", fileSize: 10, rawContentType: "image/jpeg", type: "IMAGE" as const, clientUploadId: "u-1" };
    await actions.createUpload(params);
    expect(qrati.qratiRaw).toHaveBeenCalledWith("/uploads", { method: "POST", body: params, ...identity });
  });

  it("uploadStatus -> raw GET /uploads/status by contentId, requires identity", async () => {
    await actions.uploadStatus({ contentId: "c1" });
    expect(qrati.qratiRaw).toHaveBeenCalledWith("/uploads/status", { query: { contentId: "c1" }, ...identity });
  });

  it("uploadStatus -> raw GET /uploads/status by eventId + clientUploadId", async () => {
    await actions.uploadStatus({ eventId: "e1", clientUploadId: "u-1" });
    expect(qrati.qratiRaw).toHaveBeenCalledWith("/uploads/status", { query: { eventId: "e1", clientUploadId: "u-1" }, ...identity });
  });

  it("moderationQueue -> GET /moderation/queue keeping { data, meta }, secret key only (no identity)", async () => {
    await actions.moderationQueue({ eventId: "e1", metadata: '{"businessId":"b1"}', after: "c", limit: 5 });
    expect(qrati.qratiList).toHaveBeenCalledWith("/moderation/queue", {
      query: { eventId: "e1", metadata: '{"businessId":"b1"}', after: "c", limit: 5 },
    });
  });

  it("moderationQueue works with no params", async () => {
    await actions.moderationQueue();
    expect(qrati.qratiList).toHaveBeenCalledWith("/moderation/queue", { query: undefined });
  });

  it("moderateContent -> PATCH /content/:id/moderation, strips contentId from body, no identity", async () => {
    await actions.moderateContent({ contentId: "c1", status: "REJECTED", reason: "off-topic" });
    expect(qrati.qratiGet).toHaveBeenCalledWith("/content/c1/moderation", {
      method: "PATCH",
      body: { status: "REJECTED", reason: "off-topic" },
    });
  });

  it("returns an API error as data ({ __qratiError }) so its message survives a production build", async () => {
    vi.mocked(qrati.qratiGet).mockRejectedValueOnce(new FakeQratiApiError(409, "Content is still processing", "content_not_ready"));

    const result = await actions.moderateContent({ contentId: "c1", status: "APPROVED" });

    expect(result).toEqual({ __qratiError: { status: 409, code: "content_not_ready", message: "Content is still processing" } });
  });

  it("rethrows errors that are not API errors (e.g. not signed in)", async () => {
    vi.mocked(qrati.qratiGet).mockRejectedValueOnce(new Error("Not signed in."));

    await expect(actions.getOrganization()).rejects.toThrow("Not signed in.");
  });
});
