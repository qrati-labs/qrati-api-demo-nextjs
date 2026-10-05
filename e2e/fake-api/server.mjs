// A small in-memory fake of the Qrati public API (/v1), used only by the end-to-end tests.
// Response shapes mirror the real API ({ data, meta } envelopes, RFC 9457 problem+json errors).
// Test-only controls live under /__test. This is not a Qrati implementation.
import http from "node:http";

const PORT = Number(process.env.FAKE_API_PORT ?? 8089);
const ORIGIN = `http://localhost:${PORT}`;
export const API_KEY = "e2e-secret-key";
const ORG_ID = "000000000000000000000a01";

let db;
let uploadsStore; // key -> bytes received
let sseClients;
let faults;

const id = (n) => n.toString(16).padStart(24, "0");
let seq;
const nextId = () => id(++seq);

function img(n) {
  return `${ORIGIN}/img/${n % 5}.svg`;
}

function makeContent({ eventId, caption, status = "APPROVED", userId = "seed-owner", metadata, n }) {
  const _id = nextId();
  return {
    _id,
    eventId,
    userId,
    caption,
    status,
    type: "IMAGE",
    url: img(n ?? seq),
    thumbnailUrl: img(n ?? seq),
    reactionCounts: {},
    metadata,
    processed: true,
    createdAt: new Date(Date.UTC(2026, 0, 1) + seq * 60000).toISOString(),
    decidedBy: null,
    decidedAt: null,
    ratings: new Set(),
  };
}

function reset() {
  seq = 100;
  faults = {};
  uploadsStore = new Map();
  sseClients = new Map();
  const eventBase = { organizationId: ORG_ID, visibility: "PUBLIC", status: "LIVE", publish: true };
  const events = [
    { ...eventBase, _id: id(1), name: "Demo Contest", slug: "demo-contest", description: "A CONTEST event", engagementStyle: "CONTEST", reactionEmojis: [] },
    { ...eventBase, _id: id(2), name: "Demo Reactions", slug: "demo-reactions", description: "A REACTION event", engagementStyle: "REACTION", reactionEmojis: ["👍", "❤️", "😂", "🔥"], folderId: id(50) },
    { ...eventBase, _id: id(3), name: "Demo Simple", slug: "demo-simple", description: "A SIMPLE event", engagementStyle: "SIMPLE", reactionEmojis: [] },
  ];
  const captions = ["Golden hour over the paddy fields", "Street food run", "River bank at low tide", "Monsoon clouds rolling in", "Handloom weaving demo", "Evening chai stop"];
  const content = [];
  for (const ev of events) {
    captions.forEach((caption, i) => {
      const c = makeContent({ eventId: ev._id, caption, status: i === 2 ? "IN_REVIEW" : "APPROVED", n: i });
      if (ev.engagementStyle === "REACTION" && i < 2) c.reactionCounts = { "👍": i + 1, "❤️": 2 };
      content.push(c);
    });
  }
  db = {
    events,
    folders: [{ _id: id(50), name: "Demo Folder" }],
    parameters: ["Creativity", "Composition", "Storytelling"].map((name, i) => ({ _id: id(60 + i), name })),
    content,
    uploads: new Map(), // contentId -> { clientUploadId, uploadStatus, key, userId }
    points: new Map(),
  };
}
reset();

const send = (res, status, body, headers = {}) => {
  res.writeHead(status, { "content-type": "application/json", ...cors(), ...headers });
  res.end(JSON.stringify(body));
};
const cors = () => ({
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
  "access-control-allow-headers": "*",
});
const problem = (res, status, code, detail, title) =>
  send(
    res,
    status,
    { type: "about:blank", title: title ?? ({ 400: "Bad Request", 401: "Unauthorized", 403: "Forbidden", 404: "Not Found", 409: "Conflict" }[status] ?? "Error"), status, detail, code },
    { "content-type": "application/problem+json" },
  );
const ok = (res, data, meta) => send(res, 200, meta ? { data, meta } : { data });

const clientContent = (c) => {
  const copy = { ...c };
  delete copy.ratings; // server-side bookkeeping, not part of the API shape
  delete copy.processed;
  return copy;
};
const moderationItem = (c) => ({
  ...clientContent(c),
  moderationAnalysisState: "COMPLETE",
  decidedBy: c.decidedBy,
  decidedAt: c.decidedAt,
});

