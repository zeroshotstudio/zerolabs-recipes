const $ = (s) => document.querySelector(s);
const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const paths = {
  overview: "M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z",
  tasks: "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01",
  document: "M14 2H5v20h14V7zM14 2v5h5M8 12h8M8 16h6",
  connect: "M9 7 6 4 2 8l3 3M15 17l3 3 4-4-3-3M7 17l10-10M5 13l6 6M13 5l6 6",
  shield: "M12 2 3 6v6c0 5 9 10 9 10s9-5 9-10V6zM8 12l3 3 5-6",
  settings:
    "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2",
  book: "M12 5C8 2 3 3 2 4v16c4-2 7-1 10 1 3-2 6-3 10-1V4c-1-1-6-2-10 1zM12 5v16",
  search: "M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14M15 15l6 6",
  plus: "M12 5v14M5 12h14",
  close: "M6 6l12 12M6 18 18 6",
  menu: "M4 6h16M4 12h16M4 18h16",
  refresh:
    "M20 7a9 9 0 0 0-15-2L2 8M2 3v5h5M4 17a9 9 0 0 0 15 2l3-3M22 21v-5h-5",
  theme: "M21 13a9 9 0 0 1-10-10 9 9 0 1 0 10 10z",
  logout: "M9 4H3v16h6M9 12h12M17 8l4 4-4 4",
  check: "M5 12l4 4L19 6",
  arrow: "M5 12h14M14 7l5 5-5 5",
  info: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20M12 11v6M12 7h.01",
  worker: "M4 5h16v14H4zM8 9h8M8 13h4M8 2v3M16 2v3M8 19v3M16 19v3",
  clock: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20M12 6v6l4 2",
  copy: "M8 8h13v13H8zM16 8V3H3v13h5",
  download: "M12 3v12M7 10l5 5 5-5M4 16v5h16v-5",
  trash: "M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7",
};
const icon = (name) =>
  `<svg class="icon" aria-hidden="true" viewBox="0 0 24 24"><path d="${paths[name] || paths.info}"/></svg>`;
function icons(root = document) {
  root.querySelectorAll("[data-icon]").forEach((el) => {
    el.outerHTML = icon(el.dataset.icon);
  });
}
icons();
const names = {
  overview: "Overview",
  tasks: "Tasks",
  documents: "Documents",
  connections: "Connections",
  recovery: "Recovery",
  settings: "Settings",
};
let session = null,
  overview = null,
  page = "overview",
  generation = 0,
  taskId = null,
  toastTimer,
  searchTimer,
  polling = false;
let filter = "",
  search = "",
  offset = 0,
  taskListRequest = 0;
const modal = $("#modal");
try {
  document.documentElement.dataset.theme =
    localStorage.getItem("agentkit-theme") || "dark";
} catch {}
const time = (value) =>
  value
    ? new Date(value).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";
const ago = (value) => {
  const seconds = Math.max(
    0,
    Math.floor((Date.now() - Date.parse(value)) / 1000),
  );
  return !Number.isFinite(seconds)
    ? "Not recorded"
    : seconds < 60
      ? "Just now"
      : seconds < 3600
        ? `${Math.floor(seconds / 60)}m ago`
        : seconds < 86400
          ? `${Math.floor(seconds / 3600)}h ago`
          : `${Math.floor(seconds / 86400)}d ago`;
};
const badge = (status) =>
  `<span class="badge status-${esc(status)}">${esc(status[0]?.toUpperCase() + status.slice(1))}</span>`;
