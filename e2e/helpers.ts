import { expect, request, type APIRequestContext, type Page } from "@playwright/test";

export const API = "http://localhost:8089";
export const KEY = "e2e-secret-key";
export const EVENT = { contest: "000000000000000000000001", reactions: "000000000000000000000002", simple: "000000000000000000000003" };

export interface FakeContent {
  _id: string;
  eventId: string;
  caption: string;
  status: string;
  decidedBy?: string | null;
  reason?: string;
}
export interface FakeState {
  content: FakeContent[];
  uploads: Array<{ id: string; clientUploadId?: string; uploadStatus: string; key: string; userId: string }>;
  s3Objects: string[];
}

let ctx: APIRequestContext | undefined;
const api = async () => (ctx ??= await request.newContext({ baseURL: API }));

/** Test-only controls on the fake API. */
export const fake = {
  reset: async () => (await api()).post("/__test/reset"),
  state: async (): Promise<FakeState> => ((await (await api()).get("/__test/state")).json() as Promise<{ data: FakeState }>).then((r) => r.data),
  faults: async (faults: Record<string, unknown>) => (await api()).post("/__test/faults", { data: faults }),
  bulk: async (data: Record<string, unknown>) => (await api()).post("/__test/bulk", { data }),
  process: async (contentId: string) => (await api()).post("/__test/process", { data: { contentId } }),
  /** A real call to the fake with the secret key, like an integrator's backend would make. */
  call: async (method: "PATCH" | "GET" | "POST", path: string, data?: unknown) =>
    (await api()).fetch(`/v1${path}`, { method, headers: { authorization: `Bearer ${KEY}`, "x-qrati-uid": "other-user" }, data }),
};

export const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

export async function openEvent(page: Page, id: string, tab = "") {
  await page.goto(`/dashboard/events/${id}${tab}`);
  await expect(page.locator("main h2")).toBeVisible();
}

/** The first IN_REVIEW item of an event (each seeded event has one). */
export async function firstInReview(eventId: string) {
  const item = (await fake.state()).content.find((c) => c.eventId === eventId && c.status === "IN_REVIEW");
  if (!item) throw new Error(`No IN_REVIEW content for event ${eventId}`);
  return item;
}
