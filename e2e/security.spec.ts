import { test, expect } from "@playwright/test";
import { EVENT, KEY, fake } from "./helpers";

test.beforeEach(fake.reset);

test("the secret API key never reaches the browser", async ({ page }) => {
  const seen: string[] = [];
  page.on("response", async (res) => {
    if (res.url().startsWith("http://localhost:3010") || res.url().includes("/_next/")) {
      try {
        seen.push(`${res.url()} ${(await res.text()).slice(0, 200000)}`);
      } catch {
        /* streaming responses (SSE) cannot be read as text */
      }
    }
  });
  page.on("request", (req) => seen.push(`${req.url()} ${JSON.stringify(req.headers())}`));

  for (const path of ["/dashboard", "/dashboard/moderation", `/dashboard/events/${EVENT.reactions}`, `/dashboard/events/${EVENT.contest}/curate`, `/dashboard/events/${EVENT.simple}/upload`]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
  }

  const html = await page.content();
  expect(html).not.toContain(KEY);
  expect(seen.filter((s) => s.includes(KEY))).toEqual([]);
});

test("the stream proxy refuses signed-out callers", async ({ playwright }) => {
  // An explicitly empty storage state: a new request context does not otherwise start signed out.
  const anonymous = await playwright.request.newContext({ baseURL: "http://localhost:3010", storageState: { cookies: [], origins: [] } });
  const res = await anonymous.get(`/api/events/${EVENT.simple}/stream`, { timeout: 5000, maxRedirects: 0 });
  expect(res.status()).toBe(401);
  await anonymous.dispose();
});

test("the stream proxy rejects malformed event ids instead of forwarding them to the API", async ({ request }) => {
  for (const id of ["not-an-id", "..%2Fmoderation%2Fqueue", `${EVENT.simple}%3Fx%3D1`]) {
    const res = await request.get(`/api/events/${id}/stream`, { timeout: 5000, maxRedirects: 0 });
    expect(res.status(), id).toBe(400);
  }
});

test("signed-out callers cannot reach the API through the dashboard routes either", async ({ playwright }) => {
  const anonymous = await playwright.request.newContext({ baseURL: "http://localhost:3010", storageState: { cookies: [], origins: [] } });
  for (const path of ["/dashboard", "/dashboard/moderation", `/dashboard/events/${EVENT.simple}`]) {
    const res = await anonymous.get(path, { maxRedirects: 0 });
    expect(res.status(), path).toBe(307);
    expect(res.headers().location).toContain("/login");
  }
  await anonymous.dispose();
});
