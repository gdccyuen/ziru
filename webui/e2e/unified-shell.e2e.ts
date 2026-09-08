import { expect, test, type Page } from "@playwright/test";

async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.fill("#email", email);
  await page.fill("#password", password);
  await page.getByRole("button", { name: /Sign in/ }).click();
  await page.waitForURL("**/chat", { timeout: 30_000 });
}

async function signOut(page: Page) {
  await page.click('[aria-label="Account menu"]');
  await page.getByRole("menuitem", { name: /Sign out/ }).click();
  await page.waitForURL("**/login", { timeout: 15_000 });
}

async function tabLabels(page: Page): Promise<string[]> {
  const labels = await page.locator("ul.nav-pills .nav-link").allTextContents();
  return labels.map((l) => l.trim());
}

test("admin sees all five tabs, identity and skin switcher", async ({ page }) => {
  await login(page, "admin@ziru.local", "Ziru@test123");

  await expect(page.locator("ul.nav-pills .nav-link")).toHaveCount(5);
  expect(await tabLabels(page)).toEqual([
    "Query",
    "Document",
    "Admin",
    "Attributes",
    "Jobs",
  ]);
  await expect(page.getByLabel("Switch skin")).toBeVisible();
  await expect(page.getByLabel("Toggle theme")).toBeVisible();
  await expect(page.locator("nav")).toContainText("admin@ziru.local");
  await expect(page.locator("nav")).toContainText("Administrator");

  await signOut(page);
});

test("user only sees the Query tab", async ({ page }) => {
  await login(page, "u@ziru.local", "Ziru@test123");

  await expect(page.locator("ul.nav-pills .nav-link")).toHaveCount(1);
  expect(await tabLabels(page)).toEqual(["Query"]);
  await expect(page.locator("nav")).toContainText("u@ziru.local");
  await expect(page.locator("nav")).toContainText("User");

  await signOut(page);
});

test("admin Document tab shows sort control, creator email and File/Tree actions", async ({ page }) => {
  await login(page, "admin@ziru.local", "Ziru@test123");

  await page.goto("/documents");
  await expect(page.getByRole("button", { name: /Sort: Filename/ })).toBeVisible();
  await expect(page.getByText("Tree").first()).toBeVisible();
  await expect(page.getByText("File").first()).toBeVisible();
  await expect(
    page.locator(".list-group-item").first().getByText(/@ziru\.local · created/),
  ).toBeVisible();

  await signOut(page);
});
