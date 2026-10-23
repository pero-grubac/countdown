// Smoke tests for the main flows: creating timers, recurring rollover, tag
// filtering, calendar export and the JSON backup round-trip.
import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

const KEY = "countdown.timers.v1";
const HOUR = 3600e3;

test.beforeEach(async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.errors = errors;
  // Keep the run offline: the web font is cosmetic.
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (route) =>
    route.fulfill({ status: 200, contentType: "text/css", body: "" }),
  );
});

test.afterEach(async ({ page }) => {
  expect(page.errors, "no JavaScript errors").toEqual([]);
});

// Replace the stored timers and reload so the app starts from them.
async function seed(page, timers) {
  await page.evaluate(
    ([key, list]) => {
      localStorage.setItem(key, JSON.stringify(list));
      localStorage.setItem("countdown.settings.v1", JSON.stringify({ sound: false, confetti: false, notify: false, timeFormat: "24" }));
    },
    [KEY, timers],
  );
  await page.reload();
}

const stored = (page) => page.evaluate((key) => JSON.parse(localStorage.getItem(key) || "[]"), KEY);
async function importFile(page, path) {
  const choosing = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Import timers (JSON)" }).click();
  await (await choosing).setFiles(path);
}

const card = (page, name) => page.locator(".card", { hasText: name });

test("creates a duration countdown", async ({ page }) => {
  await page.goto("./");
  await expect(page).toHaveTitle("Countdown");
  await expect(page.getByRole("heading", { name: "No countdowns yet" })).toBeVisible();

  await page.getByRole("button", { name: "New countdown" }).first().click();
  await page.getByLabel("Name").fill("Tea");
  await page.getByLabel("Minutes").fill("5");
  await page.getByRole("button", { name: "Create countdown" }).click();

  const tea = card(page, "Tea");
  await expect(tea).toBeVisible();
  await expect(tea.locator(".pill")).toHaveText("Active");
  await expect(tea.getByRole("timer")).toHaveAttribute("aria-label", /minute/);
  await expect(page.locator("#filters")).toBeHidden();
  expect((await stored(page))[0]).toMatchObject({ name: "Tea", repeat: "never", tags: [] });
});

test("a recurring countdown rolls over to its next occurrence", async ({ page }) => {
  await page.goto("./");
  await seed(page, []);

  await page.getByRole("button", { name: "New countdown" }).first().click();
  await page.getByLabel("Name").fill("Standup");
  await page.getByLabel("Minutes").fill("1");
  await page.getByLabel("Repeats").selectOption("daily");
  await page.getByRole("button", { name: "Create countdown" }).click();

  const standup = card(page, "Standup");
  await expect(standup.locator(".card__target")).toContainText("Ends today");
  await expect(standup.locator(".card__target")).toContainText("Repeats daily");
  expect((await stored(page))[0]).toMatchObject({ name: "Standup", repeat: "daily" });

  // Bring it to a few seconds before zero and let it run out for real.
  await page.evaluate((key) => {
    const [t] = JSON.parse(localStorage.getItem(key));
    t.targetTime = t.anchor = Date.now() + 2500;
    localStorage.setItem(key, JSON.stringify([t]));
  }, KEY);
  await page.reload();
  const [before] = await stored(page);

  await expect(standup.locator(".card__target")).toContainText("Ends tomorrow", { timeout: 10_000 });
  await expect(standup.locator(".pill")).toHaveText("Active");
  const [after] = await stored(page);
  // One calendar day later (23 to 25 hours across a DST change).
  expect(Math.abs(after.targetTime - before.targetTime - 24 * HOUR)).toBeLessThanOrEqual(HOUR);
  expect(after.createdAt).toBe(before.targetTime);
  expect(after.anchor).toBe(before.targetTime);
});

test("tags filter the grid and the choice is remembered", async ({ page }) => {
  await page.goto("./");
  const now = Date.now();
  await seed(page, [
    { id: "a", name: "Sprint review", targetTime: now + 2 * HOUR, createdAt: now, tags: ["work"] },
    { id: "b", name: "Dentist", targetTime: now + 5 * HOUR, createdAt: now, tags: ["home"] },
    { id: "c", name: "Untagged", targetTime: now + 9 * HOUR, createdAt: now },
  ]);

  const filters = page.getByRole("navigation", { name: "Filter by tag" });
  await expect(filters.getByRole("button")).toHaveText(["All", "home", "work"]);
  await expect(page.locator(".card")).toHaveCount(3);
  await expect(card(page, "Sprint review").locator(".tag")).toHaveText(["work"]);

  await filters.getByRole("button", { name: "work" }).click();
  await expect(page.locator(".card")).toHaveCount(1);
  await expect(card(page, "Sprint review")).toBeVisible();

  await page.reload();
  await expect(filters.getByRole("button", { name: "work" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".card")).toHaveCount(1);

  await filters.getByRole("button", { name: "All" }).click();
  await expect(page.locator(".card")).toHaveCount(3);
});

test("exports a countdown to a calendar file", async ({ page }) => {
  await page.goto("./");
  const now = Date.now();
  await seed(page, [
    { id: "w", name: "Weekly sync", targetTime: now + 3 * HOUR, createdAt: now, repeat: "weekly", tags: ["work"] },
  ]);

  const downloading = page.waitForEvent("download");
  await card(page, "Weekly sync").getByRole("button", { name: /to calendar/ }).click();
  const file = await downloading;
  expect(file.suggestedFilename()).toBe("weekly-sync.ics");
  const text = await readFile(await file.path(), "utf8");
  expect(text.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
  expect(text).toContain("\r\nUID:w@countdown\r\n");
  expect(text).toContain("\r\nRRULE:FREQ=WEEKLY\r\n");
  expect(text).toContain("\r\nSUMMARY:Weekly sync\r\n");
  expect(text).toMatch(/\r\nDTSTART:\d{8}T\d{6}Z\r\n/);
});

test("JSON backup round-trips through export and import", async ({ page }) => {
  await page.goto("./");
  const now = Date.now();
  await seed(page, [
    { id: "x", name: "Flight", targetTime: now + 30 * HOUR, createdAt: now, tags: ["travel"] },
    { id: "y", name: "Rent", targetTime: now + 60 * HOUR, createdAt: now, repeat: "monthly" },
  ]);

  await page.getByRole("button", { name: "Settings" }).click();
  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export timers (JSON)" }).click();
  const file = await downloading;
  expect(file.suggestedFilename()).toMatch(/^countdown-backup-\d{4}-\d{2}-\d{2}\.json$/);
  const path = await file.path();
  const backup = JSON.parse(await readFile(path, "utf8"));
  expect(backup.timers.map((t) => t.name)).toEqual(["Flight", "Rent"]);

  // Start over with nothing, then bring the timers back from the file.
  await seed(page, []);
  await expect(page.getByRole("heading", { name: "No countdowns yet" })).toBeVisible();
  await page.getByRole("button", { name: "Settings" }).click();
  await importFile(page, path);
  await expect(page.locator("#toast")).toHaveText("Imported: 2 added, 0 updated.");
  await page.keyboard.press("Escape");
  await expect(page.locator(".card")).toHaveCount(2);
  await expect(card(page, "Rent").locator(".card__target")).toContainText("Repeats monthly");

  // Importing the same file again updates instead of duplicating.
  await page.getByRole("button", { name: "Settings" }).click();
  await importFile(page, path);
  await expect(page.locator("#toast")).toHaveText("Imported: 0 added, 2 updated.");
  expect(await stored(page)).toHaveLength(2);
});
