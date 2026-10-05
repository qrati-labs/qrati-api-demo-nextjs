import { headers } from "next/headers";
import { auth } from "@/lib/auth";

// Event ids are 24-character hex ObjectIds. Anything else (e.g. "../moderation/queue") is rejected
// before it can be spliced into the upstream URL.
const EVENT_ID = /^[0-9a-f]{24}$/i;

// Bearer-key auth means the browser can't open the SSE connection directly
// (EventSource can't set custom headers) — proxy it: fetch server-side with
// the key, stream the response body straight through unmodified.
// Only signed-in demo users may use the proxy: it carries the organization's secret key.
export async function GET(request: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return new Response("Not signed in.", { status: 401 });

  const { eventId } = await params;
  if (!EVENT_ID.test(eventId)) return new Response("Invalid event id.", { status: 400 });

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
