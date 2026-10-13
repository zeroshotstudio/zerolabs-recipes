import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
const env = Object.fromEntries(
  (await readFile(new URL("../.env", import.meta.url), "utf8"))
    .split("\n")
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);
assert.match(env.COMPOSE_PROJECT_NAME, /test/);
const out = process.env.SCREENSHOT_DIR || "/tmp/agentkit-browser";
await mkdir(out, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  ...(process.env.CHROMIUM_PATH
    ? { executablePath: process.env.CHROMIUM_PATH }
    : {}),
  args: ["--no-sandbox"],
});
const errors = [],
  results = [],
  runId = Date.now().toString(36);
async function audit(page, label) {
  const r = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  results.push({
    label,
    violations: r.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      nodes: v.nodes.map((n) => n.target),
    })),
  });
  assert.equal(
    r.violations.length,
    0,
    `${label}: ${JSON.stringify(results.at(-1).violations)}`,
  );
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    `${label}: horizontal page overflow`,
  );
}
async function login(page) {
  await page.goto(env.PUBLIC_ORIGIN);
  await page.locator("#access-key").fill(env.ADMIN_TOKEN);
  await page.getByRole("button", { name: "Open workspace" }).click();
  await page
    .getByRole("heading", { name: "Your workspace, at a glance." })
    .waitFor();
}
try {
  const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
    }),
    page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("dialog", async (d) => {
    errors.push("Unexpected script dialog: " + d.message());
    await d.dismiss();
  });
  await page.goto(env.PUBLIC_ORIGIN);
  await page.locator("#login:not([hidden])").waitFor();
  await audit(page, "desktop login");
  await page.locator("#access-key").fill("wrong-key");
  await page.getByRole("button", { name: "Open workspace" }).click();
  await page.locator("#login-error").filter({ hasText: "incorrect" }).waitFor();
  await page.locator("#access-key").fill(env.ADMIN_TOKEN);
  await page.getByRole("button", { name: "Open workspace" }).click();
  await page
    .getByRole("heading", { name: "Your workspace, at a glance." })
    .waitFor();
  await audit(page, "desktop overview dark");
  await page.screenshot({
    path: out + "/overview-desktop.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "New task", exact: true }).click();
  await page.locator("#task-kind").selectOption("assistant");
  await page.locator("#task-title").fill("Browser launch checklist " + runId);
  await page
    .locator("#task-prompt")
    .fill("Create a launch checklist from the workspace brief.");
  await audit(page, "new task dialog");
  await page.getByRole("button", { name: "Create task", exact: false }).click();
  await page
    .locator("#detail-live .badge")
    .filter({ hasText: "Completed" })
    .waitFor({ timeout: 30000 });
  await audit(page, "completed task with trace and artifact");
  await page.screenshot({ path: out + "/task-detail.png", fullPage: true });
  const downloadEvent = page.waitForEvent("download");
  await page.locator("#modal-body a[download]").first().click();
  const download = await downloadEvent;
  assert.ok((await download.suggestedFilename()).endsWith(".txt"));
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.locator('[data-nav="tasks"]').click();
  await page.locator("#task-search").fill("Browser launch checklist " + runId);
  await page.locator("#task-count").filter({ hasText: "1 task" }).waitFor();
  await page.locator("#task-filter").selectOption("failed");
  await page.getByRole("heading", { name: "No matching tasks" }).waitFor();
  await page.getByRole("button", { name: "Clear filters" }).click();
  await audit(page, "task search and filters");
  await page.locator('[data-nav="documents"]').click();
  await page.getByRole("button", { name: "Add document", exact: true }).click();
  await page.locator("#doc-title").fill("Browser document <img src=x>");
  await page
    .locator("#doc-content")
    .fill(
      '<script>alert("xss")</script>\nA short brief for acceptance testing.',
    );
  await page.getByRole("button", { name: "Save document" }).click();
  await page
    .getByRole("button", { name: "Browser document <img src=x>", exact: true })
    .click();
  await page.locator(".output").filter({ hasText: "<script>" }).waitFor();
  assert.equal(await page.locator("#modal-body script").count(), 0);
  await audit(page, "document safely displayed");
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page
    .getByRole("button", {
      name: "Delete Browser document <img src=x>",
      exact: true,
    })
    .click();
  await page
    .getByRole("button", { name: "Delete document", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Browser document <img src=x>", exact: true })
    .waitFor({ state: "detached" });
  await page.locator('[data-nav="connections"]').click();
  await page.getByRole("button", { name: "Create token", exact: true }).click();
  await page.locator("#token-name").fill("Browser test client");
  await page
    .locator("#token-form")
    .getByRole("button", { name: "Create token", exact: true })
    .click();
  await page.locator("#new-token").waitFor();
  assert.match(await page.locator("#new-token").inputValue(), /^ak_/);
  await audit(page, "one-time token dialog");
  await page.getByRole("button", { name: "I have saved it" }).click();
  await page
    .locator(".resource-row")
    .filter({ hasText: "Browser test client" })
    .getByRole("button", { name: "Revoke" })
    .click();
  await page.getByRole("button", { name: "Revoke token", exact: true }).click();
  await page.locator('[data-nav="recovery"]').click();
  await page.getByRole("heading", { name: "Recovery", exact: true }).waitFor();
  await audit(page, "recovery");
  await page.locator('[data-nav="settings"]').click();
  await page.getByRole("heading", { name: "Workspace settings" }).waitFor();
  await audit(page, "settings");
  await page.getByRole("button", { name: "Switch color theme" }).click();
  await page.locator('[data-nav="overview"]').click();
  await page
    .getByRole("heading", { name: "Your workspace, at a glance." })
    .waitFor();
  await audit(page, "desktop overview light");
  await page.screenshot({ path: out + "/overview-light.png", fullPage: true });
  await page.keyboard.press("Control+k");
  await page.getByRole("dialog").waitFor();
  await page.keyboard.press("Escape");
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await page.goto(env.PUBLIC_ORIGIN + "/docs");
  await page
    .getByRole("heading", { name: "Agent Kit documentation", exact: true })
    .waitFor();
  await audit(page, "documentation");
  const mobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const phone = await mobile.newPage();
  phone.on("pageerror", (e) => errors.push(e.message));
  await login(phone);
  await audit(phone, "mobile overview");
  await phone.screenshot({
    path: out + "/overview-mobile.png",
    fullPage: true,
  });
  await phone.getByRole("button", { name: "Open navigation" }).click();
  assert.equal(
    await phone
      .getByRole("button", { name: "Open navigation" })
      .getAttribute("aria-expanded"),
    "true",
  );
  await phone.locator('[data-nav="tasks"]').click();
  await phone.locator("#task-search").waitFor();
  assert.equal(
    await phone
      .getByRole("button", { name: "Open navigation" })
      .getAttribute("aria-expanded"),
    "false",
  );
  await audit(phone, "mobile tasks");
  await phone.getByRole("button", { name: "New task", exact: true }).click();
  await phone.locator("#task-kind").selectOption("audit");
  await phone
    .getByRole("button", { name: "Create task", exact: false })
    .click();
  await phone
    .locator("#detail-live .badge")
    .filter({ hasText: "Completed" })
    .waitFor({ timeout: 15000 });
  await audit(phone, "mobile task details");
  await phone.screenshot({ path: out + "/task-mobile.png", fullPage: true });
  await phone.keyboard.press("Escape");
  await phone.setViewportSize({ width: 320, height: 700 });
  await audit(phone, "320px narrow task list");
  await phone.goto(env.PUBLIC_ORIGIN + "/docs");
  await audit(phone, "mobile documentation");
  await page.goto(env.PUBLIC_ORIGIN);
  await page
    .getByRole("heading", { name: "Your workspace, at a glance." })
    .waitFor();
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.locator("#login:not([hidden])").waitFor();
  assert.equal(
    await page.evaluate(() =>
      Object.keys(localStorage).some((k) => /token|key|session/i.test(k)),
    ),
    false,
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS browser task, artifact, document, token, search, theme, keyboard, mobile and logout workflows",
  );
  console.log(`PASS ${results.length} accessibility/overflow checks`);
} finally {
  await writeFile(
    out + "/browser-results.json",
    JSON.stringify({ results, errors }, null, 2),
  );
  await browser.close();
}
