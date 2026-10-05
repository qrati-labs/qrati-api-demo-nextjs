import { test, expect } from "@playwright/test";
import { EVENT, fake, firstInReview, openEvent } from "./helpers";

test.beforeEach(fake.reset);

test("lists approved content only, with a matching count", async ({ page }) => {
  await openEvent(page, EVENT.simple);
  await expect(page.locator("main .grid button")).toHaveCount(5); // the sixth item is IN_REVIEW
  await expect(page.getByText("5 items")).toBeVisible();
});

test("pages with Load more (24 per page)", async ({ page }) => {
  await fake.bulk({ eventId: EVENT.simple, count: 30 });
  await openEvent(page, EVENT.simple);
  await expect(page.locator("main .grid button")).toHaveCount(24);
  await expect(page.getByText("35 items")).toBeVisible();
  await page.getByRole("button", { name: "Load more" }).click();
  await expect(page.locator("main .grid button")).toHaveCount(35);
  await expect(page.getByRole("button", { name: "Load more" })).toHaveCount(0);
});

test("keyword search replaces the gallery; no results says so; clearing restores it", async ({ page }) => {
  await openEvent(page, EVENT.simple);
  const search = page.getByPlaceholder(/Search content/);
  await search.fill("golden");
  await search.press("Enter");
  await expect(page.locator("main .grid button img").first()).toHaveAttribute("alt", /Golden hour/);

  await search.fill("zzz-nothing");
  await search.press("Enter");
  await expect(page.getByText('No results for "zzz-nothing".')).toBeVisible();

  await search.fill("");
  await search.press("Enter");
  await expect(page.locator("main .grid button")).toHaveCount(5);
});

test("an approval made elsewhere appears live, and a rejection removes the item, without a reload", async ({ page }) => {
  await openEvent(page, EVENT.simple);
  await expect(page.getByText("live")).toBeVisible();
  await page.evaluate(() => ((window as unknown as { __same?: boolean }).__same = true));
  const tiles = page.locator("main .grid button");
  await expect(tiles).toHaveCount(5);

  const inReview = await firstInReview(EVENT.simple);
  await fake.call("PATCH", `/content/${inReview._id}/moderation`, { status: "APPROVED" });
  await expect(tiles).toHaveCount(6);
  await expect(tiles.first().locator("img")).toHaveAttribute("alt", inReview.caption);

  await fake.call("PATCH", `/content/${inReview._id}/moderation`, { status: "REJECTED" });
  await expect(tiles).toHaveCount(5);
  expect(await page.evaluate(() => (window as unknown as { __same?: boolean }).__same)).toBe(true);
});

test("live approvals are not spliced into search results", async ({ page }) => {
  await openEvent(page, EVENT.simple);
  await expect(page.getByText("live")).toBeVisible();
  const search = page.getByPlaceholder(/Search content/);
  await search.fill("golden");
  await search.press("Enter");
  await expect(page.locator("main .grid button")).toHaveCount(3);

  const inReview = await firstInReview(EVENT.simple);
  await fake.call("PATCH", `/content/${inReview._id}/moderation`, { status: "APPROVED" });
  await page.waitForTimeout(500);
  await expect(page.locator("main .grid button")).toHaveCount(3);
});
