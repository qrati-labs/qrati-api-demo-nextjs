import { test, expect } from "@playwright/test";
import { EVENT, fake, openEvent } from "./helpers";

test.beforeEach(fake.reset);

const tabs = (page: import("@playwright/test").Page) => page.locator("main nav a");

test("CONTEST event: Curate tab and curation links, no reactions", async ({ page }) => {
  await openEvent(page, EVENT.contest);
  await expect(page.getByText("CONTEST", { exact: true })).toBeVisible();
  await expect(tabs(page)).toHaveText(["Gallery", "Upload", "My uploads", "Leaderboard", "Curate"]);
  await expect(page.getByText("3 curated")).toBeVisible();

  await page.locator("main .grid button").first().click();
  const modal = page.locator(".fixed.inset-0");
  await expect(modal.getByText("Check curation eligibility")).toBeVisible();
  await expect(modal.getByRole("link", { name: "Go to curation queue" })).toBeVisible();
  await expect(modal.getByText("Reactions are not enabled for this event.")).toBeVisible();
});

test("REACTION event: the event's own reactions with counts, no Curate", async ({ page }) => {
  await openEvent(page, EVENT.reactions);
  await expect(page.getByText("REACTION", { exact: true })).toBeVisible();
  await expect(tabs(page)).toHaveText(["Gallery", "Upload", "My uploads", "Leaderboard"]);
  await expect(page.getByText("3 curated")).toHaveCount(0);

  await page.locator("main .grid button").first().click();
  const modal = page.locator(".fixed.inset-0");
  for (const emoji of ["👍", "❤️", "😂", "🔥"]) await expect(modal.getByRole("button", { name: new RegExp(`^${emoji}`) })).toBeVisible();
  await expect(modal.getByText("Check curation eligibility")).toHaveCount(0);
});

test("SIMPLE event: neither reactions nor curation", async ({ page }) => {
  await openEvent(page, EVENT.simple);
  await expect(page.getByText("SIMPLE", { exact: true })).toBeVisible();
  await expect(tabs(page)).toHaveText(["Gallery", "Upload", "My uploads", "Leaderboard"]);

  await page.locator("main .grid button").first().click();
  const modal = page.locator(".fixed.inset-0");
  await expect(modal.getByText("Reactions are not enabled for this event.")).toBeVisible();
  await expect(modal.getByText("Check curation eligibility")).toHaveCount(0);
});

test("opening /curate on a non-contest event explains it instead of loading a queue", async ({ page }) => {
  await openEvent(page, EVENT.simple, "/curate");
  await expect(page.getByText(/Rating applies to contest events only/)).toBeVisible();
});
