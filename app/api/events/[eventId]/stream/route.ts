// Bearer-key auth means the browser can't open the SSE connection directly
// (EventSource can't set custom headers) — proxy it: fetch server-side with
// the key, stream the response body straight through unmodified.
export async function GET(request: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const baseUrl = (process.env.QRATI_BASE_URL ?? "https://api.qrati.com/v1").replace(/\/$/, "");

  const upstream = await fetch(`${baseUrl}/events/${eventId}/stream`, {
    headers: { authorization: `Bearer ${process.env.QRATI_API_KEY}`, accept: "text/event-stream" },
    signal: request.signal,
  });

  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
    },
  });
}
