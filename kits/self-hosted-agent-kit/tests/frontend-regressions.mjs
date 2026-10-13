// Isolated browser regressions: no database, Docker services or provider calls.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { chromium } from "playwright";

const assets = new URL("../app/public/", import.meta.url);
const server = createServer(async (request, response) => {
  try {
    const path = new URL(request.url, "http://localhost").pathname;
    if (!["/", "/app.js", "/style.css", "/favicon.svg"].includes(path)) {
      response.writeHead(404).end();
      return;
    }
    response.setHeader(
      "content-type",
      path.endsWith(".js")
        ? "text/javascript"
        : path.endsWith(".css")
          ? "text/css"
          : path.endsWith(".svg")
            ? "image/svg+xml"
            : "text/html",
    );
    response.end(
      await readFile(new URL(path.slice(1) || "index.html", assets)),
    );
  } catch (error) {
    response.writeHead(500).end(error.message);
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({
  headless: true,
  ...(process.env.CHROMIUM_PATH
    ? { executablePath: process.env.CHROMIUM_PATH }
    : {}),
  args: ["--no-sandbox"],
});
const errors = [];
const pendingResponses = new Map();
let pendingDetail = null,
  detailRequests = 0;
function delayNextDetail(taskOverride) {
  let seen, release;
  const requested = new Promise((resolve) => (seen = resolve));
  const released = new Promise((resolve) => (release = resolve));
  pendingDetail = { seen, released, taskOverride };
  return { requested, release };
}
function delayResponse(method, path, error) {
  let seen, release;
  const requested = new Promise((resolve) => (seen = resolve));
  const released = new Promise((resolve) => (release = resolve));
  pendingResponses.set(`${method} ${path}`, { seen, released, error });
  return { requested, release };
}
async function waitForDelayedDetail(delayed) {
  let timer;
  try {
    await Promise.race([
      delayed.requested,
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("No task-detail poll within 10 seconds")),
          10000,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
const task = {
  id: "00000000-0000-4000-8000-000000000001",
  title: "Interrupted task",
  kind: "assistant",
  status: "failed",
  created_at: "2026-01-01T00:00:00Z",
  prompt: "A prior task",
  error: "Interrupted; review before retrying.",
};
const documentFixture = {
  id: "00000000-0000-4000-8000-000000000002",
  title: "Delayed document",
  bytes: 20,
  content: "Read this document",
  created_at: task.created_at,
};
const tokenFixture = {
  id: "00000000-0000-4000-8000-000000000003",
  name: "Delayed token",
  scopes: ["tasks:read"],
};
try {
  const page = await browser.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();
    const held = pendingResponses.get(`${method} ${path}`);
    if (held) {
      pendingResponses.delete(`${method} ${path}`);
      held.seen();
      await held.released;
      if (held.error) {
        await route.fulfill({ status: 500, json: { error: held.error } });
        return;
      }
    }
    let data;
    if (path === "/api/auth/session")
      data = { csrf: "fixture", version: "2.0.0" };
    else if (path === "/api/overview")
      data = {
        counts: { failed: 1 },
        recent: [task],
        workers: [],
        documents: 0,
        backup: { status: "unknown" },
        measured_at: new Date().toISOString(),
      };
    else if (path === "/api/tasks")
      data = method === "POST" ? { task } : { tasks: [task], total: 1 };
    else if (path === `/api/tasks/${task.id}/retry`) data = { task };
    else if (path === `/api/tasks/${task.id}`) {
      detailRequests++;
      const pending = pendingDetail;
      pendingDetail = null;
      if (pending) {
        pending.seen();
        await pending.released;
      }
      data = { task: pending?.taskOverride || task, artifacts: [] };
    } else if (path.endsWith("/events")) data = { events: [] };
    else if (path === "/api/documents")
      data = method === "POST" ? {} : { documents: [documentFixture] };
    else if (path === `/api/documents/${documentFixture.id}`)
      data = method === "DELETE" ? {} : documentFixture;
    else if (path === "/api/tokens")
      data =
        method === "POST"
          ? { ...tokenFixture, token: "ak_example_placeholder" }
          : { tokens: [tokenFixture] };
    else if (path === `/api/tokens/${tokenFixture.id}`) data = {};
    else if (path === "/api/audit") data = { entries: [] };
    else throw new Error(`Unexpected request: ${path}`);
    await route.fulfill({ json: data });
  });
  await page.goto(origin);
  await page
    .getByRole("heading", { name: "Your workspace, at a glance." })
    .waitFor();
  async function openDetail() {
    await page.getByRole("button", { name: task.title, exact: true }).click();
    await page.getByRole("button", { name: "Review and retry" }).waitFor();
  }
  async function stableDialog(title, focusSelector, count) {
    await page.locator(focusSelector).focus();
    // Observe two real polling cycles, including any response already in flight.
    await page.waitForTimeout(6300);
    assert.equal(await page.locator("#modal-title").textContent(), title);
    assert.equal(
      await page
        .locator(focusSelector)
        .evaluate((el) => el === document.activeElement),
      true,
    );
    assert.equal(
      detailRequests,
      count,
      "Non-detail dialogs must not request task refreshes",
    );
  }

  await openDetail();
  let delayed = delayNextDetail();
  await waitForDelayedDetail(delayed);
  const retryRequests = detailRequests;
  await page.getByRole("button", { name: "Review and retry" }).click();
  delayed.release();
  await stableDialog(
    "Retry this task?",
    '[data-confirm="retry"]',
    retryRequests,
  );
  await page.getByRole("button", { name: "Keep as is" }).click();
  console.log(
    "PASS retry confirmation and focus survive polling and an in-flight detail response",
  );

  await openDetail();
  delayed = delayNextDetail();
  await waitForDelayedDetail(delayed);
  const commandRequests = detailRequests;
  await page.keyboard.press("Control+k");
  delayed.release();
  await stableDialog("Go to…", '[data-go="documents"]', commandRequests);
  await page.keyboard.press("Escape");
  console.log(
    "PASS command palette and focus survive polling and an in-flight detail response",
  );

  // A close/reopen of the same task must also invalidate the earlier response.
  await openDetail();
  delayed = delayNextDetail({
    ...task,
    title: "Stale task response",
    error: "Earlier stale result",
  });
  await waitForDelayedDetail(delayed);
  await page.keyboard.press("Escape");
  await openDetail();
  const newDialog = await page.locator("#modal-body").innerHTML();
  await page.locator("[data-retry-task]").focus();
  delayed.release();
  await page.waitForTimeout(100);
  assert.equal(await page.locator("#modal-title").textContent(), task.title);
  assert.equal(await page.locator("#modal-body").innerHTML(), newDialog);
  assert.equal(
    await page
      .locator("[data-retry-task]")
      .evaluate((el) => el === document.activeElement),
    true,
  );
  await page.keyboard.press("Escape");
  console.log(
    "PASS reopening the same task rejects detail responses from an earlier dialog",
  );

  const headings = {
    overview: "Your workspace, at a glance.",
    tasks: "Tasks",
    documents: "Documents",
    connections: "Connections",
    recovery: "Recovery",
    settings: "Workspace settings",
  };
  for (const [route, heading] of Object.entries(headings)) {
    await page.locator(`[data-nav="${route}"]`).click();
    await page.locator("#page h1").filter({ hasText: heading }).waitFor();
    const hash = new URL(page.url()).hash;
    await page.getByRole("link", { name: "Skip to content" }).focus();
    await page.keyboard.press("Enter");
    assert.equal(new URL(page.url()).hash, hash);
    assert.equal(await page.locator("#page h1").textContent(), heading);
    assert.equal(
      await page
        .locator("#main")
        .evaluate((el) => el === document.activeElement),
      true,
    );
  }
  console.log(
    "PASS keyboard skip link preserves all six routes and focuses main content",
  );

  async function go(route) {
    if (await page.locator("#modal").evaluate((el) => el.open)) {
      await page.keyboard.press("Escape");
      await page.getByRole("dialog").waitFor({ state: "hidden" });
    }
    await page.locator(`[data-nav="${route}"]`).click();
    await page
      .locator("#page h1")
      .filter({ hasText: headings[route] })
      .waitFor();
  }
  async function newDraft(title) {
    await page.keyboard.press("Control+k");
    await page
      .locator("#modal-body")
      .getByRole("button", { name: "New task", exact: false })
      .click();
    await page.locator("#task-title").fill(title);
  }
  async function expectDraft(title) {
    assert.equal(await page.locator("#modal-title").textContent(), "New task");
    assert.equal(await page.locator("#task-title").inputValue(), title);
    assert.equal(
      await page
        .locator("#task-title")
        .evaluate((el) => el === document.activeElement),
      true,
    );
  }
  async function releaseAndToast(delayed, text) {
    await page.locator("#toast").evaluate((el) => (el.textContent = ""));
    delayed.release();
    await page.locator("#toast").filter({ hasText: text }).waitFor();
  }

  // Delayed document reads must honor newer dialogs and navigation.
  await go("documents");
  let response = delayResponse("GET", `/api/documents/${documentFixture.id}`);
  await page
    .getByRole("button", { name: documentFixture.title, exact: true })
    .click();
  await waitForDelayedDetail(response);
  await page.keyboard.press("Control+k");
  await page.locator('[data-go="tasks"]').focus();
  response.release();
  await page.waitForTimeout(100);
  assert.equal(await page.locator("#modal-title").textContent(), "Go to…");
  assert.equal(
    await page
      .locator('[data-go="tasks"]')
      .evaluate((el) => el === document.activeElement),
    true,
  );
  await go("documents");
  response = delayResponse("GET", `/api/documents/${documentFixture.id}`);
  await page
    .getByRole("button", { name: documentFixture.title, exact: true })
    .click();
  await waitForDelayedDetail(response);
  await newDraft("Keep this document-read draft");
  response.release();
  await page.waitForTimeout(100);
  await expectDraft("Keep this document-read draft");
  await go("documents");
  response = delayResponse("GET", `/api/documents/${documentFixture.id}`);
  await page
    .getByRole("button", { name: documentFixture.title, exact: true })
    .click();
  await waitForDelayedDetail(response);
  await go("tasks");
  response.release();
  await page.waitForTimeout(100);
  assert.equal(await page.locator("#modal").evaluate((el) => el.open), false);
  assert.equal(await page.locator("#page h1").textContent(), "Tasks");
  console.log(
    "PASS delayed document reads preserve a palette, draft, focus and changed route",
  );

  for (const [route, action, path, success] of [
    [
      "documents",
      "Delete document",
      `/api/documents/${documentFixture.id}`,
      "Document deleted",
    ],
    [
      "connections",
      "Revoke token",
      `/api/tokens/${tokenFixture.id}`,
      "Token revoked",
    ],
  ]) {
    await go(route);
    if (route === "documents")
      await page
        .getByRole("button", {
          name: `Delete ${documentFixture.title}`,
          exact: true,
        })
        .click();
    else
      await page.getByRole("button", { name: "Revoke", exact: true }).click();
    response = delayResponse("DELETE", path);
    await page.getByRole("button", { name: action, exact: true }).click();
    await waitForDelayedDetail(response);
    await page.keyboard.press("Control+k");
    await page.locator('[data-go="tasks"]').click();
    await page.locator("#page h1").filter({ hasText: "Tasks" }).waitFor();
    await releaseAndToast(response, success);
    assert.equal(new URL(page.url()).hash, "#tasks");
    assert.equal(await page.locator("#page h1").textContent(), "Tasks");

    await go(route);
    if (route === "documents")
      await page
        .getByRole("button", {
          name: `Delete ${documentFixture.title}`,
          exact: true,
        })
        .click();
    else
      await page.getByRole("button", { name: "Revoke", exact: true }).click();
    response = delayResponse("DELETE", path, `${action} failed`);
    await page.getByRole("button", { name: action, exact: true }).click();
    await waitForDelayedDetail(response);
    await newDraft(`Keep this ${action} draft`);
    await releaseAndToast(response, `${action} failed`);
    await expectDraft(`Keep this ${action} draft`);
  }
  console.log(
    "PASS document deletion/token revocation preserve changed routes and replacement drafts on failures",
  );

  await go("documents");
  await page.getByRole("button", { name: "Add document", exact: true }).click();
  await page.locator("#doc-title").fill("New document");
  await page.locator("#doc-content").fill("Document body");
  response = delayResponse("POST", "/api/documents");
  await page
    .getByRole("button", { name: "Save document", exact: true })
    .click();
  await waitForDelayedDetail(response);
  await newDraft("Keep this document-save draft");
  await releaseAndToast(response, "Document added");
  await expectDraft("Keep this document-save draft");

  await go("overview");
  await page.getByRole("button", { name: "New task", exact: true }).click();
  response = delayResponse("POST", "/api/tasks");
  await page.getByRole("button", { name: "Create task", exact: false }).click();
  await waitForDelayedDetail(response);
  await newDraft("Keep this task-submit draft");
  await releaseAndToast(response, "Task created");
  await expectDraft("Keep this task-submit draft");

  await go("overview");
  await openDetail();
  await page.getByRole("button", { name: "Review and retry" }).click();
  response = delayResponse("POST", `/api/tasks/${task.id}/retry`);
  await page.getByRole("button", { name: "Create retry", exact: true }).click();
  await waitForDelayedDetail(response);
  await newDraft("Keep this retry draft");
  await releaseAndToast(response, "Retry created");
  await expectDraft("Keep this retry draft");

  await go("overview");
  response = delayResponse("POST", "/api/tasks");
  await page.getByRole("button", { name: "Run check", exact: true }).click();
  await waitForDelayedDetail(response);
  await newDraft("Keep this system-check draft");
  await releaseAndToast(response, "System check created");
  await expectDraft("Keep this system-check draft");
  console.log(
    "PASS document save, task creation, retry and system-check completions preserve newer drafts",
  );

  // A token's secret is shown once, so keep its submitted dialog until the
  // bounded request completes instead of discarding a late successful response.
  await go("connections");
  await page.getByRole("button", { name: "Create token", exact: true }).click();
  await page.locator("#token-name").fill("Pending token");
  response = delayResponse("POST", "/api/tokens");
  await page
    .locator("#token-form")
    .getByRole("button", { name: "Create token", exact: true })
    .click();
  await waitForDelayedDetail(response);
  await page.keyboard.press("Control+k");
  await page.keyboard.press("Escape");
  assert.equal(
    await page.locator("#modal-title").textContent(),
    "Create API token",
  );
  assert.equal(
    await page
      .getByRole("button", { name: "Close dialog", exact: true })
      .isDisabled(),
    true,
  );
  response.release();
  await page.locator("#new-token").waitFor();
  assert.equal(
    await page.locator("#new-token").inputValue(),
    "ak_example_placeholder",
  );
  await page
    .getByRole("button", { name: "I have saved it", exact: true })
    .click();
  await page.getByRole("button", { name: "Create token", exact: true }).click();
  await page.locator("#token-name").fill("Failed pending token");
  response = delayResponse("POST", "/api/tokens", "Token creation failed");
  await page
    .locator("#token-form")
    .getByRole("button", { name: "Create token", exact: true })
    .click();
  await waitForDelayedDetail(response);
  response.release();
  await page
    .locator("#token-form .form-error")
    .filter({ hasText: "Token creation failed" })
    .waitFor();
  assert.equal(
    await page
      .getByRole("button", { name: "Close dialog", exact: true })
      .isDisabled(),
    false,
  );
  await page.keyboard.press("Control+k");
  assert.equal(await page.locator("#modal-title").textContent(), "Go to…");
  console.log(
    "PASS token creation retains its one-time secret and releases dialog controls after failures",
  );
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
