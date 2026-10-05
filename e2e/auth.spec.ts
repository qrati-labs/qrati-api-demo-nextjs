import { test, expect } from "@playwright/test";

test.use({ storageState: { cookies: [], origins: [] } });

test("signed-out visitors are redirected to the login page", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { name: "Qrati API Demo" })).toBeVisible();
});

test("a visitor can sign up, reach the dashboard and sign out", async ({ page }) => {
  const email = `signup-${Date.now()}@example.com`;
  await page.goto("/login");
  await page.getByRole("button", { name: /need an account/i }).click();
  await page.getByPlaceholder("Name").fill("New Visitor");
  await page.getByPlaceholder("Email").fill(email);
  await page.getByPlaceholder("Password").fill("Passw0rd!Passw0rd");
  await page.getByRole("button", { name: "Sign up" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByText(email)).toBeVisible();

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login$/);
});

test("a wrong password shows an error and stays on the login page", async ({ page }) => {
  await page.goto("/login");
  await page.getByPlaceholder("Email").fill("e2e@example.com");
  await page.getByPlaceholder("Password").fill("not-the-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.locator("p.text-destructive")).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);
});
