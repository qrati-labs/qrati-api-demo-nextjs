import { test, expect } from "@playwright/test";
import { EVENT, fake } from "./helpers";

test.beforeEach(fake.reset);

const cards = (page: import("@playwright/test").Page) => page.locator("main .card");

test("lists the review queue, oldest first, across the organization", async ({ page }) => {
  await page.goto("/dashboard/moderation");
  await expect(cards(page)).toHaveCount(3); // one IN_REVIEW item per seeded event
  await expect(cards(page).first().getByText("River bank at low tide")).toBeVisible();
  await expect(cards(page).first().getByText("AI analysis: COMPLETE")).toBeVisible();
});

test("approves an item; it leaves the queue and goes live in the gallery", async ({ page }) => {
  await page.goto("/dashboard/moderation");
  await cards(page).first().getByRole("button", { name: "Approve" }).click();
  await expect(page.getByText(/^Approved /)).toBeVisible();
  await expect(cards(page)).toHaveCount(2);

  const state = await fake.state();
  expect(state.content.filter((c) => c.status === "APPROVED" && c.decidedBy === "API")).toHaveLength(1);
});

test("rejects an item with a reason, recorded server-side", async ({ page }) => {
  await page.goto("/dashboard/moderation");
  await cards(page).first().getByPlaceholder("Reason (optional)").fill("off-topic");
  await cards(page).first().getByRole("button", { name: "Reject" }).click();
  await expect(page.getByText(/^Rejected /)).toBeVisible();

  const rejected = (await fake.state()).content.find((c) => c.status === "REJECTED");
  expect(rejected).toMatchObject({ reason: "off-topic", decidedBy: "API" });
});

test("pages the queue with Load more (10 per page)", async ({ page }) => {
  await fake.bulk({ eventId: EVENT.simple, count: 12, status: "IN_REVIEW" });
  await page.goto("/dashboard/moderation");
  await expect(cards(page)).toHaveCount(10);
  await page.getByRole("button", { name: "Load more" }).click();
  await expect(cards(page)).toHaveCount(15);
  await expect(page.getByRole("button", { name: "Load more" })).toHaveCount(0);
});

test("filters by upload metadata, and says so when nothing matches", async ({ page }) => {
  await fake.bulk({ eventId: EVENT.simple, count: 6, status: "IN_REVIEW", metadataBy: { first: 4, a: "b-7", b: "b-9" } });
  await page.goto("/dashboard/moderation");
  const filter = page.getByLabel("Filter by upload metadata");

  await filter.fill('{"businessId":"b-7"}');
  await page.getByRole("button", { name: "Filter" }).click();
  await expect(cards(page)).toHaveCount(4);

  await filter.fill('{"businessId":"b-9"}');
  await page.getByRole("button", { name: "Filter" }).click();
  await expect(cards(page)).toHaveCount(2);

  await filter.fill('{"businessId":"nope"}');
  await page.getByRole("button", { name: "Filter" }).click();
  await expect(page.getByText("Nothing waiting for review.")).toBeVisible();
});

test("invalid metadata JSON shows the API's validation message", async ({ page }) => {
  await page.goto("/dashboard/moderation");
  await page.getByLabel("Filter by upload metadata").fill("not json");
  await page.getByRole("button", { name: "Filter" }).click();
  await expect(page.getByText(/metadata must be a JSON object of primitive key-values/)).toBeVisible();
});

test("a concurrent decision (409 conflict) shows the problem code and keeps the item", async ({ page }) => {
  await page.goto("/dashboard/moderation");
  await fake.faults({ conflictNext: true });
  await cards(page).first().getByRole("button", { name: "Approve" }).click();
  await expect(page.getByText(/moderated concurrently; retry \(conflict\)/)).toBeVisible();
  await expect(cards(page)).toHaveCount(3);
});

test("an unprocessed upload is not in the queue, and deciding on it is refused with content_not_ready", async ({ page }) => {
  // Create an upload (not processed yet) through the app, then try to decide it via the API.
  await page.goto(`/dashboard/events/${EVENT.simple}/upload`);
  await page.locator('input[type="file"]').setInputFiles({ name: "p.png", mimeType: "image/png", buffer: Buffer.from("x") });
  await page.getByRole("button", { name: "Upload" }).click();
  await expect(page).toHaveURL(new RegExp(`/dashboard/events/${EVENT.simple}$`));

  await page.goto("/dashboard/moderation");
  await expect(cards(page)).toHaveCount(3); // the new upload is not listed
  const uploaded = (await fake.state()).uploads[0].id;
  const res = await fake.call("PATCH", `/content/${uploaded}/moderation`, { status: "APPROVED" });
  expect(res.status()).toBe(409);
  expect((await res.json()).code).toBe("content_not_ready");

  await fake.process(uploaded);
  await page.reload();
  await expect(cards(page)).toHaveCount(4);
});
