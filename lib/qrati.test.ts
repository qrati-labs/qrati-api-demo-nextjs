import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockGetSession = vi.fn();
const mockHeaders = vi.fn();

vi.mock("@/lib/auth", () => ({
  auth: { api: { getSession: (...args: unknown[]) => mockGetSession(...args) } },
}));
vi.mock("next/headers", () => ({
  headers: () => mockHeaders(),
}));

// Imported after the mocks above so lib/qrati.ts's `import { auth } from "./auth"`
// resolves to the mock, never touching the real better-auth/mongodb setup.
const { qratiGet, qratiList, qratiRaw, qratiProbe, currentIdentity, QratiApiError } = await import("./qrati");

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("qrati http client", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    mockHeaders.mockResolvedValue(new Headers());
    mockGetSession.mockResolvedValue({ user: { id: "user_1", name: "Ada Lovelace" } });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("refuses every call without a session, before contacting the API (Server Actions are public endpoints)", async () => {
    mockGetSession.mockResolvedValue(null);

    await expect(qratiGet("/organization")).rejects.toThrow("Not signed in.");
    await expect(qratiList("/content")).rejects.toThrow("Not signed in.");
    await expect(qratiRaw("/uploads", { method: "POST" })).rejects.toThrow("Not signed in.");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(["/events/../moderation/queue", "/events/abc?x=1", "/events/abc#f", "/events/%2e%2e/x", "//evil.test/x", "/events/a b", "events/abc", "/events/abc\\x", "/content/\u202e"])(
    "rejects the unsafe path %j without contacting the API",
    async (path) => {
      await expect(qratiGet(path)).rejects.toThrow(/Invalid request path/);
      expect(fetchMock).not.toHaveBeenCalled();
    }
  );

  it("accepts the paths the demo actually uses", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { data: {} }));

    for (const path of ["/organization", "/events/6ac3a689f263bed8cdae55b4/curation-queue", "/content/count", "/moderation/queue", "/uploads/status"]) {
      await qratiGet(path);
    }
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  it("sends a Bearer auth header against the configured base URL", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { data: { status: "ok" } }));

    await qratiGet("/status");

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://qrati.test/v1/status");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer test-api-key");
  });

  it("unwraps the { data } envelope for qratiGet", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { data: { _id: "abc123" } }));

    const result = await qratiGet("/content/abc123");

    expect(result).toEqual({ _id: "abc123" });
  });

  it("keeps { data, meta } intact for qratiList", async () => {
    const body = { data: [{ _id: "1" }, { _id: "2" }], meta: { hasMore: true, nextCursor: "c2" } };
    fetchMock.mockResolvedValue(jsonResponse(200, body));

    const result = await qratiList("/content", { query: { eventId: "e1" } });

    expect(result).toEqual(body);
  });

  it("returns the body unmodified for qratiRaw (no envelope)", async () => {
    const body = { contentId: "c1", key: "k1", uploadUrl: "https://s3.example/put" };
    fetchMock.mockResolvedValue(jsonResponse(200, body));

    const result = await qratiRaw("/uploads", { method: "POST", body: { eventId: "e1" } });

    expect(result).toEqual(body);
  });

  it("attaches x-qrati-uid/fname/lname headers when identity is supplied", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { data: {} }));

    await qratiGet("/content/mine", { identity: { uid: "u1", fname: "Ada", lname: "Lovelace" } });

    const headers = fetchMock.mock.calls[0][1].headers as Record<string, string>;
    expect(headers["x-qrati-uid"]).toBe("u1");
    expect(headers["x-qrati-fname"]).toBe("Ada");
    expect(headers["x-qrati-lname"]).toBe("Lovelace");
  });

  it("refuses to call the network when requireIdentity is set and no identity is given", async () => {
    await expect(qratiGet("/content/mine", { requireIdentity: true })).rejects.toThrow(/signed-in identity/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("omits undefined query values but stringifies everything else", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { data: {} }));

    await qratiGet("/events", { query: { folderId: undefined, limit: 10, includeAllFolders: true } });

    const url = fetchMock.mock.calls[0][0] as string;
    const params = new URL(url).searchParams;
    expect(params.has("folderId")).toBe(false);
    expect(params.get("limit")).toBe("10");
    expect(params.get("includeAllFolders")).toBe("true");
  });

  it("throws a QratiApiError using the problem+json detail field", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(404, { type: "about:blank", title: "Not Found", status: 404, detail: "Event not found", code: "event_not_found" })
    );

    await expect(qratiGet("/events/missing")).rejects.toMatchObject({
      name: "QratiApiError",
      status: 404,
      message: "Event not found",
    });
  });

  it("falls back through title/error/message when detail is absent", async () => {
    fetchMock.mockResolvedValue(jsonResponse(400, { error: "Missing required fields" }));

    await expect(qratiGet("/uploads")).rejects.toThrow("Missing required fields");
  });

  it("falls back to a generic message when the error body has no known field", async () => {
    fetchMock.mockResolvedValue(jsonResponse(500, {}));

    await expect(qratiGet("/status")).rejects.toThrow("Request to /status failed with status 500");
  });

  it("exposes the problem+json code on QratiApiError (e.g. 409 content_not_ready)", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(409, { title: "Conflict", status: 409, detail: "Content is still uploading or processing", code: "content_not_ready" })
    );

    await expect(qratiGet("/content/c1/moderation", { method: "PATCH", body: { status: "APPROVED" } })).rejects.toMatchObject({
      status: 409,
      code: "content_not_ready",
    });
  });

  it("leaves code undefined when the error body has none", async () => {
    fetchMock.mockResolvedValue(jsonResponse(500, { error: "boom" }));

    await expect(qratiGet("/x")).rejects.toMatchObject({ status: 500, code: undefined });
  });

  it("sends a JSON body with the PATCH method", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { data: { status: "APPROVED" } }));

    await qratiGet("/content/c1/moderation", { method: "PATCH", body: { status: "APPROVED" } });

    const [, init] = fetchMock.mock.calls[0];
    expect(init.method).toBe("PATCH");
    expect(init.body).toBe(JSON.stringify({ status: "APPROVED" }));
  });

  it("propagates the QratiApiError class so callers can branch on .status", async () => {
    fetchMock.mockResolvedValue(jsonResponse(403, { detail: "Forbidden" }));

    try {
      await qratiGet("/content/x");
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(QratiApiError);
      expect((err as InstanceType<typeof QratiApiError>).status).toBe(403);
    }
  });
});

