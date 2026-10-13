// Uses the kit's locked Playwright/axe dependencies; no account or provider needed.
// From the repository root: node marketing/agent-kit/tests/browser.mjs
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawn, execFile } from "node:child_process";
import { once } from "node:events";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { createInterface } from "node:readline";

const require = createRequire(
  new URL(
    "../../../kits/self-hosted-agent-kit/tests/package.json",
    import.meta.url,
  ),
);
const { chromium } = require("playwright");
const AxeBuilder = require("@axe-core/playwright").default;
const root = new URL("../", import.meta.url);
const html = await readFile(new URL("index.html", root), "utf8");
const manifest = JSON.parse(
  await readFile(new URL("assets/walkthrough.json", root), "utf8"),
);
const out = process.env.SCREENSHOT_DIR || "/tmp/agentkit-marketing";
await mkdir(out, { recursive: true });

// Exercise the actual range-capable local preview handler on an ephemeral port.
const preview = spawn(
  "python3",
  [
    "-u",
    "-c",
    'import http.server,runpy,sys\nmodule=runpy.run_path(sys.argv[1])\nserver=http.server.ThreadingHTTPServer(("127.0.0.1",0),module["PreviewHandler"])\nprint(server.server_port,flush=True)\nserver.serve_forever()',
    fileURLToPath(new URL("preview.py", root)),
  ],
  { stdio: ["ignore", "pipe", "pipe"] },
);
let previewErrors = "";
preview.stderr.on("data", (chunk) => {
  previewErrors += chunk.toString();
});
const port = await new Promise((resolve, reject) => {
  const lines = createInterface({ input: preview.stdout });
  lines.once("line", (line) => {
    lines.close();
    const parsed = Number(line);
    if (Number.isInteger(parsed) && parsed > 0) resolve(parsed);
    else reject(new Error(`Invalid preview port: ${line}`));
  });
  preview.once("error", reject);
  preview.once("exit", (code) =>
    reject(new Error(`Preview exited (${code}): ${previewErrors}`)),
  );
});
const origin = `http://127.0.0.1:${port}`;
let browser;
const errors = [],
  results = [];
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
try {
  for (const [name, expected] of Object.entries(manifest.assets)) {
    assert.ok(!name.includes("/") && !name.includes(".."));
    const response = await fetch(`${origin}/assets/${name}`);
    assert.equal(response.status, 200);
    const bytes = Buffer.from(await response.arrayBuffer());
    assert.equal(bytes.length, expected.bytes, `${name}: size`);
    assert.equal(sha256(bytes), expected.sha256, `${name}: digest`);
  }
  const movie = await readFile(
    new URL("assets/agent-kit-walkthrough.mp4", root),
  );
  const range = await fetch(`${origin}/assets/agent-kit-walkthrough.mp4`, {
    headers: { Range: "bytes=10-29" },
  });
  assert.equal(range.status, 206);
  assert.equal(
    range.headers.get("content-range"),
    `bytes 10-29/${movie.length}`,
  );
  assert.deepEqual(
    Buffer.from(await range.arrayBuffer()),
    movie.subarray(10, 30),
  );
  const invalidRange = await fetch(
    `${origin}/assets/agent-kit-walkthrough.mp4`,
    { headers: { Range: `bytes=${movie.length}-` } },
  );
  assert.equal(invalidRange.status, 416);
  const { stdout } = await promisify(execFile)("ffprobe", [
    "-v",
    "error",
    "-show_streams",
    "-show_format",
    "-of",
    "json",
    fileURLToPath(new URL("assets/agent-kit-walkthrough.mp4", root)),
  ]);
  const media = JSON.parse(stdout),
    video = media.streams.find((stream) => stream.codec_type === "video");
  assert.equal(video.codec_name, "h264");
  assert.equal(video.pix_fmt, "yuv420p");
  assert.equal(video.width, manifest.width);
  assert.equal(video.height, manifest.height);
  assert.ok(Math.abs(Number(media.format.duration) - manifest.duration) < 0.1);
  assert.equal(
    media.streams.some((stream) => stream.codec_type === "audio"),
    manifest.audio,
  );
  assert.ok(
    movie.indexOf(Buffer.from("moov")) < movie.indexOf(Buffer.from("mdat")),
    "MP4 metadata must precede media for fast-start playback",
  );
  console.log(
    "PASS published media checksums, HTTP ranges, H.264 metadata and fast-start layout",
  );

  browser = await chromium.launch({
    headless: true,
    ...(process.env.CHROMIUM_PATH
      ? { executablePath: process.env.CHROMIUM_PATH }
      : {}),
    args: ["--no-sandbox"],
  });
  async function newPage(options = {}) {
    const context = await browser.newContext(options);
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(error.message));
    return { context, page };
  }
  async function audit(page, label) {
    const report = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    const violations = report.violations.map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      nodes: violation.nodes.map((node) => node.target),
    }));
    results.push({ label, violations });
    assert.deepEqual(violations, [], `${label}: accessibility`);
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
      `${label}: horizontal overflow`,
    );
  }
  async function prepared(page) {
    await page.waitForFunction(() => {
      const video = document.getElementById("walkthrough-video");
      return video.src.startsWith("blob:") && video.readyState >= 1;
    });
  }
  async function playback(page, touch = false) {
    await prepared(page);
    const play = page.getByRole("button", {
      name: "Play the Agent Kit walkthrough",
      exact: true,
    });
    await play.focus();
    await page.keyboard.press("Enter");
    await page.waitForFunction(
      () =>
        !document.getElementById("walkthrough-video").paused &&
        document.getElementById("walkthrough-video").currentTime > 0,
    );
    for (const chapter of await page.locator("[data-chapter]").all()) {
      const target = Number(await chapter.getAttribute("data-chapter"));
      if (touch) await chapter.tap();
      else await chapter.click();
      await page.waitForFunction((time) => {
        const video = document.getElementById("walkthrough-video");
        return !video.seeking && Math.abs(video.currentTime - time) < 1;
      }, target);
      assert.equal(await chapter.getAttribute("aria-current"), "true");
    }
    await page.evaluate(() => {
      document.getElementById("walkthrough-video").textTracks[0].mode =
        "showing";
    });
    await page.waitForFunction(
      () =>
        document.getElementById("walkthrough-video").textTracks[0].cues
          ?.length === 11,
    );
    assert.equal(
      await page.evaluate(
        () =>
          document.getElementById("walkthrough-video").textTracks[0].language,
      ),
      "en",
    );
    await page.evaluate(() => {
      const video = document.getElementById("walkthrough-video");
      video.currentTime = video.duration - 0.1;
    });
    const replay = page.getByRole("button", {
      name: "Replay the Agent Kit walkthrough",
      exact: true,
    });
    await replay.waitFor();
    await replay.focus();
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => {
      const video = document.getElementById("walkthrough-video");
      return !video.paused && video.currentTime < 2;
    });
    await page.evaluate(() =>
      document.getElementById("walkthrough-video").pause(),
    );
  }

  for (const width of [1440, 900, 390, 320]) {
    const mobile = width <= 390;
    const { context, page } = await newPage({
      viewport: { width, height: 1000 },
      isMobile: mobile,
      hasTouch: mobile,
    });
    await page.goto(origin);
    await playback(page, mobile);
    await page.locator("#product > summary").click();
    for (const name of ["overview", "task", "recovery"]) {
      await page.locator(`#tab-${name}`).click();
      await audit(page, `${width}px ${name}`);
    }
    const first = page.locator("#tab-overview");
    await first.focus();
    await page.keyboard.press("End");
    assert.equal(
      await page.locator("#tab-recovery").getAttribute("aria-selected"),
      "true",
    );
    await page.keyboard.press("Home");
    assert.equal(await first.getAttribute("aria-selected"), "true");
    await page.keyboard.press(width <= 760 ? "ArrowRight" : "ArrowDown");
    assert.equal(
      await page.locator("#tab-task").getAttribute("aria-selected"),
      "true",
    );
    if (mobile) {
      await page
        .getByRole("button", { name: "Open navigation", exact: true })
        .tap();
      assert.equal(
        await page.locator("#menu-toggle").getAttribute("aria-expanded"),
        "true",
      );
      await page.locator('#mobile-nav a[href="#faq"]').tap();
      assert.equal(
        await page.locator("#menu-toggle").getAttribute("aria-expanded"),
        "false",
      );
    }
    const faq = page.locator("#faq details").first();
    await faq.locator("summary").focus();
    await page.keyboard.press("Enter");
    assert.equal(await faq.getAttribute("open"), "");
    await page.screenshot({
      path: `${out}/marketing-${width}.png`,
      fullPage: true,
    });
    await context.close();
  }
  console.log(
    `PASS playback, seeking, 11 captions, replay, keyboard/touch controls and ${results.length} accessibility/overflow checks`,
  );

  const noRange = await newPage({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  let fullResponses = 0;
  await noRange.page.route(
    "**/assets/agent-kit-walkthrough.mp4",
    async (route) => {
      fullResponses++;
      await route.fulfill({
        status: 200,
        contentType: "video/mp4",
        body: movie,
      });
    },
  );
  await noRange.page.goto(origin);
  await playback(noRange.page, true);
  assert.ok(fullResponses > 0);
  await noRange.context.close();

  const blocked = await newPage();
  await blocked.page.route("**/assets/agent-kit-walkthrough.mp4", (route) =>
    route.abort(),
  );
  await blocked.page.goto(origin);
  await blocked.page
    .locator("#video-status")
    .filter({ hasText: "Playback is unavailable" })
    .waitFor();
  assert.equal(
    await blocked.page
      .getByRole("link", { name: "Download video", exact: true })
      .count(),
    1,
  );
  await blocked.page.locator(".video-transcript > summary").click();
  assert.equal(await blocked.page.locator(".video-transcript li").count(), 9);
  await blocked.context.close();

  const native = await newPage({
    javaScriptEnabled: false,
    viewport: { width: 390, height: 844 },
  });
  await native.page.goto(origin);
  assert.equal(
    await native.page.locator("#walkthrough-video").getAttribute("controls"),
    "",
  );
  assert.equal(await native.page.locator("#walkthrough-play").isHidden(), true);
  await native.page.locator(".video-transcript > summary").focus();
  await native.page.keyboard.press("Enter");
  assert.equal(
    await native.page.locator(".video-transcript").getAttribute("open"),
    "",
  );
  await native.context.close();
  console.log(
    "PASS hosts without Range support, blocked media and no-JavaScript fallbacks",
  );

  for (const checkoutUrl of [
    "https://checkout.example.com/agent-kit?plan=single",
    "http://checkout.example.com",
    "https://user:pass@checkout.example.com",
    "javascript:alert(1)",
    "invalid-url",
  ]) {
    const configured = await newPage();
    await configured.page.route(`${origin}/`, (route) =>
      route.fulfill({
        contentType: "text/html",
        body: html
          .replace(
            'checkoutUrl: ""',
            `checkoutUrl: ${JSON.stringify(checkoutUrl)}`,
          )
          .replace('priceLabel: ""', 'priceLabel: "$49 one-time"'),
      }),
    );
    await configured.page.goto(origin);
    const accepted =
      checkoutUrl === "https://checkout.example.com/agent-kit?plan=single";
    for (const link of await configured.page
      .locator("[data-sales-link]")
      .all()) {
      if (accepted) {
        assert.equal(await link.getAttribute("href"), checkoutUrl);
        assert.equal(
          await link.locator("[data-sales-label]").textContent(),
          "Get Agent Kit",
        );
      } else
        assert.match(
          await link.getAttribute("href"),
          /^https:\/\/github\.com\/zeroshotstudio\/zerolabs-recipes\//,
        );
    }
    assert.equal(
      await configured.page.locator("#sales-price").isVisible(),
      accepted,
    );
    await configured.context.close();
  }

  const downloads = await newPage();
  await downloads.page.goto(origin);
  for (const [label, name] of [
    ["Download video", "agent-kit-walkthrough.mp4"],
    ["Download GIF teaser", "agent-kit-teaser.gif"],
  ]) {
    const event = downloads.page.waitForEvent("download");
    await downloads.page
      .getByRole("link", { name: label, exact: true })
      .click();
    const download = await event;
    assert.equal(download.suggestedFilename(), name);
    assert.equal(
      sha256(await readFile(await download.path())),
      manifest.assets[name].sha256,
    );
  }
  await downloads.context.close();
  assert.deepEqual(errors, []);
  console.log(
    "PASS valid/invalid HTTPS checkout configuration, MP4/GIF downloads and zero page errors",
  );
} finally {
  await writeFile(
    `${out}/browser-results.json`,
    JSON.stringify({ results, errors }, null, 2),
  );
  if (browser) await browser.close();
  if (preview.exitCode === null) {
    preview.kill("SIGTERM");
    await once(preview, "exit");
  }
}
