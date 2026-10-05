import { describe, expect, it, vi, afterEach, beforeEach } from "vitest";

const mockGetSession = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: { api: { getSession: (...a: unknown[]) => mockGetSession(...a) } } }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));

import { GET } from "./route";

const EVENT_ID = "6ac3a689f263bed8cdae55b4";
const call = (eventId: string) =>
  GET(new Request(`http://localhost/api/events/${eventId}/stream`), { params: Promise.resolve({ eventId }) });

describe("SSE stream proxy — /api/events/:id/stream", () => {
  beforeEach(() => mockGetSession.mockResolvedValue({ user: { id: "u1" } }));
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it("forwards the Bearer key and accept header to the upstream /events/:id/stream and passes the status/body through", async () => {
    const fetchMock = vi.fn(async () => new Response(new ReadableStream(), { status: 200 }));
    global.fetch = fetchMock;
    vi.stubEnv("QRATI_BASE_URL", "http://qrati.test/v1");
    vi.stubEnv("QRATI_API_KEY", "test-key");

    const res = await call(EVENT_ID);

    expect(fetchMock).toHaveBeenCalledWith(
      `http://qrati.test/v1/events/${EVENT_ID}/stream`,
      expect.objectContaining({ headers: { authorization: "Bearer test-key", accept: "text/event-stream" } })
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/event-stream");
  });

  it("passes through a non-200 upstream status (e.g. an invalid key)", async () => {
    global.fetch = vi.fn(async () => new Response(null, { status: 401 }));
    vi.stubEnv("QRATI_BASE_URL", "http://qrati.test/v1");
    vi.stubEnv("QRATI_API_KEY", "bad-key");

    expect((await call(EVENT_ID)).status).toBe(401);
  });

  it("refuses signed-out callers without contacting the API (the proxy carries the secret key)", async () => {
    mockGetSession.mockResolvedValue(null);
    const fetchMock = vi.fn();
    global.fetch = fetchMock;

    const res = await call(EVENT_ID);

    expect(res.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(["e1", "../moderation/queue", "..%2Fmoderation%2Fqueue", `${EVENT_ID}/../content`, `${EVENT_ID}?x=1`, "", "6AC3A689F263BED8CDAE55B4Z"])(
    "rejects the malformed event id %j without contacting the API",
    async (eventId) => {
      const fetchMock = vi.fn();
      global.fetch = fetchMock;

      const res = await call(eventId);

      expect(res.status).toBe(400);
      expect(fetchMock).not.toHaveBeenCalled();
    }
  );

  it("accepts an upper-case hex id", async () => {
    global.fetch = vi.fn(async () => new Response(null, { status: 200 }));
    expect((await call(EVENT_ID.toUpperCase())).status).toBe(200);
  });
});
