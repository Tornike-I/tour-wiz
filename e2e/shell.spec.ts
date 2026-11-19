import { expect, test, type Page } from "@playwright/test";

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

async function onboard(page: Page, interests = ["Castles", "Art", "Viewpoints"]) {
  for (const name of interests) await page.getByRole("button", { name, exact: true }).click();
  await page.getByRole("button", { name: "Plan my day" }).click();
  await expect(page.getByRole("heading", { name: "Your day in Prague" })).toBeVisible();
}

async function expectPhoneFriendly(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  const controls = page.locator("button, a[href], input, select, textarea, [role=button], [role=slider], [role=switch]");
  for (const control of await controls.all()) {
    if (!(await control.isVisible())) continue;
    const box = await control.boundingBox();
    expect(box, await control.evaluate((el) => el.outerHTML.slice(0, 80))).not.toBeNull();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    expect(box!.width).toBeGreaterThanOrEqual(44);
  }
}

test("onboarding asks for at least one interest", async ({ page }) => {
  await expect(page.getByRole("heading", { name: "What do you like?" })).toBeVisible();
  await page.getByRole("button", { name: "Plan my day" }).click();
  await expect(page.getByRole("alert")).toHaveText("Pick at least one interest.");
  await expectPhoneFriendly(page);
});

test("plans a day with reasons for every stop", async ({ page }) => {
  await onboard(page);
  const stops = page.getByRole("listitem").filter({ has: page.getByRole("heading", { level: 4 }) });
  expect(await stops.count()).toBeGreaterThanOrEqual(3);
  await expect(stops.first()).toContainText("Matches:");
  await expect(page.getByText(/\d+ stops · [\d.]+ km walking · \d+% at quiet times/)).toBeVisible();
  await expectPhoneFriendly(page);
});

test("keeps the profile after a reload and rates a stop", async ({ page }) => {
  await onboard(page);
  const firstStop = (await page.getByRole("heading", { level: 4 }).first().innerText()).replace(/^\d+\.\s*/, "");
  await page.getByRole("button", { name: `Rate ${firstStop} 5 of 5` }).click();
  await expect(page.getByText("You rated it 5 of 5")).toBeVisible();
  await expect(page.getByRole("button", { name: "Re-plan with my new ratings" })).toBeVisible();

  await page.reload();
  await expect(page.getByRole("heading", { name: "Your day in Prague" })).toBeVisible();
  await expect(page.getByText("You rated it 5 of 5")).toBeVisible();
});

test("step-free mode only plans places without steps", async ({ page }) => {
  await page.getByRole("switch", { name: /step-free/ }).click();
  await onboard(page, ["Art", "Museums"]);
  await expect(page.getByRole("heading", { name: /Šternberk Palace/ })).toHaveCount(0);
});

test("changes interests and deletes the data", async ({ page }) => {
  await onboard(page);
  await page.getByRole("button", { name: "Change my interests" }).click();
  await expect(page.getByRole("heading", { name: "Change what you like" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Castles", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Tea houses" }).click();
  await page.getByRole("button", { name: "Save and re-plan" }).click();
  await expect(page.getByRole("heading", { name: "Your day in Prague" })).toBeVisible();

  await page.getByRole("button", { name: "Delete my data from this phone" }).click();
  await page.getByRole("button", { name: "Yes, delete" }).click();
  await expect(page.getByRole("heading", { name: "What do you like?" })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("tourwiz.profile"))).toBeNull();
});
