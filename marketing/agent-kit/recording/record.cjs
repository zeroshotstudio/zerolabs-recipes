// Capture the real product in a dedicated, disposable demo installation.
// Environment variables: DEMO_ROOT, WALKTHROUGH_OUTPUT, optional CHROMIUM_PATH.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { chromium, request } = require(
  path.resolve(
    __dirname,
    "../../../kits/self-hosted-agent-kit/tests/node_modules/playwright",
  ),
);
const root = process.env.DEMO_ROOT;
const output = process.env.WALKTHROUGH_OUTPUT;
assert(root && output, "DEMO_ROOT and WALKTHROUGH_OUTPUT are required");
const env = Object.fromEntries(
  fs
    .readFileSync(path.join(root, ".env"), "utf8")
    .split("\n")
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);
assert.equal(
  env.COMPOSE_PROJECT_NAME,
  "agentkit-walkthrough-test",
  "Only the disposable recording workspace is allowed",
);
assert.match(env.PUBLIC_ORIGIN, /^http:\/\/localhost:\d+$/);
fs.mkdirSync(output, { recursive: true });
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
(async () => {
  const client = await request.newContext({
    baseURL: env.PUBLIC_ORIGIN,
    extraHTTPHeaders: { Origin: env.PUBLIC_ORIGIN },
  });
  const login = await client.post("/api/auth/login", {
    data: { key: env.ADMIN_TOKEN },
  });
  assert.equal(login.status(), 200);
  const { csrf } = await login.json();
  async function api(url, method = "GET", data) {
    const response = await client.fetch(url, {
      method,
      data,
      headers: { "x-csrf-token": csrf },
    });
    assert.ok(response.ok(), `${method} ${url}: ${response.status()}`);
    return response.json();
  }
  const previous = await api("/api/tasks");
  assert.equal(
    previous.tasks.length,
    0,
    "Use a fresh demo database for each recording",
  );
  await api("/api/documents", "POST", {
    title: "Writing guidelines",
    content:
      "Write clearly. Keep summaries brief. State assumptions and review generated output before use.",
  });
  await api("/api/tokens", "POST", {
    name: "Demo MCP client",
    scopes: ["tasks:read", "tasks:write"],
  }); // Discard the one-time secret; never record it.
  const check = await api("/api/tasks", "POST", {
    kind: "audit",
    title: "Check workspace health",
  });
  for (let i = 0; i < 30; i++) {
    const { task } = await api("/api/tasks/" + check.task.id);
    if (task.status === "completed") break;
    await pause(300);
    if (i === 29) throw new Error("System check did not complete");
  }
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    args: ["--no-sandbox"],
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    recordVideo: { dir: output, size: { width: 1440, height: 900 } },
    storageState: await client.storageState(),
    bypassCSP: true,
    reducedMotion: "reduce",
    locale: "en-GB",
  });
  // CSP bypass is confined to the recording browser so a cursor highlight can be
  // added. The application/server/CSP and all product behaviour remain unmodified.
  const page = await context.newPage();
  const video = page.video();
  const t0 = performance.now();
  const chapters = [];
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(env.PUBLIC_ORIGIN);
  await page
    .getByRole("heading", { name: "Your workspace, at a glance." })
    .waitFor();
  await pause(400);
  let mx = 1140,
    my = 600;
  async function pointer(x, y, pressed = false) {
    await page.evaluate(
      ({ x, y, pressed }) => {
        let cursor = document.getElementById("recording-cursor");
        if (!cursor) {
          cursor = document.createElement("div");
          cursor.id = "recording-cursor";
          cursor.setAttribute("aria-hidden", "true");
          cursor.style.cssText =
            "position:fixed;width:28px;height:34px;pointer-events:none;z-index:2147483647;filter:drop-shadow(0 2px 3px #0008);";
          cursor.innerHTML =
            '<svg width="28" height="34" viewBox="0 0 28 34"><path d="M3 2v25l7-6 5 11 5-3-5-10 10-1Z" fill="#f9f9fc" stroke="#16131f" stroke-width="1.5"/></svg>';
        }
        const parent = document.querySelector("dialog[open]") || document.body;
        if (cursor.parentElement !== parent) parent.appendChild(cursor);
        cursor.style.left = x + "px";
        cursor.style.top = y + "px";
        cursor.style.transform = pressed ? "scale(.84)" : "scale(1)";
        cursor.style.filter = pressed
          ? "drop-shadow(0 0 13px #c9aaff)"
          : "drop-shadow(0 2px 3px #0008)";
      },
      { x, y, pressed },
    );
  }
  async function moveTo(locator) {
    await locator.scrollIntoViewIfNeeded();
    const b = await locator.boundingBox();
    assert(b);
    const x = b.x + b.width * 0.52,
      y = b.y + b.height * 0.55;
    for (let i = 1; i <= 12; i++) {
      await pointer(mx + ((x - mx) * i) / 12, my + ((y - my) * i) / 12);
      await pause(18);
    }
    mx = x;
    my = y;
    await page.mouse.move(x, y);
    await pause(180);
  }
  async function click(locator) {
    await moveTo(locator);
    await pointer(mx, my, true);
    await locator.click();
    await pause(230);
    await pointer(mx, my, false);
  }
  async function type(selector, text, delay = 24) {
    const target = page.locator(selector);
    await click(target);
    await target.pressSequentially(text, { delay });
    await pause(350);
  }
  async function chapter(id, title, caption) {
    chapters.push({
      id,
      title,
      caption,
      time: (performance.now() - t0) / 1000,
    });
    console.log("Recording:", title);
  }
  async function close() {
    await click(page.getByRole("button", { name: "Close", exact: true }));
    await page.locator("#modal").waitFor({ state: "hidden" });
  }
  async function scrollModal(delta) {
    await page
      .locator("#modal")
      .evaluate((el, d) => el.scrollBy({ top: d, behavior: "smooth" }), delta);
    await pause(800);
  }
  await pointer(mx, my);
  await chapter(
    "overview",
    "01 / Your workspace",
    "See tasks, worker health and saved results in one place.",
  );
  await pause(3400);
  await chapter(
    "documents",
    "02 / Add useful context",
    "Add a brief the assistant can read during a task.",
  );
  await click(page.locator('[data-nav="documents"]'));
  await pause(1200);
  await click(page.getByRole("button", { name: "Add document", exact: true }));
  await type("#doc-title", "Launch brief", 45);
  await type(
    "#doc-content",
    "Plan 23 evaluation runs at $19 each. Calculate the total budget and save a short budget note.\n\nThis is an example project for the product walkthrough.",
    14,
  );
  await pause(900);
  await click(page.getByRole("button", { name: "Save document", exact: true }));
  await page
    .getByRole("button", { name: "Launch brief", exact: true })
    .waitFor();
  await pause(1600);
  await chapter(
    "create-task",
    "03 / Give it a task",
    "Describe the work, then submit it to the durable queue.",
  );
  await click(page.getByRole("button", { name: "New task", exact: true }));
  await page.locator("#task-kind").selectOption("assistant");
  await type("#task-title", "Calculate the launch budget", 30);
  await type(
    "#task-prompt",
    "Read the launch brief, calculate the total budget and save launch-budget.txt.",
    22,
  );
  await pause(1100);
  await click(page.getByRole("button", { name: "Create task", exact: false }));
  await chapter(
    "execution",
    "04 / Follow the work",
    "The worker executes document, calculation and artifact tools.",
  );
  await page
    .locator("#detail-live .badge")
    .filter({ hasText: "Running" })
    .waitFor({ timeout: 15000 });
  await pause(2200);
  await scrollModal(440);
  await page
    .locator("#detail-live .badge")
    .filter({ hasText: "Completed" })
    .waitFor({ timeout: 30000 });
  await page.locator("#modal").evaluate((el) => (el.scrollTop = 0));
  await pause(600);
  await chapter(
    "results",
    "05 / Keep the result",
    "Inspect the saved answer and download the text artifact.",
  );
  assert.match(await page.locator("#detail-live").innerText(), /\$437/);
  await pause(3100);
  await page.screenshot({ path: path.join(output, "result-screen.png") });
  const downloadEvent = page.waitForEvent("download");
  await click(page.locator("#modal-body a[download]").first());
  const download = await downloadEvent;
  const artifact = path.join(output, "demo-artifact.txt");
  await download.saveAs(artifact);
  assert.match(fs.readFileSync(artifact, "utf8"), /Total: \$437/);
  await pause(900);
  await scrollModal(600);
  await pause(2800);
  await close();
  await chapter(
    "cancel",
    "06 / Stay in control",
    "Cancel running work. Its history remains available to inspect.",
  );
  await click(page.getByRole("button", { name: "New task", exact: true }));
  await type("#task-title", "Review the project brief", 22);
  await type("#task-prompt", "Wait for the cancellation demonstration.", 20);
  await click(page.getByRole("button", { name: "Create task", exact: false }));
  await page
    .locator("#detail-live .badge")
    .filter({ hasText: "Running" })
    .waitFor({ timeout: 15000 });
  await pause(1200);
  await click(page.getByRole("button", { name: "Cancel task", exact: true }));
  await page
    .locator("#detail-live .badge")
    .filter({ hasText: "Cancelled" })
    .waitFor({ timeout: 15000 });
  await pause(2000);
  await close();
  await chapter(
    "connections",
    "07 / Manage access",
    "Give integrations scoped tokens, then revoke access when needed.",
  );
  await click(page.locator('[data-nav="connections"]'));
  await page
    .getByRole("heading", { name: "Connections", exact: true })
    .waitFor();
  await pause(2200);
  await click(
    page
      .locator(".resource-row")
      .filter({ hasText: "Demo MCP client" })
      .getByRole("button", { name: "Revoke", exact: true }),
  );
  await pause(1300);
  await click(page.getByRole("button", { name: "Revoke token", exact: true }));
  await pause(1600);
  assert.equal((await api("/api/tokens")).tokens.length, 0);
  const dockerEnv = {
    ...process.env,
    DOCKER_HOST: "unix:///var/run/docker.sock",
  };
  for (const key of [
    "DOCKER_CONTEXT",
    "DOCKER_TLS",
    "DOCKER_TLS_VERIFY",
    "DOCKER_CERT_PATH",
  ])
    delete dockerEnv[key];
  const backup = execFileSync("bash", [path.join(root, "scripts/backup.sh")], {
    cwd: root,
    env: dockerEnv,
    encoding: "utf8",
  });
  assert.match(backup, /Verified backup:/);
  await chapter(
    "recovery",
    "08 / Make recovery routine",
    "Review the status of a real, checksum-verified database backup.",
  );
  await click(page.locator('[data-nav="recovery"]'));
  await page.getByRole("heading", { name: "Recovery", exact: true }).waitFor();
  assert.equal((await api("/api/recovery")).status, "verified");
  await pause(5100);
  await click(page.locator('[data-nav="overview"]'));
  await page
    .getByRole("heading", { name: "Your workspace, at a glance." })
    .waitFor();
  await pause(800);
  await chapter(
    "finish",
    "Agent Kit 2.0 / ZeroLabs",
    "Run the workspace on your server. Bring your own OpenAI account.",
  );
  await pause(3400);
  const end = (performance.now() - t0) / 1000;
  assert.deepEqual(errors, []);
  await context.close();
  const raw = await video.path();
  await browser.close();
  await client.dispose();
  const record = {
    raw,
    viewport: { width: 1440, height: 900 },
    chapters,
    end,
    disclosure:
      "Real application in an isolated demo workspace. Model responses and token counts are scripted. Document access, calculation, task execution, artifact download, cancellation, token revocation and local backup were exercised.",
    checks: {
      savedResult: 437,
      artifactDownloaded: true,
      taskCancelled: true,
      tokenRevoked: true,
      backupVerified: true,
      pageErrors: errors,
    },
  };
  fs.writeFileSync(
    path.join(output, "recording.json"),
    JSON.stringify(record, null, 2) + "\n",
  );
  console.log(
    JSON.stringify({
      raw,
      seconds: end,
      chapters: chapters.length,
      checks: record.checks,
    }),
  );
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
