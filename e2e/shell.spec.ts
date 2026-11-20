import { expect, test, type Page } from "@playwright/test";

let errors: string[] = [];

const routeCalls: unknown[] = [];

test.beforeEach(async ({ page }) => {
  errors = [];
  routeCalls.length = 0;
  // Tests never call OpenStreetMap or OpenRouteService: tiles are blank and the proxy is faked.
  await page.route("https://tile.openstreetmap.org/**", (r) => r.fulfill({ status: 204 }));
  await page.route("**/api/route", async (r) => {
    const body = r.request().postDataJSON() as { from: number[]; to: number[] };
    routeCalls.push(body);
    await r.fulfill({ json: { path: [body.from, [50.087, 14.415], body.to], distanceMetres: 950, durationSeconds: 780 } });
  });
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
  // Leaflet shrinks markers while it animates a zoom; measure once the map is still.
  await page.waitForFunction(() => !document.querySelector(".leaflet-zoom-anim"));
  // One pass inside the page: a call per control is too slow for WebKit with a full day plan.
  const { overflow, tooSmall } = await page.evaluate(() => {
    const selector = "button, a[href], input, select, textarea, [role=button], [role=slider], [role=switch]";
    const tooSmall = [...document.querySelectorAll<HTMLElement>(selector)]
      // The map credit is an inline text link, which WCAG 2.5.8 exempts from the target size.
      .filter((el) => !el.closest(".leaflet-control-attribution"))
      .filter((el) => {
        const box = el.getBoundingClientRect();
        const visible = box.width > 0 && box.height > 0 && getComputedStyle(el).visibility !== "hidden";
        return visible && (box.width < 44 || box.height < 44);
      })
      .map((el) => el.outerHTML.slice(0, 80));
    return { overflow: document.documentElement.scrollWidth - window.innerWidth, tooSmall };
  });
  expect(overflow).toBeLessThanOrEqual(0);
  expect(tooSmall).toEqual([]);
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

test("clearing the date or a time keeps the plan", async ({ page }) => {
  await onboard(page);
  const summary = page.getByText(/\d+ stops · [\d.]+ km walking/);
  const before = await summary.innerText();
  for (const label of ["Date", "From", "Until"]) await page.getByLabel(label).fill("");
  await expect(summary).toHaveText(before);
  await expectPhoneFriendly(page);
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

test("shows each leg on the map and asks the proxy for a scenic route", async ({ page }) => {
  await onboard(page);
  const map = page.getByRole("region", { name: "Map of today's stops" });
  await expect(map).toBeVisible();
  await expect(map.locator(".stop-marker")).toHaveCount(await page.getByRole("heading", { level: 4 }).count());
  await expect(page.getByRole("link", { name: "OpenStreetMap" })).toBeVisible();
  await expect(page.getByText("13 min · 0.9 km")).toBeVisible();

  await page.getByRole("button", { name: "Next leg" }).click();
  await expect(page.getByText(/^Leg 2: /)).toBeVisible();

  await page.getByRole("slider").fill("1");
  await expect.poll(() => routeCalls.at(-1)).toMatchObject({ scenic: 1, stepFree: false });
  expect(Object.keys(routeCalls.at(-1) as object).sort()).toEqual(["from", "scenic", "stepFree", "to"]);
  await expectPhoneFriendly(page);
});

test("disables the scenic slider for step-free routes", async ({ page }) => {
  await page.getByRole("switch", { name: /step-free/ }).click();
  await onboard(page, ["Art", "Museums"]);
  await expect(page.getByRole("slider")).toBeDisabled();
  await expect.poll(() => routeCalls.at(-1)).toMatchObject({ scenic: 0, stepFree: true });
});

test("adds rest breaks and keeps to the walking limit", async ({ page }) => {
  await page.getByRole("button", { name: "After 10 min walking" }).click();
  await page.getByRole("button", { name: "4 km", exact: true }).click();
  await onboard(page, ["Castles", "Art", "Viewpoints", "History"]);

  await expect(page.getByText(/Rest on the way at (a bench|a café|public toilets) \(10 min\)/).first()).toBeVisible();
  const summary = await page.getByText(/\d+ stops · [\d.]+ km walking/).innerText();
  expect(Number(summary.match(/([\d.]+) km/)![1])).toBeLessThanOrEqual(4);
  await expectPhoneFriendly(page);

  await page.getByRole("button", { name: "Change my interests" }).click();
  await expect(page.getByRole("button", { name: "After 10 min walking" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "4 km", exact: true })).toHaveAttribute("aria-pressed", "true");
});

test("switches the plan to Berlin with the same profile", async ({ page }) => {
  await onboard(page, ["History", "Viewpoints"]);
  await page.getByRole("group", { name: "City" }).getByRole("button", { name: "Berlin" }).click();

  await expect(page.getByRole("heading", { name: "Your day in Berlin" })).toBeVisible();
  await expect(page.getByRole("listitem").filter({ hasText: "Matches: history" }).first()).toBeVisible();
  await expect.poll(() => routeCalls.some((c) => (c as { to: number[] }).to[0]! > 52)).toBe(true);
  await expectPhoneFriendly(page);

  await page.getByRole("button", { name: "Prague" }).click();
  await expect(page.getByRole("heading", { name: "Your day in Prague" })).toBeVisible();
});
