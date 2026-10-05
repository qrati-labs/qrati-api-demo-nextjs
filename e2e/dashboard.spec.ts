import { test, expect } from "@playwright/test";
import { EVENT, fake } from "./helpers";

test.beforeEach(fake.reset);

test("shows the organization, health and readiness", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page.getByText("Demo Org")).toBeVisible();
  await expect(page.getByText("status: ok · ready: ok")).toBeVisible();
  await expect(page.getByRole("link", { name: "Moderation" })).toHaveAttribute("href", "/dashboard/moderation");
});

test("reports a degraded readiness state without breaking the page", async ({ page }) => {
  await fake.faults({ notReady: true });
  await page.goto("/dashboard");
  await expect(page.getByText("status: ok · ready: degraded")).toBeVisible();
  await expect(page.getByText("Demo Contest")).toBeVisible();
});

test("All events includes events inside folders; a folder pill narrows to its events", async ({ page }) => {
  await page.goto("/dashboard");
  const names = page.locator("a.card h3");
  await expect(names).toHaveText(["Demo Contest", "Demo Reactions", "Demo Simple"]);

  await page.getByRole("button", { name: "Demo Folder" }).click();
  await expect(names).toHaveText(["Demo Reactions"]);

  await page.getByRole("button", { name: "All events" }).click();
  await expect(names).toHaveCount(3);
});

test("searches events and shows an empty state", async ({ page }) => {
  await page.goto("/dashboard");
  const search = page.getByPlaceholder(/Search events/);
  await search.fill("simple");
  await search.press("Enter");
  await expect(page.locator("a.card h3")).toHaveText(["Demo Simple"]);

  await search.fill("zzz-nothing");
  await search.press("Enter");
  await expect(page.getByText("No events found.")).toBeVisible();
});

test("opening an event shows its header and stats", async ({ page }) => {
  await page.goto("/dashboard");
  await page.getByRole("link", { name: /Demo Contest/ }).click();
  await expect(page).toHaveURL(new RegExp(`/dashboard/events/${EVENT.contest}$`));
  await expect(page.getByText("7 views")).toBeVisible();
  await expect(page.getByText("5 uploads")).toBeVisible();
});

test("an unknown event shows the error page", async ({ page }) => {
  await page.goto("/dashboard/events/0000000000000000000000ff");
  await expect(page.getByText("This page could not be found.")).toBeVisible(); // Next's 404 page, rendered for an API 404
});
