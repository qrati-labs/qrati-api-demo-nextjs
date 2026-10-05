import { headers } from "next/headers";
import { auth } from "./auth";

const BASE_URL = (process.env.QRATI_BASE_URL ?? "https://api.qrati.com/v1").replace(/\/$/, "");
// /health and /ready live at the API root, not under /v1.
const ORIGIN = BASE_URL.replace(/\/v1$/, "");
const API_KEY = process.env.QRATI_API_KEY;
if (!API_KEY) throw new Error("QRATI_API_KEY is not set — copy .env.example to .env.local and fill it in.");

export interface Identity {
  uid: string;
  fname?: string;
  lname?: string;
}

export class QratiApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    /** Machine-readable problem+json `code`, e.g. `content_not_ready` or `conflict`. */
    readonly code?: string
  ) {
    super(message);
    this.name = "QratiApiError";
  }
}

interface RequestOptions {
  method?: string;
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  identity?: Identity;
  requireIdentity?: boolean;
}

/** Raw call against api.qrati.com/v1 — Bearer key + optional end-user identity headers. */
async function send(path: string, opts: RequestOptions = {}) {
  // Server Actions are public POST endpoints, so every call that carries the secret key requires a session,
  // and the path may only contain URL-safe segments (ids are hex): no "..", "?", "#" or encoded characters.
  await requireSession();
  if (!/^\/[A-Za-z0-9_\-/]*$/.test(path) || path.includes("//") || path.split("/").includes("..")) {
    throw new Error(`Invalid request path: ${path}`);
  }

  if ((opts.requireIdentity ?? false) && !opts.identity?.uid) {
    throw new Error("This call needs a signed-in identity (x-qrati-uid).");
  }

  const reqHeaders: Record<string, string> = {
    "content-type": "application/json",
    authorization: `Bearer ${API_KEY}`,
  };
  if (opts.identity?.uid) {
    reqHeaders["x-qrati-uid"] = opts.identity.uid;
    if (opts.identity.fname) reqHeaders["x-qrati-fname"] = opts.identity.fname;
    if (opts.identity.lname) reqHeaders["x-qrati-lname"] = opts.identity.lname;
  }

  let url = `${BASE_URL}${path}`;
  if (opts.query) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(opts.query)) {
      if (value !== undefined) params.set(key, String(value));
    }
    const qs = params.toString();
    if (qs) url += `?${qs}`;
  }

  const res = await fetch(url, {
    method: opts.method ?? "GET",
    headers: reqHeaders,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });

  const isJson = res.headers.get("content-type")?.includes("json") ?? false;
  const body = isJson ? await res.json().catch(() => undefined) : undefined;

  if (!res.ok) {
    const message = body?.detail ?? body?.title ?? body?.error ?? body?.message ?? `Request to ${path} failed with status ${res.status}`;
    throw new QratiApiError(res.status, message, typeof body?.code === "string" ? body.code : undefined);
  }

  return body;
}

/** Unwraps the `{ data }` envelope most routes return. */
export async function qratiGet(path: string, opts: RequestOptions = {}) {
  const body = await send(path, { ...opts, method: opts.method ?? "GET" });
  return body?.data;
}

/** Keeps `{ data, meta }` intact — for paginated list routes. */
export async function qratiList(path: string, opts: RequestOptions = {}) {
  return send(path, { ...opts, method: opts.method ?? "GET" });
}

/** No envelope — the four /uploads/* routes return a raw body. */
export async function qratiRaw(path: string, opts: RequestOptions = {}) {
  return send(path, opts);
}

/**
 * Unauthenticated GET against the API root (`/health`, `/ready`). Unlike `send`
 * it returns the body for non-2xx too: `/ready` answers 503 with a useful
 * `{ status: "degraded", mongo, redis, storage }` payload.
 */
export async function qratiProbe(path: string) {
  const res = await fetch(`${ORIGIN}${path}`);
  const body = await res.json().catch(() => undefined);
  return { httpStatus: res.status, ...body };
}

async function requireSession() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) throw new Error("Not signed in.");
  return session;
}

/** The signed-in demo user, reshaped into the uid/fname/lname identity Qrati expects. */
export async function currentIdentity(): Promise<Identity> {
  const session = await requireSession();
  const [fname, ...rest] = session.user.name.split(" ");
  return { uid: session.user.id, fname, lname: rest.join(" ") || undefined };
}
