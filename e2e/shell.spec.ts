import { expect, test } from "@playwright/test";

let errors: string[] = [];

test.beforeEach(async ({ page }) => {
  errors = [];
  page.on("pageerror", (err) => errors.push(err.message));
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  await page.goto("/");
});

test.afterEach(() => {
  expect(errors).toEqual([]);
});

test("loads the Prague catalogue", async ({ page }) => {
  await expect(page.getByRole("heading", { name: "Tour Wiz" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Prague" })).toBeVisible();
  await expect(page.getByText(/\d+ places in the catalogue/)).toBeVisible();
});

test("has no horizontal scroll at phone width", async ({ page }) => {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test("every control is at least 44 px tall and wide", async ({ page }) => {
  const controls = page.locator("button, a[href], input, select, textarea, [role=button], [role=slider]");
  for (const control of await controls.all()) {
    if (!(await control.isVisible())) continue;
    const box = await control.boundingBox();
    expect(box, await control.evaluate((el) => el.outerHTML.slice(0, 80))).not.toBeNull();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    expect(box!.width).toBeGreaterThanOrEqual(44);
  }
});
