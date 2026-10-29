import { expect, test } from "@playwright/test";

test("redirects to the default locale and shows sign-up/sign-in links", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/en$/);
  await expect(page.getByRole("link", { name: "Create one" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();
});

test("serves the Russian locale at /ru", async ({ page }) => {
  await page.goto("/ru");
  await expect(page.getByRole("link", { name: "Создать" })).toBeVisible();
});