function paginate(items, params, defaultLimit = 10, maxLimit = 100) {
  const limit = Math.min(Number(params.get("limit") ?? defaultLimit) || defaultLimit, maxLimit);
  const after = params.get("after");
  const start = after ? Number(Buffer.from(after, "base64").toString()) : 0;
  const page = items.slice(start, start + limit);
  const hasMore = start + limit < items.length;
  return {
    page,
    meta: { totalCount: -1, pageSize: limit, hasMore, ...(hasMore && { nextCursor: Buffer.from(String(start + limit)).toString("base64") }) },
  };
}

function parseMetadata(raw) {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed) && Object.values(parsed).every((v) => ["string", "number", "boolean"].includes(typeof v))) return parsed;
  } catch {
    /* fall through */
  }
  return null;
}
const matchesMetadata = (c, filter) => Object.entries(filter).every(([k, v]) => c.metadata?.[k] === v);

function emit(eventId, payload) {
  for (const res of sseClients.get(eventId) ?? []) res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

const readBody = (req) =>
  new Promise((resolve) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
  });
const readJson = async (req) => {
  try {
    return JSON.parse((await readBody(req)).toString() || "{}");
  } catch {
    return {};
  }
};

function summary(uploadStatus, c) {
  const processed = c.processed;
  return {
    contentId: c._id,
    uploadStatus,
    processingStatus: uploadStatus === "ABORTED" ? "closed" : uploadStatus === "CREATED" ? "uploading" : processed ? "ready" : "queued",
    moderationStatus: c.status,
    renditionReady: processed,
    publicDiscovery: c.status === "APPROVED" && processed,
    failureCode: null,
  };
}

