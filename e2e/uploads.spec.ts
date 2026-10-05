import { test, expect } from "@playwright/test";
import { EVENT, PNG, fake, openEvent } from "./helpers";

test.beforeEach(fake.reset);

async function upload(page: import("@playwright/test").Page, caption = "E2E upload") {
  await page.locator('input[type="file"]').setInputFiles({ name: "photo.png", mimeType: "image/png", buffer: PNG });
  await page.getByPlaceholder("Caption (optional)").fill(caption);
  await page.getByRole("button", { name: "Upload" }).click();
}

const mine = async () => (await fake.state()).uploads;

test("uploads a file (create, presigned PUT, complete) and lands on the gallery", async ({ page }) => {
  await openEvent(page, EVENT.simple, "/upload");
  await upload(page);
  await expect(page).toHaveURL(new RegExp(`/dashboard/events/${EVENT.simple}$`));

  const state = await fake.state();
  expect(state.s3Objects).toHaveLength(1);
  expect(state.uploads).toHaveLength(1);
  expect(state.uploads[0]).toMatchObject({ uploadStatus: "PROCESSING_QUEUED" });
  expect(state.uploads[0].clientUploadId).toMatch(/^[0-9a-f-]{36}$/);
});

test("an upload is in review (not public) until it is processed and approved", async ({ page }) => {
  await openEvent(page, EVENT.simple, "/upload");
  await upload(page, "Pending approval");
  await expect(page).toHaveURL(new RegExp(`/dashboard/events/${EVENT.simple}$`));
  await expect(page.locator("main .grid button")).toHaveCount(5); // not public yet

  await page.getByRole("link", { name: "My uploads" }).click();
  await expect(page.locator(".card", { hasText: "Pending approval" }).getByText("IN_REVIEW")).toBeVisible();
  await expect(page.getByText("your uploads: 0 approved, 1 in review, 0 rejected")).toBeVisible();
});

test("a failed storage PUT reports the error and marks the upload failed (not aborted)", async ({ page }) => {
  await fake.faults({ s3Put: true });
  await openEvent(page, EVENT.simple, "/upload");
  await upload(page);
  await expect(page.getByText(/S3 PUT failed with status 403/)).toBeVisible();
  expect((await mine())[0]).toMatchObject({ uploadStatus: "PROCESSING_FAILED" });
});

test("a lost create response is recovered through /uploads/status by clientUploadId", async ({ page }) => {
  await fake.faults({ createResponseLost: true });
  await openEvent(page, EVENT.simple, "/upload");
  await upload(page);
  await expect(page.getByText(/was created \(processing: uploading\) but the response was lost/)).toBeVisible();
  expect(await mine()).toHaveLength(1);
});

test("deleting from My uploads removes the item", async ({ page }) => {
  await openEvent(page, EVENT.simple, "/upload");
  await upload(page, "Delete me");
  await expect(page).toHaveURL(new RegExp(`/dashboard/events/${EVENT.simple}$`));

  await page.getByRole("link", { name: "My uploads" }).click();
  const card = page.locator(".card", { hasText: "Delete me" });
  await expect(card).toBeVisible();
  await card.getByRole("button", { name: "Delete" }).click();
  await expect(card).toHaveCount(0);
  await expect(page.getByText(/haven't uploaded anything here yet/)).toBeVisible();
});

test("My uploads shows each upload's moderation status", async ({ page }) => {
  await openEvent(page, EVENT.simple, "/upload");
  await upload(page, "Status check");
  await expect(page).toHaveURL(new RegExp(`/dashboard/events/${EVENT.simple}$`));
  const id = (await mine())[0].id;
  await fake.process(id);
  await fake.call("PATCH", `/content/${id}/moderation`, { status: "REJECTED" });

  await page.getByRole("link", { name: "My uploads" }).click();
  await expect(page.locator(".card", { hasText: "Status check" }).getByText("REJECTED")).toBeVisible();
});
