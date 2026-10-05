import { readFileSync, existsSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Compares the live public OpenAPI spec with what this demo wraps. It fails when the API gains,
// loses or renames an endpoint, so the demo (and its README claim "every public endpoint") cannot
// silently go stale. Runs on a schedule in CI: `pnpm test:drift`.
const SPEC_URL = process.env.QRATI_SPEC_URL ?? "https://api.qrati.com/v1/openapi.json";

/** operation -> the Server Action in app/actions/qrati.ts that wraps it (or the file that serves it). */
const COVERED: Record<string, string> = {
  "GET /health": "getStatus",
  "GET /ready": "getReadiness",
  "GET /v1/organization": "getOrganization",
  "GET /v1/folders": "listFolders",
  "GET /v1/folders/{folderId}": "getFolder",
  "GET /v1/events": "listEvents",
  "GET /v1/events/{eventId}": "getEvent",
  "GET /v1/events/{eventId}/stats": "getEventStats",
  "GET /v1/events/{eventId}/leaderboard": "getEventLeaderboard",
  "GET /v1/events/{eventId}/upload-count": "getEventUploadCount",
  "GET /v1/events/{eventId}/points": "getEventPoints",
  "GET /v1/events/{eventId}/curation-queue": "curationQueue",
  "GET /v1/events/{eventId}/stream": "file:app/api/events/[eventId]/stream/route.ts",
  "GET /v1/content": "listContent",
  "GET /v1/content/count": "countContent",
  "GET /v1/content/mine": "myUploads",
  "GET /v1/content/{contentId}": "getContent",
  "DELETE /v1/content/{contentId}": "deleteContent",
  "PUT /v1/content/{contentId}/reaction": "reactToContent",
  "GET /v1/content/{contentId}/curation-eligibility": "curationEligibility",
  "POST /v1/content/{contentId}/curation": "curationDecide",
  "POST /v1/uploads": "createUpload",
  "POST /v1/uploads/complete": "completeUpload",
  "POST /v1/uploads/fail": "failUpload",
  "POST /v1/uploads/abort": "abortUpload",
  "GET /v1/uploads/status": "uploadStatus",
  "GET /v1/moderation/queue": "moderationQueue",
  "PATCH /v1/content/{contentId}/moderation": "moderateContent",
};

/** Not part of the client-facing API: admin and widget plumbing, and internal products. */
const NOT_CLIENT_API = [/^\/admin\//, /^\/api\/connect\//, /^\/v1\/qscore\//];

const METHODS = ["get", "post", "put", "patch", "delete"];

async function liveOperations(): Promise<string[]> {
  const res = await fetch(SPEC_URL);
  expect(res.ok, `could not fetch ${SPEC_URL}: ${res.status}`).toBe(true);
  const spec = (await res.json()) as { paths: Record<string, Record<string, unknown>> };
  return Object.entries(spec.paths)
    .filter(([path]) => !NOT_CLIENT_API.some((re) => re.test(path)))
    .flatMap(([path, ops]) => Object.keys(ops).filter((m) => METHODS.includes(m)).map((m) => `${m.toUpperCase()} ${path}`))
    .sort();
}

describe("the demo wraps every public API operation", () => {
  it("has a wrapper for each operation in the live spec, and none for operations that no longer exist", async () => {
    const live = await liveOperations();
    const covered = Object.keys(COVERED).sort();

    expect(live.filter((op) => !covered.includes(op)), "new API operations the demo does not cover yet").toEqual([]);
    expect(covered.filter((op) => !live.includes(op)), "demo wrappers for operations the API no longer has").toEqual([]);
  });

  it("really exports each wrapper named above", () => {
    const actions = readFileSync("app/actions/qrati.ts", "utf8");
    const exported = new Set([...actions.matchAll(/^export async function (\w+)/gm)].map((m) => m[1]));

    for (const [operation, target] of Object.entries(COVERED)) {
      if (target.startsWith("file:")) expect(existsSync(target.slice(5)), `${operation} -> ${target}`).toBe(true);
      else expect(exported.has(target), `${operation} -> ${target}`).toBe(true);
    }
  });
});