function toast(message) {
  $("#toast").textContent = message;
  $("#toast").hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    $("#toast").hidden = true;
  }, 4500);
}
async function api(path, method = "GET", data, extra = {}) {
  const response = await fetch(path, {
    method,
    credentials: "same-origin",
    headers: {
      ...(data !== undefined ? { "content-type": "application/json" } : {}),
      ...(session?.csrf ? { "x-csrf-token": session.csrf } : {}),
      ...extra,
    },
    ...(data !== undefined ? { body: JSON.stringify(data) } : {}),
    signal: AbortSignal.timeout(12000),
  });
  const json = await response.json();
  if (!response.ok) {
    const error = new Error(
      json.error || `Request failed (${response.status})`,
    );
    error.status = response.status;
    if (response.status === 401 && session)
      showLogin("Your session expired. Sign in again.");
    throw error;
  }
  return json;
}
function showLogin(message = "") {
  session = null;
  modal.close();
  $("#boot").hidden = true;
  $("#app").hidden = true;
  $("#login").hidden = false;
  $("#login-error").textContent = message;
  $("#access-key").value = "";
  $("#access-key").focus();
}
function showApp() {
  $("#boot").hidden = true;
  $("#login").hidden = true;
  $("#app").hidden = false;
  navigate();
}
$("#login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const button = e.currentTarget.querySelector("button");
  button.disabled = true;
  $("#login-error").textContent = "";
  try {
    session = await api("/api/auth/login", "POST", {
      key: $("#access-key").value,
    });
    $("#access-key").value = "";
    showApp();
  } catch (error) {
    $("#login-error").textContent = error.message;
  } finally {
    button.disabled = false;
  }
});
function heading(title, subtitle, action = "") {
  return `<div class="page-heading"><div><span class="eyebrow">WORKSPACE / ${esc(names[page].toUpperCase())}</span><h1>${esc(title)}</h1><p>${esc(subtitle)}</p></div>${action}</div>`;
}
function empty(title, description, action = "", symbol = "tasks") {
  return `<div class="empty"><div class="empty-icon">${icon(symbol)}</div><h3>${esc(title)}</h3><p>${esc(description)}</p>${action}</div>`;
}
function taskRows(tasks, compact = false) {
  if (!tasks.length)
    return empty(
      "A clear space for your next task",
      "Run a system check to verify the worker, or give your AI assistant a task.",
      '<button class="button small" data-action="new-task">Create a task</button>',
    );
  return `<table class="task-table ${compact ? "compact" : ""}"><thead><tr><th scope="col">Task</th><th scope="col" class="status-col">Status</th><th scope="col" class="time-col">Created</th></tr></thead><tbody>${tasks.map((t) => `<tr><td><button class="task-name" data-task="${esc(t.id)}">${esc(t.title)}</button><span class="task-meta">${t.kind === "audit" ? "System check" : t.kind === "legacy" ? "Unverified v1 record" : "AI assistant"} · ${esc(t.id.slice(0, 8))}</span></td><td>${badge(t.status)}</td><td class="time-col muted" title="${esc(time(t.created_at))}">${esc(ago(t.created_at))}</td></tr>`).join("")}</tbody></table>`;
}
function statusRow(symbol, title, text, status) {
  return `<div class="status-row"><span class="status-symbol">${icon(symbol)}</span><div class="status-copy"><strong>${esc(title)}</strong><p>${esc(text)}</p></div>${badge(status)}</div>`;
}
function overviewPage() {
  const data = overview,
    counts = data.counts,
    live = data.workers.filter((w) => w.online),
    ai = live.find((w) => w.model_configured);
  const active = (counts.queued || 0) + (counts.running || 0),
    total = Object.entries(counts)
      .filter(([s]) => s !== "archived")
      .reduce((sum, [, n]) => sum + n, 0);
  return (
    heading(
      "Your workspace, at a glance.",
      "Run useful work. Follow the execution. Keep the result.",
      `<span class="heading-tag">${icon("clock")} Updated ${esc(ago(data.measured_at))}</span>`,
    ) +
    `${!total ? `<div class="welcome"><span class="status-symbol">${icon("worker")}</span><div class="welcome-copy"><h2>Start with a system check</h2><p>Confirm the queue and worker can complete a real task. No model key needed.</p></div><button class="button small" data-action="audit">Run system check ${icon("arrow")}</button></div>` : ""}` +
    `<section class="stats" aria-label="Task metrics"><div class="stat"><span class="stat-label">${icon("tasks")} In progress</span><strong class="stat-value">${active}</strong><span class="stat-note">${counts.running || 0} running · ${counts.queued || 0} queued</span></div><div class="stat"><span class="stat-label">${icon("check")} Completed</span><strong class="stat-value">${counts.completed || 0}</strong><span class="stat-note">Finished with a saved result</span></div><div class="stat"><span class="stat-label">${icon("info")} Needs attention</span><strong class="stat-value">${counts.failed || 0}</strong><span class="stat-note">Failed tasks · all recorded history</span></div><div class="stat"><span class="stat-label">${icon("worker")} Workers online</span><strong class="stat-value">${live.length}</strong><span class="stat-note">Heartbeat within 15 seconds</span></div></section>` +
    `<div class="section-grid"><section class="panel"><div class="panel-head"><h2>Recent tasks</h2><a href="#tasks">View all →</a></div>${taskRows(data.recent, true)}</section><div class="stack"><section class="panel"><div class="panel-head"><h2>Workspace health</h2><button class="text-link" data-action="audit">Run check</button></div><div class="panel-body">${statusRow("worker", "Execution worker", live.length ? `${live[0].name} · ${ago(live[0].last_seen)}` : "No current heartbeat received", live.length ? "online" : "offline")}${statusRow("connect", "AI provider", ai ? `${ai.model} · key configured, verified when a task runs` : "Add a model and API key to enable AI tasks", ai ? "configured" : "unknown")}${statusRow("shield", "Latest backup", data.backup.verified_at ? time(data.backup.verified_at) : "No verified backup recorded", data.backup.status)}</div></section><section class="panel"><div class="panel-head"><h2>Make the workspace yours</h2></div><div class="panel-body">${statusRow("document", "Add useful context", `${data.documents} document${data.documents === 1 ? "" : "s"} available to your assistant`, "workspace")}<p>Give the assistant a brief, a process, or a reference. Its tools only reach documents you add here.</p><p class="help"><a href="#documents">Open documents →</a></p></div></section></div></div>`
  );
}
function updateChrome() {
  if (!overview) return;
  const online = overview.workers.filter((w) => w.online).length;
  $("#worker-status").innerHTML =
    `<span class="dot ${online ? "" : "offline"}"></span>${online ? `${online} worker${online > 1 ? "s" : ""} online` : "Worker offline"}`;
  $("#queue-count").textContent =
    (overview.counts.running || 0) + (overview.counts.queued || 0) || "";
  $("#last-updated").textContent = `Measured ${time(overview.measured_at)}`;
}
async function loadOverview() {
  overview = await api("/api/overview");
  updateChrome();
  $("#connection-banner").hidden = true;
}
async function navigate() {
  if (!session) return;
  page = names[location.hash.slice(1)] ? location.hash.slice(1) : "overview";
  generation++;
  const gen = generation;
  closeNav();
  document.querySelectorAll("[data-nav]").forEach((el) => {
    const active = el.dataset.nav === page;
    el.classList.toggle("active", active);
    if (active) el.setAttribute("aria-current", "page");
    else el.removeAttribute("aria-current");
  });
  $("#page-name").textContent = names[page];
  document.title = `${names[page]} · Agent Kit`;
  $("#page").innerHTML = '<p class="muted">Loading workspace…</p>';
  try {
    await loadOverview();
    if (generation !== gen) return;
    if (page === "overview") $("#page").innerHTML = overviewPage();
    else if (page === "tasks") {
      $("#page").innerHTML =
        heading(
          "Tasks",
          "A durable record of what ran, what finished, and what needs your attention.",
        ) +
        `<div class="toolbar"><div class="search-field">${icon("search")}<input id="task-search" aria-label="Search task titles" type="search" placeholder="Search tasks…" value="${esc(search)}"></div><select id="task-filter" aria-label="Filter by task status">${["", "queued", "running", "completed", "failed", "cancelled", "archived"].map((s) => `<option value="${s}" ${s === filter ? "selected" : ""}>${s ? s[0].toUpperCase() + s.slice(1) : "All statuses"}</option>`).join("")}</select><span class="count-label" id="task-count"></span></div><div class="panel" id="task-list"></div><div id="pagination"></div>`;
      await loadTasks();
    } else if (page === "documents") await documentsPage(gen);
    else if (page === "connections") await connectionsPage(gen);
    else if (page === "recovery") recoveryPage();
    else if (page === "settings") await settingsPage(gen);
  } catch (error) {
    if (generation === gen && session)
      $("#page").innerHTML = empty(
        "Workspace unavailable",
        error.message,
        '<button class="button" data-action="refresh">Try again</button>',
        "info",
      );
  }
}
async function loadTasks() {
  const request = ++taskListRequest;
  const gen = generation,
    data = await api(
      `/api/tasks?status=${encodeURIComponent(filter)}&q=${encodeURIComponent(search)}&offset=${offset}`,
    );
  if (
    page !== "tasks" ||
    gen !== generation ||
    request !== taskListRequest ||
    !$("#task-list")
  )
    return;
  $("#task-list").innerHTML = data.tasks.length
    ? taskRows(data.tasks)
    : filter || search
      ? empty(
          "No matching tasks",
          "Try a different title or status.",
          '<button class="button small" data-action="clear-filter">Clear filters</button>',
          "search",
        )
      : taskRows([]);
  $("#task-count").textContent =
    `${data.total} task${data.total === 1 ? "" : "s"}`;
  $("#pagination").innerHTML =
    data.total > 30 || offset
      ? `<div class="pagination"><span>${data.total ? offset + 1 : 0}–${Math.min(offset + 30, data.total)} of ${data.total}</span><button class="button small" data-action="prev" ${offset ? "" : "disabled"}>Previous</button><button class="button small" data-action="next" ${offset + 30 < data.total ? "" : "disabled"}>Next</button></div>`
      : "";
}
async function documentsPage(gen) {
  const { documents } = await api("/api/documents");
  if (gen !== generation) return;
  $("#page").innerHTML =
    heading(
      "Documents",
      "Give your assistant useful context. Plain text and Markdown, up to 64 KiB per document.",
      '<button class="button small" data-action="new-document">' +
        icon("plus") +
        "Add document</button>",
    ) +
    `<div class="info-strip">${icon("shield")}<span>Documents are shared across this workspace. An AI task may send their contents to your configured model provider. Add only the context you want it to use.</span></div><section class="panel"><div class="panel-head"><h2>Workspace documents</h2><span class="muted">${documents.length} / 100</span></div>${documents.length ? documents.map((d) => `<div class="resource-row"><span class="status-symbol">${icon("document")}</span><div class="resource-info"><button class="task-name resource-title" data-document="${d.id}">${esc(d.title)}</button><small>${(d.bytes / 1024).toFixed(1)} KiB · Added ${esc(time(d.created_at))}</small></div><button class="icon-button" data-delete-document="${d.id}" aria-label="Delete ${esc(d.title)}">${icon("trash")}</button></div>`).join("") : empty("Bring your own context", "Add a project brief, notes, or a process for the assistant to reference.", '<button class="button small" data-action="new-document">Add your first document</button>', "document")}</section>`;
}
async function connectionsPage(gen) {
  const { tokens } = await api("/api/tokens");
  if (gen !== generation) return;
  $("#page").innerHTML =
    heading(
      "Connections",
      "Connect scripts and MCP clients with revocable, scoped access.",
      `<button class="button small" data-action="new-token">${icon("plus")}Create token</button>`,
    ) +
    `<div class="section-grid"><section class="panel"><div class="panel-head"><h2>API tokens</h2><span class="muted">${tokens.length} active</span></div>${tokens.length ? tokens.map((t) => `<div class="resource-row"><span class="status-symbol">${icon("connect")}</span><div class="resource-info"><span class="resource-title">${esc(t.name)}</span><small>${esc(t.scopes.join(" · "))}<br>Last used ${t.last_used_at ? esc(time(t.last_used_at)) : "never"}</small></div><button class="button small danger" data-revoke="${t.id}">Revoke</button></div>`).join("") : empty("Connect your tools", "Create a token with only the permissions your integration needs.", '<button class="button small" data-action="new-token">Create API token</button>', "connect")}</section><div class="stack"><section class="panel"><div class="panel-head"><h2>Use the task API</h2></div><div class="panel-body"><p>Send a task, keep its ID, and poll for its saved result. Use an idempotency key when retrying a submission.</p><pre class="code">POST /api/tasks
Authorization: Bearer YOUR_TOKEN
Idempotency-Key: unique-request-id

{"kind":"audit"}</pre><a href="/docs#api" target="_blank" rel="noopener">Read the API guide →</a></div></section><section class="panel"><div class="panel-head"><h2>MCP bridge</h2></div><div class="panel-body"><p>The included local bridge exposes task and document tools to a compatible MCP client.</p><pre class="code">cd integrations/mcp
npm ci
node index.js</pre><a href="/docs#mcp" target="_blank" rel="noopener">Configure an MCP client →</a></div></section></div></div>`;
}
function recoveryPage() {
  const b = overview.backup;
  $("#page").innerHTML =
    heading(
      "Recovery",
      "Know when your data was backed up, and practice restoring it.",
    ) +
    `<div class="info-strip ${b.status !== "verified" ? "warning" : ""}">${icon("shield")}<span>${b.status === "verified" ? "The most recent backup passed archive and checksum verification. A restore rehearsal is still needed to prove recovery on your host." : esc(b.message || (b.status === "failed" ? "The latest backup attempt failed. The previous verified backup may still exist." : "No recent verified backup. Enable the timer and run your first backup."))}</span></div><div class="recovery-grid"><section class="panel"><div class="panel-head"><h2>Latest backup</h2>${badge(b.status)}</div><div class="panel-body"><dl class="kv"><dt>Verified at</dt><dd>${esc(time(b.verified_at))}</dd><dt>Archive</dt><dd>${esc(b.archive || "None recorded")}</dd><dt>Archive size</dt><dd>${b.bytes ? (b.bytes / 1024).toFixed(1) + " KiB" : "—"}</dd><dt>Offsite copy</dt><dd>${esc(b.offsite || "Not configured")}</dd><dt>Last attempt</dt><dd>${esc(time(b.attempted_at))}</dd></dl><p class="help">Backups include the database, workspace documents, task results, and artifacts. Keep your .env file separately in an encrypted password vault.</p></div></section><section class="panel"><div class="panel-head"><h2>Run a backup</h2><span class="badge">On your host</span></div><div class="panel-body"><p>Run in your installation directory. The daily timer is installed by setup on hosts with systemd.</p><pre class="code">sudo ./scripts/backup.sh
systemctl list-timers agentkit-backup.timer</pre><p>To store a second copy, configure a private rclone remote and BACKUP_REMOTE in .env.</p><p class="help">Host operations stay in your terminal; the dashboard does not have access to the Docker socket.</p></div></section><section class="panel"><div class="panel-head"><h2>Restore on a clean host</h2></div><div class="panel-body"><ol class="steps"><li><strong>Install the same kit version</strong>Recover your .env from your password vault and restrict its permissions.</li><li><strong>Verify and restore the archive</strong>Run scripts/restore.sh with the archive path. It checks integrity and refuses a database that already contains tasks.</li><li><strong>Verify the recovered workspace</strong>Sign in, check documents and results, then run a system check. All sessions and API tokens are revoked after restore.</li></ol><a href="/docs#recovery" target="_blank" rel="noopener">Full recovery procedure →</a></div></section><section class="panel"><div class="panel-head"><h2>Recovery expectations</h2></div><div class="panel-body"><p>A daily schedule can lose up to a day of changes. Keep an encrypted offsite copy and rehearse a restore before relying on this workspace.</p><p class="help">Interrupted tasks are marked failed on recovery. They are never silently rerun, because a provider request may already have incurred a charge.</p></div></section></div>`;
}
async function settingsPage(gen) {
  const { entries } = await api("/api/audit");
  if (gen !== generation) return;
  $("#page").innerHTML =
    heading(
      "Workspace settings",
      "A single operator, explicit access, and a small set of bounded tools.",
    ) +
    `<div class="recovery-grid"><section class="panel"><div class="panel-head"><h2>Runtime</h2>${badge("configured")}</div><div class="panel-body"><dl class="kv"><dt>Kit version</dt><dd>${esc(session.version || "2.0.0")}</dd><dt>Workspace URL</dt><dd>${esc(session.origin || location.origin)}</dd><dt>Authentication</dt><dd>Operator key · 8-hour sessions</dd><dt>Task queue</dt><dd>PostgreSQL · durable · 100 pending maximum</dd><dt>AI tools</dt><dd>List / read documents, calculate, save a text artifact</dd><dt>Execution policy</dt><dd>No automatic retries after interruption</dd></dl></div></section><section class="panel"><div class="panel-head"><h2>Configure your AI worker</h2></div><div class="panel-body"><p>Edit the protected .env file on your host, then recreate the worker. Model usage is billed by your provider.</p><pre class="code">OPENAI_API_KEY=your-provider-key
OPENAI_MODEL=your-supported-model

# Apply changes from the kit directory:
docker compose up -d --force-recreate worker</pre><p class="help">Request limits: 8 model calls, 2,048 output tokens per call, 180 seconds per task by default. Adjust in .env. These are technical limits, not a guaranteed currency budget.</p><a href="/docs#models" target="_blank" rel="noopener">Model configuration →</a></div></section></div><section class="panel detail-section"><div class="panel-head"><h2>Recent access and operator activity</h2><span class="muted">Latest 50</span></div>${entries.length ? entries.map((e) => `<div class="resource-row"><div class="resource-info"><span class="resource-title">${esc(e.action)}</span><small>${esc(e.actor)}${e.target ? " · " + esc(e.target.slice(0, 8)) : ""}</small></div><span class="muted">${esc(time(e.created_at))}</span></div>`).join("") : empty("No activity yet", "Operator actions will appear here.", "", "shield")}</section>`;
}
function dialog(title, html, detail = false) {
  modal.classList.toggle("detail", detail);
  $("#modal-title").textContent = title;
  $("#modal-body").innerHTML = html;
  if (!modal.open) modal.showModal();
}
function closeDialog() {
  modal.close();
  taskId = null;
}
modal.addEventListener("close", () => {
  if (modal.open) return;
  taskId = null;
  $("#modal-body").innerHTML = "";
});
modal.addEventListener("click", (e) => {
  if (e.target === modal) {
    const r = modal.getBoundingClientRect();
    if (
      e.clientX < r.left ||
      e.clientX > r.right ||
      e.clientY < r.top ||
      e.clientY > r.bottom
    )
      closeDialog();
  }
});
function newTask() {
  const configured = overview?.workers.some(
    (w) => w.online && w.model_configured,
  );
  dialog(
    "New task",
    `<form id="task-form" data-key="${crypto.randomUUID()}"><p class="help">Tasks are saved before execution. Follow their progress and inspect the result.</p><label for="task-kind">Task type</label><select id="task-kind" name="kind"><option value="assistant" ${!configured ? "disabled" : ""}>AI assistant${!configured ? " · configure a model first" : ""}</option><option value="audit" ${!configured ? "selected" : ""}>System check · no model needed</option></select>${!configured ? '<p class="help">Configure OPENAI_API_KEY and OPENAI_MODEL on your host to enable AI tasks. <a href="/docs#models" target="_blank" rel="noopener">Setup guide ↗</a></p>' : ""}<label for="task-title">Title <span class="muted">(optional)</span></label><input id="task-title" name="title" maxlength="120" placeholder="Give this task a short name"><div id="prompt-field" ${!configured ? "hidden" : ""}><label for="task-prompt">What should the assistant do?</label><textarea id="task-prompt" name="prompt" rows="5" maxlength="16000" ${configured ? "required" : ""} placeholder="Read the project brief and create a concise launch checklist…"></textarea><p class="help">Can read workspace documents, calculate, and save text artifacts. Cannot run commands, browse the web, or send messages.</p></div><div class="form-error" role="alert"></div><div class="dialog-actions"><button class="button" type="button" data-action="close-dialog">Cancel</button><button class="button primary" type="submit">Create task ${icon("arrow")}</button></div></form>`,
  );
}
async function audit() {
  const data = await api(
    "/api/tasks",
    "POST",
    { kind: "audit" },
    { "idempotency-key": crypto.randomUUID() },
  );
  await openTask(data.task.id);
  await loadOverview();
}
async function openTask(id) {
  taskId = id;
  dialog("Task details", '<p class="muted">Loading task…</p>', true);
  await loadDetail(true);
}
async function loadDetail(initial = false) {
  const id = taskId;
  if (!id || !modal.open) return;
  const [data, trace] = await Promise.all([
    api(`/api/tasks/${id}`),
    api(`/api/tasks/${id}/events`),
  ]);
  if (id !== taskId || !modal.open) return;
  const t = data.task;
  $("#modal-title").textContent = t.title;
  const duration =
    t.started_at && t.finished_at
      ? `${Math.max(0, (Date.parse(t.finished_at) - Date.parse(t.started_at)) / 1000).toFixed(1)}s`
      : null;
  const html = `<div class="detail-meta">${badge(t.status)}<span>${t.kind === "audit" ? "System check" : t.kind === "legacy" ? "Unverified v1 record" : "AI assistant"}</span><span>${esc(time(t.created_at))}</span>${duration ? `<span>${duration}</span>` : ""}</div>${t.cancel_requested && t.status === "running" ? '<div class="info-strip warning">Cancellation requested. Waiting for the worker to stop.</div>' : ""}${t.parent_job_id ? `<p class="help">Retry of ${esc(t.parent_job_id.slice(0, 8))}. The original record is preserved.</p>` : ""}<div class="detail-section"><h3>Task input</h3><div class="output" tabindex="0">${esc(t.prompt)}</div></div><div class="detail-section"><h3>${t.status === "completed" ? "Saved result" : t.error ? "Execution stopped" : "Result"}</h3><div class="output" tabindex="0">${esc(t.result || t.error || (t.status === "queued" ? "Waiting for an available worker. This task is safely queued." : t.status === "running" ? "The worker is executing this task. Progress appears below." : "No result was produced."))}</div></div>${t.model ? `<p class="help">Model: ${esc(t.model)} · Input tokens: ${t.input_tokens ?? "not reported"} · Output tokens: ${t.output_tokens ?? "not reported"} · Usage is reported by the provider.</p>` : ""}${data.artifacts.length ? `<div class="detail-section"><h3>Artifacts${t.status !== "completed" ? " · partial work" : ""}</h3>${data.artifacts.map((a) => `<a class="button small" href="/api/artifacts/${a.id}" download>${icon("download")}${esc(a.name)}</a>`).join(" ")}</div>` : ""}<div class="detail-section"><h3>Execution trace</h3><ol class="timeline">${trace.events.map((e) => `<li><span>${esc(e.message)}</span><time datetime="${esc(e.created_at)}">${esc(new Date(e.created_at).toLocaleTimeString())}</time></li>`).join("")}</ol></div>`;
  if (initial || !$("#detail-live"))
    $("#modal-body").innerHTML =
      `<div id="detail-live"></div><div id="detail-actions" class="dialog-actions"></div>`;
  if ($("#detail-live").innerHTML !== html) $("#detail-live").innerHTML = html;
  const actions = `${["queued", "running"].includes(t.status) ? `<button class="button danger left" data-cancel-task="${id}" ${t.cancel_requested ? "disabled" : ""}>${t.cancel_requested ? "Cancelling…" : "Cancel task"}</button>` : ["failed", "cancelled"].includes(t.status) ? `<button class="button left" data-retry-task="${id}">Review and retry</button>` : ""}${t.result ? '<button class="button" data-action="copy-result">Copy result</button>' : ""}<button class="button" data-action="close-dialog">Close</button>`;
  if ($("#detail-actions").innerHTML !== actions)
    $("#detail-actions").innerHTML = actions;
  if (initial) $("#modal-title").focus();
}
function newDocument() {
  dialog(
    "Add document",
    `<form id="document-form"><p class="help">Paste plain text or Markdown. The assistant can read this document during a task.</p><label for="doc-title">Title</label><input id="doc-title" name="title" required maxlength="120" placeholder="Project brief"><label for="doc-content">Content</label><textarea id="doc-content" name="content" required rows="9" placeholder="Add your context here…"></textarea><p class="help">64 KiB maximum. You can delete the document at any time.</p><div class="form-error" role="alert"></div><div class="dialog-actions"><button class="button" type="button" data-action="close-dialog">Cancel</button><button class="button primary" type="submit">Save document</button></div></form>`,
  );
}
function newToken() {
  dialog(
    "Create API token",
    `<form id="token-form"><p class="help">Create a separate token for each integration. You can revoke it at any time.</p><label for="token-name">Name</label><input id="token-name" name="name" required maxlength="80" placeholder="My MCP client"><label>Permissions</label><label class="check-label"><input type="checkbox" name="scope" value="tasks:read" checked>Read tasks, results and artifacts</label><label class="check-label"><input type="checkbox" name="scope" value="tasks:write" checked>Create, retry and cancel tasks</label><label class="check-label"><input type="checkbox" name="scope" value="documents:read">Read workspace documents</label><div class="form-error" role="alert"></div><div class="dialog-actions"><button class="button" type="button" data-action="close-dialog">Cancel</button><button class="button primary" type="submit">Create token</button></div></form>`,
  );
}
function confirmAction(title, text, label, action, target) {
  dialog(
    title,
    `<p>${esc(text)}</p><div class="form-error" role="alert"></div><div class="dialog-actions"><button class="button" data-action="close-dialog">Keep as is</button><button class="button danger" data-confirm="${action}" data-target="${esc(target)}">${esc(label)}</button></div>`,
  );
}
function commands() {
  dialog(
    "Go to…",
    `<div class="command-list">${Object.entries(names)
      .map(
        ([id, name]) =>
          `<button data-go="${id}">${icon(id === "connections" ? "connect" : id === "recovery" ? "shield" : id === "documents" ? "document" : id)}${name}</button>`,
      )
      .join(
        "",
      )}<button data-action="new-task">${icon("plus")}New task<kbd>N</kbd></button></div>`,
  );
}
async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast("Copied to clipboard");
  } catch {
    toast("Clipboard unavailable. Select the text and copy it manually.");
  }
}
function closeNav() {
  $("#sidebar").classList.remove("open");
  $("#nav-backdrop").hidden = true;
  $("#mobile-nav").setAttribute("aria-expanded", "false");
  if (innerWidth <= 640) $("#sidebar").inert = true;
}
function openNav() {
  $("#sidebar").inert = false;
  $("#sidebar").classList.add("open");
  $("#nav-backdrop").hidden = false;
  $("#mobile-nav").setAttribute("aria-expanded", "true");
  $("#sidebar a").focus();
}
$("#mobile-nav").addEventListener("click", () =>
  $("#sidebar").classList.contains("open") ? closeNav() : openNav(),
);
$("#nav-backdrop").addEventListener("click", closeNav);
window.addEventListener("resize", () => {
  $("#sidebar").inert =
    innerWidth <= 640 && !$("#sidebar").classList.contains("open");
});
window.addEventListener("hashchange", () => {
  navigate().catch((error) => toast(error.message));
});
document.addEventListener("input", (e) => {
  if (e.target.id === "task-search") {
    search = e.target.value;
    offset = 0;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(
      () => loadTasks().catch((error) => toast(error.message)),
      250,
    );
  }
});
document.addEventListener("change", (e) => {
  if (e.target.id === "task-filter") {
    filter = e.target.value;
    offset = 0;
    loadTasks().catch((error) => toast(error.message));
  }
  if (e.target.id === "task-kind") {
    const assistant = e.target.value === "assistant";
    $("#prompt-field").hidden = !assistant;
    $("#task-prompt").required = assistant;
  }
});
document.addEventListener("submit", async (e) => {
  const form = e.target;
  if (!["task-form", "document-form", "token-form"].includes(form.id)) return;
  e.preventDefault();
  const submit = form.querySelector("[type=submit]");
  submit.disabled = true;
  form.querySelector(".form-error").textContent = "";
  const data = new FormData(form);
  try {
    if (form.id === "task-form") {
      const value = await api("/api/tasks", "POST", Object.fromEntries(data), {
        "idempotency-key": form.dataset.key,
      });
      closeDialog();
      await openTask(value.task.id);
      await loadOverview();
    }
    if (form.id === "document-form") {
      await api("/api/documents", "POST", Object.fromEntries(data));
      closeDialog();
      toast("Document added");
      if (page === "documents") await documentsPage(generation);
    }
    if (form.id === "token-form") {
      const value = await api("/api/tokens", "POST", {
        name: data.get("name"),
        scopes: data.getAll("scope"),
      });
      dialog(
        "Save your API token",
        `<div class="info-strip warning">This token is shown only once. Save it in your password manager before closing.</div><label for="new-token">${esc(value.name)}</label><input id="new-token" class="token-secret" readonly value="${esc(value.token)}"><p class="help">Permissions: ${esc(value.scopes.join(", "))}</p><div class="dialog-actions"><button class="button" data-action="copy-token">${icon("copy")}Copy token</button><button class="button primary" data-action="close-dialog">I have saved it</button></div>`,
      );
      if (page === "connections") await connectionsPage(generation);
    }
  } catch (error) {
    if (form.isConnected)
      form.querySelector(".form-error").textContent = error.message;
    else toast(error.message);
  } finally {
    submit.disabled = false;
  }
});
document.addEventListener("click", async (e) => {
  const b = e.target.closest("button");
  if (!b || b.disabled) return;
  try {
    if (b.dataset.task) return await openTask(b.dataset.task);
    if (b.dataset.document) {
      const doc = await api(`/api/documents/${b.dataset.document}`);
      return dialog(
        doc.title,
        `<div class="output" tabindex="0">${esc(doc.content)}</div><div class="dialog-actions"><button class="button" data-action="close-dialog">Close</button></div>`,
        true,
      );
    }
    if (b.dataset.deleteDocument)
      return confirmAction(
        "Delete document?",
        "The assistant will no longer be able to read this document. Previously saved task results and backups may still contain its content.",
        "Delete document",
        "document",
        b.dataset.deleteDocument,
      );
    if (b.dataset.revoke)
      return confirmAction(
        "Revoke token?",
        "Any integration using this token will immediately lose access.",
        "Revoke token",
        "token",
        b.dataset.revoke,
      );
    if (b.dataset.cancelTask) {
      await api(`/api/tasks/${b.dataset.cancelTask}/cancel`, "POST", {});
      toast("Cancellation requested");
      return await loadDetail();
    }
    if (b.dataset.retryTask)
      return confirmAction(
        "Retry this task?",
        "Review the earlier trace first. A previous provider request may already have incurred usage charges. Retrying creates a new task.",
        "Create retry",
        "retry",
        b.dataset.retryTask,
      );
    if (b.dataset.confirm) {
      b.disabled = true;
      const { confirm, target } = b.dataset;
      try {
        if (confirm === "document") {
          await api(`/api/documents/${target}`, "DELETE");
          closeDialog();
          await documentsPage(generation);
          toast("Document deleted");
        }
        if (confirm === "token") {
          await api(`/api/tokens/${target}`, "DELETE");
          closeDialog();
          await connectionsPage(generation);
          toast("Token revoked");
        }
        if (confirm === "retry") {
          const data = await api(
            `/api/tasks/${target}/retry`,
            "POST",
            {},
            { "idempotency-key": crypto.randomUUID() },
          );
          closeDialog();
          await openTask(data.task.id);
        }
      } catch (error) {
        b.disabled = false;
        $("#modal-body .form-error").textContent = error.message;
      }
      return;
    }
    if (b.dataset.go) {
      closeDialog();
      location.hash = b.dataset.go;
      return;
    }
    switch (b.dataset.action) {
      case "new-task":
        taskId = null;
        newTask();
        break;
      case "new-document":
        newDocument();
        break;
      case "new-token":
        newToken();
        break;
      case "audit":
        b.disabled = true;
        try {
          await audit();
        } finally {
          b.disabled = false;
        }
        break;
      case "close-dialog":
        closeDialog();
        break;
      case "refresh":
        await navigate();
        toast("Workspace refreshed");
        break;
      case "theme": {
        const theme =
          document.documentElement.dataset.theme === "dark" ? "light" : "dark";
        document.documentElement.dataset.theme = theme;
        try {
          localStorage.setItem("agentkit-theme", theme);
        } catch {}
        break;
      }
      case "logout":
        await api("/api/auth/logout", "POST", {});
        showLogin();
        break;
      case "command":
        commands();
        break;
      case "copy-token":
        await copy($("#new-token").value);
        break;
      case "copy-result":
        if (taskId) await copy((await api(`/api/tasks/${taskId}`)).task.result);
        break;
      case "clear-filter":
        filter = "";
        search = "";
        offset = 0;
        await navigate();
        break;
      case "prev":
        offset = Math.max(0, offset - 30);
        await loadTasks();
        break;
      case "next":
        offset += 30;
        await loadTasks();
        break;
    }
  } catch (error) {
    toast(error.message);
  }
});
document.addEventListener("keydown", (e) => {
  if (!session) return;
  if (e.key === "Escape" && $("#sidebar").classList.contains("open")) {
    closeNav();
    $("#mobile-nav").focus();
  }
  if (e.key === "Tab" && $("#sidebar").classList.contains("open")) {
    const focusable = [...$("#sidebar").querySelectorAll("a,button")];
    const first = focusable[0],
      last = focusable.at(-1);
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
    e.preventDefault();
    commands();
  } else if (
    e.key.toLowerCase() === "n" &&
    !e.metaKey &&
    !e.ctrlKey &&
    !e.altKey &&
    !modal.open &&
    !["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName)
  ) {
    e.preventDefault();
    newTask();
  }
});
setInterval(async () => {
  if (!session || document.hidden || polling) return;
  polling = true;
  try {
    await loadOverview();
    if (taskId) await loadDetail();
    const interacting =
      $("#page").contains(document.activeElement) &&
      document.activeElement.matches("input,select,button,a");
    if (!interacting && !modal.open) {
      if (page === "overview") $("#page").innerHTML = overviewPage();
      if (page === "tasks") await loadTasks();
      if (page === "recovery") recoveryPage();
    }
  } catch {
    if (session) $("#connection-banner").hidden = false;
  } finally {
    polling = false;
  }
}, 3000);
try {
  session = await api("/api/auth/session");
  showApp();
} catch {
  showLogin();
}
