import { test, expect } from "@playwright/test";
import { EVENT, fake, openEvent } from "./helpers";

test.beforeEach(fake.reset);

test("reacting increments the count for the clicked reaction", async ({ page }) => {
  await openEvent(page, EVENT.reactions);
  // The newest approved item is first; it has no reactions yet.
  await page.locator("main .grid button").first().click();
  const modal = page.locator(".fixed.inset-0");
  const fire = modal.getByRole("button", { name: /^🔥/ });
  await expect(fire).toHaveText("🔥0");
  await fire.click();
  await expect(fire).toHaveText("🔥1");
  await fire.click();
  await expect(fire).toHaveText("🔥2");
  await expect(modal.locator("p.text-destructive")).toHaveCount(0);
});

test("checks curation eligibility on a contest event", async ({ page }) => {
  await openEvent(page, EVENT.contest);
  await page.locator("main .grid button").first().click();
  await page.locator(".fixed.inset-0").getByText("Check curation eligibility").click();
  await expect(page.locator(".fixed.inset-0").getByText("eligible")).toBeVisible();
});

test("rates content one item at a time, then shows the empty queue; points reach the leaderboard", async ({ page }) => {
  await openEvent(page, EVENT.contest, "/curate");
  await expect(page.getByText("1 of 5 in queue")).toBeVisible();
  await expect(page.getByText(/Creativity/)).toBeVisible();
  await expect(page.getByText(/Composition/)).toBeVisible();
  await expect(page.getByText(/Storytelling/)).toBeVisible();

  for (let i = 1; i <= 5; i++) {
    await expect(page.getByText(`${i} of 5 in queue`)).toBeVisible();
    await page.getByRole("button", { name: "Submit rating" }).click();
    await expect(page.getByText("Submitted.").or(page.getByText(/queue is empty/))).toBeVisible();
  }
  await expect(page.getByText(/Curation queue is empty/)).toBeVisible();

  await page.getByRole("link", { name: "Leaderboard" }).click();
  await expect(page.getByText("Your points: 0 from uploads • 50 from curation")).toBeVisible();
  await expect(page.getByText("1. E2E Tester")).toBeVisible();
  await expect(page.getByText("Your rank: 1 (50)")).toBeVisible();
});

test("there is no way to flag content as inappropriate (the API does not support it)", async ({ page }) => {
  await openEvent(page, EVENT.contest, "/curate");
  await expect(page.getByText("1 of 5 in queue")).toBeVisible();
  await expect(page.getByLabel("Flag as inappropriate")).toHaveCount(0);
});

test("the leaderboard says No data when nobody has points", async ({ page }) => {
  await openEvent(page, EVENT.contest, "/leaderboard");
  await expect(page.getByText("No data.")).toHaveCount(2);
});