function decide(c, status, reason) {
  const previous = c.status;
  if (previous === status) return;
  c.status = status;
  c.reason = reason;
  c.decidedBy = "API";
  c.decidedAt = new Date().toISOString();
  if (status === "APPROVED") emit(c.eventId, { organizationId: ORG_ID, type: "CONTENT_APPROVED", points: 0, event: { id: c.eventId }, content: { id: c._id }, decidedAt: c.decidedAt });
  else if (previous === "APPROVED") emit(c.eventId, { organizationId: ORG_ID, type: "content.removed", points: 0, event: { id: c.eventId }, content: { id: c._id } });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, ORIGIN);
  const p = url.pathname;
  const params = url.searchParams;
  const m = req.method;

  if (m === "OPTIONS") {
    res.writeHead(204, cors());
    return res.end();
  }

  // ---- static + test-only
  if (p.startsWith("/img/")) {
    const color = ["#e85d1f", "#2b6cb0", "#2f855a", "#805ad5", "#b83280"][Number(p.match(/\d+/)?.[0] ?? 0) % 5];
    res.writeHead(200, { "content-type": "image/svg+xml", ...cors() });
    return res.end(`<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="400" height="300" fill="${color}"/></svg>`);
  }
  if (p.startsWith("/__s3/")) {
    if (m === "PUT") {
      const body = await readBody(req);
      if (faults.s3Put) return send(res, 403, { error: "AccessDenied" });
      uploadsStore.set(decodeURIComponent(p.slice(6)), body.length);
      res.writeHead(200, cors());
      return res.end();
    }
  }
  if (p.startsWith("/__test/")) {
    const body = m === "POST" ? await readJson(req) : {};
    if (p === "/__test/reset") {
      reset();
      return ok(res, { reset: true });
    }
    if (p === "/__test/state") return ok(res, { content: db.content.map(clientContent), uploads: [...db.uploads.entries()].map(([k, v]) => ({ id: k, ...v })), s3Objects: [...uploadsStore.keys()] });
    if (p === "/__test/faults") {
      Object.assign(faults, body);
      return ok(res, faults);
    }
    if (p === "/__test/bulk") {
      const { eventId, count, status = "APPROVED", metadataBy } = body;
      for (let i = 0; i < count; i++) {
        const metadata = metadataBy ? { businessId: i < metadataBy.first ? metadataBy.a : metadataBy.b } : undefined;
        const c = makeContent({ eventId, caption: `Bulk ${status} ${i}`, status, metadata });
        db.content.push(c);
      }
      return ok(res, { added: count });
    }
    if (p === "/__test/process") {
      const c = db.content.find((x) => x._id === body.contentId);
      if (c) {
        c.processed = true;
        const upload = db.uploads.get(c._id);
        if (upload) upload.uploadStatus = "PROCESSED";
      }
      return ok(res, { processed: Boolean(c) });
    }
  }

  // ---- unauthenticated probes (API root)
  if (p === "/health") return send(res, 200, { status: "ok" });
  if (p === "/ready") return send(res, faults.notReady ? 503 : 200, { status: faults.notReady ? "degraded" : "ok", mongo: true, redis: !faults.notReady, storage: true });

  // ---- authenticated /v1
  if (!p.startsWith("/v1/")) return problem(res, 404, "route_not_found", `No route matches ${m} ${p}`);
  if (req.headers.authorization !== `Bearer ${API_KEY}`) return problem(res, 401, "invalid_api_key", "Invalid or missing API key");
  const uid = req.headers["x-qrati-uid"];
  const needUid = () => {
    if (uid) return true;
    problem(res, 400, "identity_required", "x-qrati-uid header is required");
    return false;
  };
  const path = p.slice(3); // strip /v1
  let r;

  if (m === "GET" && path === "/organization") return ok(res, { _id: ORG_ID, name: "Demo Org", customAuth: false });
  if (m === "GET" && path === "/folders") return ok(res, db.folders);
  if (m === "GET" && (r = path.match(/^\/folders\/(\w+)$/))) {
    const f = db.folders.find((x) => x._id === r[1]);
    return f ? ok(res, f) : problem(res, 404, "folder_not_found", "Folder not found");
  }

  // events
  if (m === "GET" && path === "/events") {
    let list = db.events;
    const q = params.get("q");
    if (q) list = list.filter((e) => e.name.toLowerCase().includes(q.toLowerCase()));
    else if (params.get("folderId")) list = list.filter((e) => e.folderId === params.get("folderId"));
    else if (params.get("includeAllFolders") !== "true") list = list.filter((e) => !e.folderId);
    const { page, meta } = paginate(list, params, 10, 50);
    // The list view omits these fields, like the real API.
    return ok(res, page.map((e) => Object.fromEntries(Object.entries(e).filter(([k]) => k !== "engagementStyle" && k !== "reactionEmojis"))), meta);
  }
  if ((r = path.match(/^\/events\/(\w+)(\/.*)?$/))) {
    const ev = db.events.find((e) => e._id === r[1]);
    if (!ev) return problem(res, 404, "event_not_found", "Event not found");
    const sub = r[2] ?? "";
    const inEvent = db.content.filter((c) => c.eventId === ev._id);
    if (m === "GET" && sub === "") return ok(res, { event: ev, parameters: ev.engagementStyle === "CONTEST" ? db.parameters : [] });
    if (m === "GET" && sub === "/stats") return ok(res, { eventViews: { views: 7 }, contentCount: inEvent.filter((c) => c.status === "APPROVED").length, curationCount: 3 });
    if (m === "GET" && sub === "/upload-count") {
      if (!needUid()) return;
      const mine = inEvent.filter((c) => c.userId === uid);
      return ok(res, { uploadCount: { APPROVED: mine.filter((c) => c.status === "APPROVED").length, IN_REVIEW: mine.filter((c) => c.status === "IN_REVIEW").length, REJECTED: mine.filter((c) => c.status === "REJECTED").length } });
    }
    if (m === "GET" && sub === "/points") {
      if (!needUid()) return;
      return ok(res, { upload: 0, curate: db.points.get(uid) ?? 0 });
    }
    if (m === "GET" && sub === "/leaderboard") {
      const top = [...db.points.entries()].map(([u, total], i) => ({ _id: u, name: u === uid ? "E2E Tester" : u, rank: i + 1, totalPoint: total }));
      return ok(res, { leaderboardByPoint: { topRankers: top, userRank: uid ? top.filter((t) => t._id === uid) : [] }, leaderboardByScore: { topRankers: [], userRank: [] } });
    }
    if (m === "GET" && sub === "/curation-queue") {
      if (!needUid()) return;
      return ok(res, inEvent.filter((c) => c.status === "APPROVED" && !c.ratings.has(uid)).map(clientContent));
    }
    if (m === "GET" && sub === "/stream") {
      res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive", ...cors() });
      res.write(": connected\n\n");
      sseClients.set(ev._id, [...(sseClients.get(ev._id) ?? []), res]);
      const hb = setInterval(() => res.write(": heartbeat\n\n"), 20000);
      req.on("close", () => {
        clearInterval(hb);
        sseClients.set(ev._id, (sseClients.get(ev._id) ?? []).filter((x) => x !== res));
      });
      return;
    }
  }

  // content
  if (m === "GET" && path === "/content/count") {
    const eventId = params.get("eventId");
    let list = db.content.filter((c) => c.eventId === eventId && !c.deleted);
    if (params.get("filter") === "status:APPROVED") list = list.filter((c) => c.status === "APPROVED" && c.processed);
    return ok(res, { count: list.length });
  }
  if (m === "GET" && path === "/content/mine") {
    if (!needUid()) return;
    const { page, meta } = paginate(db.content.filter((c) => c.userId === uid && !c.deleted && c.status !== undefined && !(db.uploads.get(c._id)?.uploadStatus === "ABORTED")).map(clientContent), params, 10, 100);
    return ok(res, page, meta);
  }
  if (m === "GET" && path === "/content") {
    const ids = params.get("ids");
    if (ids) return ok(res, ids.split(",").map((i) => db.content.find((c) => c._id === i)).filter(Boolean).map(clientContent));
    const q = params.get("q");
    if (q) {
      const list = db.content.filter((c) => c.status === "APPROVED" && c.processed && !c.deleted && c.caption.toLowerCase().includes(q.toLowerCase()));
      const { page, meta } = paginate(list.map(clientContent), params, 10, 100);
      return ok(res, page, { ...meta, totalContentCount: list.length });
    }
    const eventId = params.get("eventId");
    if (!eventId) return problem(res, 400, "validation_error", "eventId is required (or pass ids= / q=)");
    const list = db.content.filter((c) => c.eventId === eventId && c.status === "APPROVED" && c.processed && !c.deleted).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    const { page, meta } = paginate(list.map(clientContent), params, 10, 100);
    return ok(res, page, meta);
  }
  if ((r = path.match(/^\/content\/(\w+)(\/.*)?$/))) {
    const c = db.content.find((x) => x._id === r[1] && !x.deleted);
    const sub = r[2] ?? "";
    if (!c) return problem(res, 404, "content_not_found", "Content not found");
    if (m === "DELETE" && sub === "") {
      if (!needUid()) return;
      if (c.userId !== uid) return problem(res, 404, "content_not_found", "Content not found");
      c.deleted = true;
      return ok(res, clientContent(c));
    }
    if (m === "GET" && sub === "") return ok(res, clientContent(c));
    if (m === "PUT" && sub === "/reaction") {
      if (!needUid()) return;
      const { reaction } = await readJson(req);
      const ev = db.events.find((e) => e._id === c.eventId);
      if (!ev.reactionEmojis.includes(reaction)) return problem(res, 400, "invalid_reaction", "Reaction is not one of the event's configured reactionEmojis");
      c.reactionCounts[reaction] = (c.reactionCounts[reaction] ?? 0) + 1;
      return ok(res, clientContent(c));
    }
    if (m === "GET" && sub === "/curation-eligibility") {
      if (!needUid()) return;
      return ok(res, { ...clientContent(c), ratingStatus: c.ratings.has(uid) ? "already_rated" : "eligible" });
    }
    if (m === "POST" && sub === "/curation") {
      if (!needUid()) return;
      const body = await readJson(req);
      if (body.inappropriate !== "") return problem(res, 400, "unsupported_inappropriate_report", "Reporting content as inappropriate is not supported");
      if (c.ratings.has(uid)) return problem(res, 409, "already_rated", "You have already rated this content");
      c.ratings.add(uid);
      db.points.set(uid, (db.points.get(uid) ?? 0) + 10);
      return ok(res, { success: true });
    }
    if (m === "PATCH" && sub === "/moderation") {
      const body = await readJson(req);
      if (!["APPROVED", "REJECTED"].includes(body.status)) return problem(res, 400, "validation_error", 'Invalid option: expected one of "APPROVED"|"REJECTED"');
      if (faults.conflictNext) {
        faults.conflictNext = false;
        return problem(res, 409, "conflict", "Content was moderated concurrently; retry");
      }
      if (!c.processed) return problem(res, 409, "content_not_ready", "Content is still uploading or processing and cannot be moderated yet");
      decide(c, body.status, body.reason);
      return ok(res, moderationItem(c));
    }
  }

  // moderation queue
  if (m === "GET" && path === "/moderation/queue") {
    const filter = parseMetadata(params.get("metadata"));
    if (filter === null) return problem(res, 400, "invalid_metadata_filter", "metadata must be a JSON object of primitive key-values (keys: letters/digits/_- , max 25 keys, max 16KB)");
    const eventId = params.get("eventId");
    if (eventId && !db.events.some((e) => e._id === eventId)) return problem(res, 404, "event_not_found", "Event not found");
    const list = db.content.filter((c) => c.status === "IN_REVIEW" && c.processed && !c.deleted && (!eventId || c.eventId === eventId) && matchesMetadata(c, filter)).sort((a, b) => (a.createdAt > b.createdAt ? 1 : -1));
    const { page, meta } = paginate(list.map(moderationItem), params, 10, 100);
    return ok(res, page, meta);
  }

  // uploads
  if (path.startsWith("/uploads")) {
    if (!needUid()) return;
    if (m === "POST" && path === "/uploads") {
      const body = await readJson(req);
      const ev = db.events.find((e) => e._id === body.eventId);
      if (!ev) return problem(res, 404, "event_not_found", "Event not found");
      const existing = body.clientUploadId && [...db.uploads.entries()].find(([, u]) => u.clientUploadId === body.clientUploadId && u.userId === uid);
      let c = existing && db.content.find((x) => x._id === existing[0]);
      if (!c) {
        c = makeContent({ eventId: ev._id, caption: body.caption ?? body.fileName, status: "IN_REVIEW", userId: uid });
        c.processed = false;
        db.content.push(c);
        db.uploads.set(c._id, { clientUploadId: body.clientUploadId, uploadStatus: "CREATED", key: `event-${ev._id}/${c._id}.png`, userId: uid });
      }
      const up = db.uploads.get(c._id);
      if (faults.createResponseLost) {
        faults.createResponseLost = false;
        return problem(res, 500, "internal_error", "Internal server error");
      }
      return send(res, 200, { contentId: c._id, key: up.key, uploadUrl: `${ORIGIN}/__s3/${encodeURIComponent(up.key)}` });
    }
    if (m === "POST" && path === "/uploads/complete") {
      const { contentId, key } = await readJson(req);
      const up = db.uploads.get(contentId);
      if (!up || up.userId !== uid) return problem(res, 404, "upload_not_found", "Upload not found");
      if (!uploadsStore.has(key)) return problem(res, 409, "upload_not_found_in_storage", "The file has not been uploaded");
      up.uploadStatus = "PROCESSING_QUEUED";
      return send(res, 200, { contentId });
    }
    if (m === "POST" && (path === "/uploads/fail" || path === "/uploads/abort")) {
      const { contentId } = await readJson(req);
      const up = db.uploads.get(contentId);
      if (!up || up.userId !== uid) return problem(res, 404, "upload_not_found", "Upload not found");
      up.uploadStatus = path.endsWith("fail") ? "PROCESSING_FAILED" : "ABORTED";
      return send(res, 200, { contentId, uploadStatus: up.uploadStatus });
    }
    if (m === "GET" && path === "/uploads/status") {
      const found = params.get("contentId")
        ? [params.get("contentId"), db.uploads.get(params.get("contentId"))]
        : [...db.uploads.entries()].find(([, u]) => u.clientUploadId === params.get("clientUploadId") && u.userId === uid);
      const up = found?.[1];
      if (!up || up.userId !== uid) return problem(res, 404, "upload_not_found", "Upload not found");
      return send(res, 200, summary(up.uploadStatus, db.content.find((c) => c._id === found[0])));
    }
  }

  return problem(res, 404, "route_not_found", `No route matches ${m} ${p}`);
});

server.listen(PORT, () => console.log(`[fake-api] listening on ${ORIGIN}`));