describe("qratiProbe", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("calls the API root, not /v1, without credentials", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { status: "ok" }));

    const result = await qratiProbe("/health");

    expect(fetchMock).toHaveBeenCalledWith("http://qrati.test/health");
    expect(result).toEqual({ httpStatus: 200, status: "ok" });
  });

  it("returns the body for a 503 /ready instead of throwing", async () => {
    fetchMock.mockResolvedValue(jsonResponse(503, { status: "degraded", mongo: true, redis: false, storage: true }));

    const result = await qratiProbe("/ready");

    expect(result).toMatchObject({ httpStatus: 503, status: "degraded", redis: false });
  });

  it("survives a non-JSON body", async () => {
    fetchMock.mockResolvedValue(new Response("Bad Gateway", { status: 502 }));

    await expect(qratiProbe("/ready")).resolves.toEqual({ httpStatus: 502 });
  });
});

describe("currentIdentity", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("splits the session user's name into uid/fname/lname", async () => {
    mockHeaders.mockResolvedValue(new Headers());
    mockGetSession.mockResolvedValue({ user: { id: "user_1", name: "Ada Lovelace" } });

    const identity = await currentIdentity();

    expect(identity).toEqual({ uid: "user_1", fname: "Ada", lname: "Lovelace" });
  });

  it("leaves lname undefined for a single-word name", async () => {
    mockHeaders.mockResolvedValue(new Headers());
    mockGetSession.mockResolvedValue({ user: { id: "user_2", name: "Cher" } });

    const identity = await currentIdentity();

    expect(identity).toEqual({ uid: "user_2", fname: "Cher", lname: undefined });
  });

  it("throws when there is no session", async () => {
    mockHeaders.mockResolvedValue(new Headers());
    mockGetSession.mockResolvedValue(null);

    await expect(currentIdentity()).rejects.toThrow("Not signed in.");
  });
});
