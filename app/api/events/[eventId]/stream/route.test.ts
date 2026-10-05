import { describe, expect, it, vi, afterEach } from "vitest";
import { GET } from "./route";

describe("SSE stream proxy — /api/events/:id/stream", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("forwards the Bearer key and accept header to the upstream /events/:id/stream and passes the status/body through", async () => {
    const body = new ReadableStream();
    const fetchMock = vi.fn(async () => new Response(body, { status: 200 }));
    global.fetch = fetchMock;
    vi.stubEnv("QRATI_BASE_URL", "http://qrati.test/v1");
    vi.stubEnv("QRATI_API_KEY", "test-key");

    const res = await GET(new Request("http://localhost/api/events/e1/stream"), {
      params: Promise.resolve({ eventId: "e1" }),
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://qrati.test/v1/events/e1/stream",
      expect.objectContaining({
        headers: { authorization: "Bearer test-key", accept: "text/event-stream" },
      })
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/event-stream");
  });

  it("passes through a non-200 upstream status (e.g. an invalid key)", async () => {
    global.fetch = vi.fn(async () => new Response(null, { status: 401 }));
    vi.stubEnv("QRATI_BASE_URL", "http://qrati.test/v1");
    vi.stubEnv("QRATI_API_KEY", "bad-key");

    const res = await GET(new Request("http://localhost/api/events/e1/stream"), {
      params: Promise.resolve({ eventId: "e1" }),
    });

    expect(res.status).toBe(401);
  });
});
