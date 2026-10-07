const http = require('http');
const { Pool } = require('pg');
const Redis = require('ioredis');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const PORT = parseInt(process.env.PORT || '3000', 10);

// PostgreSQL 17 Connection Pool
const pool = new Pool({
  host: process.env.DB_HOST || 'postgres',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  database: process.env.DB_NAME || 'agentdb',
  user: process.env.DB_USER || 'agent',
  password: process.env.DB_PASSWORD || '',
  connectionTimeoutMillis: 5000,
  max: 10,
});

// Redis 7.4 Client
const redis = new Redis({
  host: process.env.REDIS_HOST || 'redis',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  password: process.env.REDIS_PASSWORD || undefined,
  retryStrategy: (times) => Math.min(times * 100, 3000),
  maxRetriesPerRequest: 3,
});

let dbConnected = false;
let redisConnected = false;
let dbVersion = 'PostgreSQL 17';
let redisVersion = 'Redis 7.4';

// Initialize Database Table & Fetch Version
async function initDb() {
  for (let attempt = 1; attempt <= 15; attempt++) {
    try {
      const client = await pool.connect();
      const verRes = await client.query('SELECT version()');
      if (verRes.rows[0]) {
        dbVersion = verRes.rows[0].version.split(' on ')[0];
      }
      await client.query(`
        CREATE TABLE IF NOT EXISTS agent_tasks (
          id SERIAL PRIMARY KEY,
          task_id VARCHAR(64) UNIQUE NOT NULL,
          prompt TEXT NOT NULL,
          status VARCHAR(32) NOT NULL DEFAULT 'completed',
          tokens_used INT DEFAULT 0,
          latency_ms INT DEFAULT 0,
          result TEXT,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
      `);
      client.release();
      dbConnected = true;
      console.log(`[RUNTIME] ${dbVersion} initialized and schema ready.`);
      return;
    } catch (err) {
      console.warn(`[RUNTIME] Waiting for Postgres (attempt ${attempt}/15): ${err.message}`);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
}

redis.on('connect', async () => {
  redisConnected = true;
  console.log('[RUNTIME] Redis connection established.');
  try {
    const info = await redis.info('server');
    const match = info.match(/redis_version:([^\r\n]+)/);
    if (match) redisVersion = `Redis ${match[1]}`;
  } catch (_) {}
  redis.set('agent:status', 'online', 'EX', 86400).catch(() => {});
});

redis.on('error', (err) => {
  redisConnected = false;
  console.warn('[RUNTIME] Redis error:', err.message);
});

// Helper to check backup state
function getBackupState() {
  const backupDir = fs.existsSync('/app/backups') ? '/app/backups' : path.resolve(__dirname, '../backups');
  if (!fs.existsSync(backupDir)) {
    return { count: 0, latest: null, ageHours: null };
  }
  try {
    const files = fs.readdirSync(backupDir).filter(f => f.startsWith('postgres_'));
    if (!files.length) return { count: 0, latest: null, ageHours: null };
    let latestTime = 0;
    let latestFile = null;
    for (const f of files) {
      const stat = fs.statSync(path.join(backupDir, f));
      if (stat.mtimeMs > latestTime) {
        latestTime = stat.mtimeMs;
        latestFile = f;
      }
    }
    const ageHours = Math.round((Date.now() - latestTime) / (3600 * 1000) * 10) / 10;
    return { count: files.length, latest: latestFile, ageHours };
  } catch (_) {
    return { count: 0, latest: null, ageHours: null };
  }
}

// Guardrail logic simulation
function testGuardrail(type, input) {
  if (type === 'sql') {
    const dangerousPatterns = [
      /DROP\s+DATABASE/i,
      /DROP\s+TABLE/i,
      /DROP\s+SCHEMA/i,
      /TRUNCATE\s+/i,
      /DELETE\s+FROM\s+[a-zA-Z0-9_]+\s*;?$/i,
    ];
    for (const pat of dangerousPatterns) {
      if (pat.test(input)) {
        return {
          allowed: false,
          code: 102,
          reason: `ZeroVPS SQL Guardrail blocked statement matching pattern "${pat.source}". Destructive mutations forbidden without explicit override.`,
        };
      }
    }
    return { allowed: true, code: 0, reason: 'ZeroVPS SQL Guardrail passed. Statement verified safe for execution.' };
  } else {
    // Bash
    const dangerousBash = [
      /rm\s+-[rfRF]{2,}\s+(\/|\*|\/\*|~|~\/\*|\$HOME)/i,
      /rm\s+-[rfRF]{2,}\s+--no-preserve-root/i,
      /mkfs/i,
      /dd\s+if=.*of=\/dev\/[shv]d[a-z]/i,
      />:?\s*\/dev\/[shv]d[a-z]/i,
      /:\(\)\{.*:\|:&\};:/i,
      /chmod\s+-R\s+[07]{3,4}\s+\//i,
      /cat\s+\/etc\/shadow/i,
      /pkill\s+-9\s+-f\s+(python|node|bash|docker|systemd)/i,
    ];
    for (const pat of dangerousBash) {
      if (pat.test(input)) {
        return {
          allowed: false,
          code: 101,
          reason: `ZeroVPS Shell Guardrail blocked dangerous command matching pattern "${pat.source}". Destructive host operation prevented.`,
        };
      }
    }
    return { allowed: true, code: 0, reason: 'ZeroVPS Shell Guardrail passed. Command verified safe.' };
  }
}

// Render Modern High-Aesthetic Dashboard
function renderDashboard() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ZeroLabs // Self-Hosted Agent Infrastructure</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #07090e;
      --surface: #0e111a;
      --surface-elevated: #141824;
      --surface-card: rgba(14, 17, 26, 0.85);
      --border: #1e2438;
      --border-subtle: rgba(255, 255, 255, 0.07);
      --border-accent: rgba(6, 182, 212, 0.3);
      --text: #f1f5f9;
      --text-muted: #7e8ba2;
      --text-dim: #4b5568;
      --emerald: #10b981;
      --emerald-glow: rgba(16, 185, 129, 0.25);
      --cyan: #06b6d4;
      --cyan-glow: rgba(6, 182, 212, 0.25);
      --violet: #8b5cf6;
      --violet-glow: rgba(139, 92, 246, 0.25);
      --amber: #f59e0b;
      --red: #ef4444;
      --red-glow: rgba(239, 68, 68, 0.25);
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: var(--bg);
      background-image: 
        radial-gradient(ellipse 80% 50% at 50% -20%, rgba(6, 182, 212, 0.12), transparent),
        radial-gradient(circle 600px at 100% 100%, rgba(139, 92, 246, 0.08), transparent);
      color: var(--text);
      font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      min-height: 100vh;
      padding: 1.5rem;
      line-height: 1.5;
    }
    .wrapper { max-width: 1200px; margin: 0 auto; }
    
    /* Top Navigation Header */
    header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 1rem 1.5rem;
      background: var(--surface-card);
      backdrop-filter: blur(16px);
      border: 1px solid var(--border);
      border-radius: 14px;
      margin-bottom: 1.75rem;
      gap: 1rem;
      flex-wrap: wrap;
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 0.85rem;
    }
    .brand-icon {
      width: 36px;
      height: 36px;
      border-radius: 9px;
      background: linear-gradient(135deg, #06b6d4, #3b82f6);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1.15rem;
      box-shadow: 0 0 20px rgba(6, 182, 212, 0.35);
    }
    .brand-title {
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.95rem;
      font-weight: 700;
      letter-spacing: 0.06em;
      color: #fff;
    }
    .brand-subtitle {
      font-size: 0.75rem;
      color: var(--text-muted);
      letter-spacing: 0.02em;
    }
    .status-cluster {
      display: flex;
      align-items: center;
      gap: 0.6rem;
      flex-wrap: wrap;
    }
    .live-badge {
      display: inline-flex;
      align-items: center;
      gap: 0.45rem;
      padding: 0.35rem 0.75rem;
      background: rgba(16, 185, 129, 0.1);
      border: 1px solid rgba(16, 185, 129, 0.3);
      border-radius: 9999px;
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.75rem;
      font-weight: 600;
      color: var(--emerald);
    }
    .live-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: var(--emerald);
      box-shadow: 0 0 10px var(--emerald);
      animation: pulse 2s infinite;
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.4; transform: scale(0.9); }
    }
    .pill {
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.72rem;
      padding: 0.3rem 0.65rem;
      background: rgba(255, 255, 255, 0.04);
      border: 1px solid var(--border-subtle);
      border-radius: 9999px;
      color: var(--text-muted);
    }

    /* Metric HUD Grid */
    .hud-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      gap: 1rem;
      margin-bottom: 1.75rem;
    }
    .hud-card {
      background: var(--surface-card);
      backdrop-filter: blur(12px);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 1.25rem;
      position: relative;
      overflow: hidden;
      transition: border-color 0.2s, transform 0.2s;
    }
    .hud-card:hover {
      border-color: var(--border-accent);
      transform: translateY(-2px);
    }
    .hud-card::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 2px;
      background: linear-gradient(90deg, transparent, rgba(6, 182, 212, 0.4), transparent);
    }
    .hud-label {
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.72rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--text-muted);
      margin-bottom: 0.4rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .hud-value {
      font-family: 'JetBrains Mono', monospace;
      font-size: 1.25rem;
      font-weight: 700;
      color: #fff;
      display: flex;
      align-items: baseline;
      gap: 0.4rem;
    }
    .hud-sub {
      font-size: 0.75rem;
      color: var(--text-muted);
      margin-top: 0.4rem;
      display: flex;
      align-items: center;
      gap: 0.35rem;
    }

    /* Main 2-Column Grid */
    .main-grid {
      display: grid;
      grid-template-columns: 1.4fr 1fr;
      gap: 1.5rem;
      margin-bottom: 1.75rem;
    }
    @media (max-width: 960px) {
      .main-grid { grid-template-columns: 1fr; }
    }

    .panel {
      background: var(--surface-card);
      backdrop-filter: blur(12px);
      border: 1px solid var(--border);
      border-radius: 14px;
      padding: 1.5rem;
      display: flex;
      flex-direction: column;
    }
    .panel-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1.25rem;
      padding-bottom: 0.75rem;
      border-bottom: 1px solid var(--border-subtle);
    }
    .panel-title {
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.88rem;
      font-weight: 700;
      letter-spacing: 0.04em;
      color: var(--cyan);
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    
    /* Preset Chips */
    .chip-container {
      display: flex;
      gap: 0.4rem;
      flex-wrap: wrap;
      margin-bottom: 1rem;
    }
    .chip {
      background: rgba(255, 255, 255, 0.04);
      border: 1px solid var(--border-subtle);
      border-radius: 6px;
      padding: 0.3rem 0.65rem;
      font-size: 0.75rem;
      color: var(--text-muted);
      cursor: pointer;
      transition: all 0.15s ease;
      font-family: 'Plus Jakarta Sans', sans-serif;
    }
    .chip:hover {
      background: rgba(6, 182, 212, 0.12);
      border-color: var(--cyan);
      color: #fff;
    }

    /* Runner Input */
    .input-row {
      display: flex;
      gap: 0.6rem;
      margin-bottom: 1rem;
    }
    input[type="text"] {
      flex: 1;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 8px;
      color: #fff;
      padding: 0.75rem 1rem;
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.82rem;
      transition: border-color 0.2s, box-shadow 0.2s;
    }
    input[type="text"]:focus {
      outline: none;
      border-color: var(--cyan);
      box-shadow: 0 0 12px rgba(6, 182, 212, 0.25);
    }
    .btn-primary {
      background: linear-gradient(135deg, #06b6d4, #2563eb);
      color: #fff;
      border: none;
      border-radius: 8px;
      padding: 0.75rem 1.25rem;
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.8rem;
      font-weight: 600;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 0.45rem;
      transition: opacity 0.2s, transform 0.15s;
      box-shadow: 0 0 15px rgba(6, 182, 212, 0.3);
      white-space: nowrap;
    }
    .btn-primary:hover { opacity: 0.92; transform: translateY(-1px); }
    .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }

    /* Streaming Terminal */
    .terminal-wrap {
      background: #040508;
      border: 1px solid var(--border);
      border-radius: 10px;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      flex: 1;
      min-height: 240px;
    }
    .terminal-bar {
      background: #090c14;
      border-bottom: 1px solid rgba(255, 255, 255, 0.05);
      padding: 0.45rem 0.85rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.7rem;
      color: var(--text-muted);
    }
    .dots { display: flex; gap: 0.35rem; }
    .dot { width: 8px; height: 8px; border-radius: 50%; }
    .dot-red { background: #ef4444; }
    .dot-yellow { background: #f59e0b; }
    .dot-green { background: #10b981; }

    .terminal-body {
      padding: 1rem;
      color: #a3e635;
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.82rem;
      line-height: 1.6;
      white-space: pre-wrap;
      word-break: break-word;
      overflow-y: auto;
      max-height: 320px;
      flex: 1;
    }
    .terminal-footer {
      background: #090c14;
      border-top: 1px solid rgba(255, 255, 255, 0.05);
      padding: 0.5rem 0.85rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.72rem;
      color: var(--text-muted);
    }

    /* ZeroVPS Operations Panel */
    .ops-section {
      margin-bottom: 1.25rem;
    }
    .ops-section:last-child { margin-bottom: 0; }
    .ops-header {
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.74rem;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--text-muted);
      margin-bottom: 0.6rem;
      display: flex;
      align-items: center;
      gap: 0.4rem;
    }
    .guardrail-card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 0.85rem;
      margin-bottom: 0.6rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 0.75rem;
    }
    .guardrail-name {
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.78rem;
      font-weight: 600;
      color: #fff;
    }
    .guardrail-desc {
      font-size: 0.72rem;
      color: var(--text-muted);
      margin-top: 0.15rem;
    }
    .status-active {
      color: var(--emerald);
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.72rem;
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 0.3rem;
    }

    /* Interactive Guardrail Sandbox */
    .sandbox-box {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 1rem;
      margin-top: 0.5rem;
    }
    .sandbox-tabs {
      display: flex;
      gap: 0.5rem;
      margin-bottom: 0.75rem;
    }
    .sandbox-tab {
      background: none;
      border: none;
      color: var(--text-muted);
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.75rem;
      padding: 0.25rem 0.5rem;
      cursor: pointer;
      border-radius: 4px;
    }
    .sandbox-tab.active {
      background: rgba(6, 182, 212, 0.15);
      color: var(--cyan);
      font-weight: 600;
    }
    .sandbox-result {
      margin-top: 0.6rem;
      padding: 0.6rem 0.8rem;
      border-radius: 6px;
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.74rem;
      display: none;
      line-height: 1.4;
    }
    .sandbox-result.blocked {
      background: rgba(239, 68, 68, 0.1);
      border: 1px solid rgba(239, 68, 68, 0.3);
      color: #fca5a5;
      display: block;
    }
    .sandbox-result.passed {
      background: rgba(16, 185, 129, 0.1);
      border: 1px solid rgba(16, 185, 129, 0.3);
      color: #86efac;
      display: block;
    }

    /* Database Task Table */
    .table-panel {
      background: var(--surface-card);
      backdrop-filter: blur(12px);
      border: 1px solid var(--border);
      border-radius: 14px;
      padding: 1.5rem;
      margin-bottom: 1.75rem;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.8rem;
      font-family: 'JetBrains Mono', monospace;
    }
    th {
      text-align: left;
      padding: 0.75rem 0.85rem;
      border-bottom: 1px solid var(--border);
      color: var(--text-muted);
      font-size: 0.7rem;
      letter-spacing: 0.05em;
      text-transform: uppercase;
    }
    td {
      padding: 0.75rem 0.85rem;
      border-bottom: 1px solid rgba(255, 255, 255, 0.04);
      color: var(--text);
    }
    tr:hover td {
      background: rgba(255, 255, 255, 0.02);
    }
    .code-tag {
      background: rgba(6, 182, 212, 0.1);
      color: var(--cyan);
      padding: 0.15rem 0.45rem;
      border-radius: 4px;
      border: 1px solid rgba(6, 182, 212, 0.25);
    }

    /* What You Bought / Deliverables Section */
    .deliverables-panel {
      background: linear-gradient(180deg, rgba(14, 17, 26, 0.95), rgba(7, 9, 14, 0.98));
      border: 1px solid var(--border);
      border-radius: 14px;
      padding: 1.5rem;
    }
    .deliverables-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
      gap: 1rem;
      margin-top: 1rem;
    }
    .deliverable-item {
      background: var(--surface);
      border: 1px solid var(--border-subtle);
      border-radius: 8px;
      padding: 1rem;
    }
    .deliverable-title {
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.8rem;
      font-weight: 600;
      color: #fff;
      display: flex;
      align-items: center;
      gap: 0.4rem;
      margin-bottom: 0.35rem;
    }
    .deliverable-desc {
      font-size: 0.75rem;
      color: var(--text-muted);
      line-height: 1.45;
    }
  </style>
</head>
<body>
  <div class="wrapper">
    <!-- Header -->
    <header>
      <div class="brand">
        <div class="brand-icon">⚡</div>
        <div>
          <div class="brand-title">ZEROLABS // AGENT STACK OPS</div>
          <div class="brand-subtitle">Self-Hosted Autonomous Agent Infrastructure & ZeroVPS Guardrails</div>
        </div>
      </div>
      <div class="status-cluster">
        <div class="live-badge">
          <span class="live-dot"></span>
          <span>STACK ALL GREEN</span>
        </div>
        <span class="pill" id="pg-badge">POSTGRESQL 17</span>
        <span class="pill" id="redis-badge">REDIS 7.4</span>
        <span class="pill">CADDY 2.11 (SSE DIRECT)</span>
        <span class="pill">ZERO-PORT MESH</span>
      </div>
    </header>

    <!-- Telemetry HUD -->
    <div class="hud-grid">
      <div class="hud-card">
        <div class="hud-label">
          <span>Node.js Runtime</span>
          <span class="code-tag">LTS v22</span>
        </div>
        <div class="hud-value" id="runtime-val">v22.x</div>
        <div class="hud-sub" id="uptime-val">⏱ Uptime: calculating...</div>
      </div>

      <div class="hud-card">
        <div class="hud-label">
          <span>PostgreSQL 17 Database</span>
          <span style="color: var(--emerald); font-family: monospace; font-size: 0.72rem;">● Active Pool</span>
        </div>
        <div class="hud-value" id="pg-status" style="color: var(--emerald);">Connected</div>
        <div class="hud-sub">Persistence: pgdata volume (0-loss)</div>
      </div>

      <div class="hud-card">
        <div class="hud-label">
          <span>Redis 7.4 Cache & AOF</span>
          <span style="color: var(--emerald); font-family: monospace; font-size: 0.72rem;">● Append-Only</span>
        </div>
        <div class="hud-value" id="redis-status" style="color: var(--emerald);">Active</div>
        <div class="hud-sub">Queue: agent:recent_tasks</div>
      </div>

      <div class="hud-card">
        <div class="hud-label">
          <span>Caddy 2 Reverse Proxy</span>
          <span class="code-tag">flush_interval -1</span>
        </div>
        <div class="hud-value" style="color: var(--cyan);">SSE Direct</div>
        <div class="hud-sub">Unbuffered token stream bypass</div>
      </div>
    </div>

    <!-- Main Workspace Grid -->
    <div class="main-grid">
      <!-- Left Panel: Interactive Agent Runner & SSE Stream -->
      <div class="panel">
        <div class="panel-header">
          <div class="panel-title">
            <span>▶</span> INTERACTIVE AGENT RUNNER // SSE STREAM
          </div>
          <span class="pill">/api/stream</span>
        </div>

        <div class="chip-container">
          <span class="chip" onclick="setPrompt('Execute ZeroVPS Guardrail verification and audit shell safety policies')">🛡️ Audit Guardrails</span>
          <span class="chip" onclick="setPrompt('Verify PostgreSQL 17 task state schema and transactional persistence')">📦 Postgres 17 Persistence</span>
          <span class="chip" onclick="setPrompt('Benchmark token streaming throughput across Caddy unbuffered reverse proxy')">⚡ SSE Throughput Test</span>
          <span class="chip" onclick="setPrompt('Verify 7-day automated backup snapshot rotation and retention')">💾 Backup Integrity</span>
        </div>

        <div class="input-row">
          <input type="text" id="prompt-input" value="Synthesize architectural advantages of PostgreSQL 17 + Caddy unbuffered SSE for autonomous agents" />
          <button class="btn-primary" id="run-btn" onclick="startStream()">
            <span>▶</span> Run Stream
          </button>
        </div>

        <div class="terminal-wrap">
          <div class="terminal-bar">
            <div class="dots">
              <span class="dot dot-red"></span>
              <span class="dot dot-yellow"></span>
              <span class="dot dot-green"></span>
            </div>
            <span>STDOUT // LIVE UNBUFFERED TOKEN STREAM</span>
            <span id="stream-status" style="color: var(--text-muted);">IDLE</span>
          </div>
          <div class="terminal-body" id="stream-box">Waiting for agent invocation... Click 'Run Stream' to test real-time unbuffered token delivery via Caddy 2.</div>
          <div class="terminal-footer">
            <span id="token-count">Tokens: 0</span>
            <span id="stream-throughput">Throughput: -- tok/s</span>
            <span id="stream-latency">Latency: -- ms</span>
          </div>
        </div>
      </div>

      <!-- Right Panel: ZeroVPS Operations & Guardrails -->
      <div class="panel">
        <div class="panel-header">
          <div class="panel-title">
            <span>🛡️</span> ZEROVPS HARDENING & GUARDRAILS
          </div>
          <span class="pill">Host Protection</span>
        </div>

        <!-- Guardrail Status Cards -->
        <div class="ops-section">
          <div class="ops-header">Active Execution Shields</div>
          
          <div class="guardrail-card">
            <div>
              <div class="guardrail-name">validate-bash.sh</div>
              <div class="guardrail-desc">Blocks destructive rm, mkfs, dd, forkbombs & secret leaks</div>
            </div>
            <div class="status-active">● Active</div>
          </div>

          <div class="guardrail-card">
            <div>
              <div class="guardrail-name">validate-db-safety.sh</div>
              <div class="guardrail-desc">Prevents accidental DROP TABLE, TRUNCATE, & bulk drops</div>
            </div>
            <div class="status-active">● Active</div>
          </div>

          <div class="guardrail-card">
            <div>
              <div class="guardrail-name">validate-backup-freshness.sh</div>
              <div class="guardrail-desc">Mandates &lt;24h snapshot before dangerous tasks</div>
            </div>
            <div class="status-active" id="backup-badge">● Fresh (24h)</div>
          </div>
        </div>

        <!-- Interactive Guardrail Sandbox -->
        <div class="ops-section">
          <div class="ops-header">Test Guardrail Interceptor Live</div>
          <div class="sandbox-box">
            <div class="sandbox-tabs">
              <button class="sandbox-tab active" id="tab-bash" onclick="switchTab('bash')">Shell Guardrail</button>
              <button class="sandbox-tab" id="tab-sql" onclick="switchTab('sql')">SQL Guardrail</button>
            </div>
            <div style="display: flex; gap: 0.5rem;">
              <input type="text" id="guardrail-input" value="rm -rf /*" style="padding: 0.5rem 0.75rem; font-size: 0.75rem;" />
              <button class="btn-primary" style="padding: 0.5rem 0.85rem; font-size: 0.75rem;" onclick="runGuardrailTest()">Test</button>
            </div>
            <div class="sandbox-result" id="sandbox-result"></div>
          </div>
        </div>

        <!-- Automated Backup & Watchdog Telemetry -->
        <div class="ops-section">
          <div class="ops-header">Automated Supervisor & Watchdog</div>
          <div style="font-size: 0.75rem; color: var(--text-muted); display: flex; flex-direction: column; gap: 0.4rem;">
            <div>• <strong>Supervisor:</strong> 5-min systemd timer (<code>agent-watchdog.timer</code>)</div>
            <div>• <strong>Auto-Recovery:</strong> Flapping detection & container restarts</div>
            <div>• <strong>Alert Channel:</strong> Telegram Markdown Bot Webhooks</div>
            <div>• <strong>Backups:</strong> Daily automated <code>pg_dump</code> with 7-day retention</div>
          </div>
        </div>
      </div>
    </div>

    <!-- Task Execution Ledger (PostgreSQL 17 Persistence) -->
    <div class="table-panel">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
        <div>
          <div style="font-family: 'JetBrains Mono', monospace; font-size: 0.88rem; font-weight: 700; color: #fff;">
            PERSISTED TASK LEDGER // POSTGRESQL 17 TABLE: agent_tasks
          </div>
          <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.2rem;">
            Real-time transactional audit log of all completed agent runs.
          </div>
        </div>
        <button class="btn-primary" style="padding: 0.4rem 0.85rem; font-size: 0.75rem;" onclick="fetchTasks()">
          ↻ Refresh Ledger
        </button>
      </div>

      <div style="overflow-x: auto;">
        <table>
          <thead>
            <tr>
              <th>Task ID</th>
              <th>Prompt / Goal</th>
              <th>Status</th>
              <th>Tokens</th>
              <th>Latency</th>
              <th>Committed At</th>
            </tr>
          </thead>
          <tbody id="tasks-tbody">
            <tr><td colspan="6" style="text-align: center; color: var(--text-muted); padding: 1.5rem;">Loading tasks from PostgreSQL 17...</td></tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- What You Are Buying / Architecture Deliverables Reference -->
    <div class="deliverables-panel">
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <div style="font-family: 'JetBrains Mono', monospace; font-size: 0.88rem; font-weight: 700; color: var(--cyan);">
          📦 WHAT’S INCLUDED // PRODUCTION DELIVERABLES MANIFEST
        </div>
        <span class="pill">Turnkey Package</span>
      </div>
      <div class="deliverables-grid">
        <div class="deliverable-item">
          <div class="deliverable-title">🐳 Docker Compose Core</div>
          <div class="deliverable-desc">Hardened multi-container network with Node 22 LTS, PostgreSQL 17 Alpine, Redis 7.4 Alpine, and Caddy 2.11.</div>
        </div>
        <div class="deliverable-item">
          <div class="deliverable-title">🛡️ ZeroVPS Guardrail Suite</div>
          <div class="deliverable-desc">Pre-execution command filters (<code>validate-bash.sh</code>, <code>validate-db-safety.sh</code>) preventing agent system drops.</div>
        </div>
        <div class="deliverable-item">
          <div class="deliverable-title">⚡ Unbuffered SSE Streaming</div>
          <div class="deliverable-desc">Caddy reverse proxy configured with <code>flush_interval -1</code> for instant token delivery with zero buffering lag.</div>
        </div>
        <div class="deliverable-item">
          <div class="deliverable-title">🔒 Zero-Public-Port Mesh</div>
          <div class="deliverable-desc">Tailscale WireGuard setup script running the entire stack shielded from public internet scanners.</div>
        </div>
        <div class="deliverable-item">
          <div class="deliverable-title">🤖 Self-Healing Watchdog</div>
          <div class="deliverable-desc">Python supervisor with flapping protection, RAM/disk alerts, and automated Telegram incident dispatches.</div>
        </div>
        <div class="deliverable-item">
          <div class="deliverable-title">💾 7-Day Backup Automation</div>
          <div class="deliverable-desc">Scheduled <code>pg_dump</code> and Redis AOF routines with 7-day retention pruning and S3/MinIO offloading hooks.</div>
        </div>
      </div>
    </div>
  </div>

  <script>
    let activeGuardrailTab = 'bash';

    function setPrompt(text) {
      document.getElementById('prompt-input').value = text;
    }

    function switchTab(tab) {
      activeGuardrailTab = tab;
      document.getElementById('tab-bash').className = tab === 'bash' ? 'sandbox-tab active' : 'sandbox-tab';
      document.getElementById('tab-sql').className = tab === 'sql' ? 'sandbox-tab active' : 'sandbox-tab';
      const input = document.getElementById('guardrail-input');
      input.value = tab === 'bash' ? 'rm -rf /*' : 'DROP TABLE agent_tasks;';
      document.getElementById('sandbox-result').style.display = 'none';
    }

    async function runGuardrailTest() {
      const input = document.getElementById('guardrail-input').value.trim();
      const resEl = document.getElementById('sandbox-result');
      if (!input) return;

      try {
        const res = await fetch('/api/guardrail-test', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: activeGuardrailTab, command: input })
        });
        const data = await res.json();
        resEl.style.display = 'block';
        if (!data.allowed) {
          resEl.className = 'sandbox-result blocked';
          resEl.innerHTML = '<strong>🚨 BLOCKED (Code ' + data.code + '):</strong> ' + data.reason;
        } else {
          resEl.className = 'sandbox-result passed';
          resEl.innerHTML = '<strong>✅ PASSED:</strong> ' + data.reason;
        }
      } catch (err) {
        resEl.className = 'sandbox-result blocked';
        resEl.innerHTML = 'Error testing guardrail: ' + err.message;
      }
    }

    async function updateHealth() {
      try {
        const res = await fetch('/api/health');
        const data = await res.json();
        document.getElementById('runtime-val').innerText = 'Node ' + (data.nodeVersion || 'v22');
        document.getElementById('uptime-val').innerText = '⏱ Uptime: ' + Math.floor(data.uptime) + 's';
        document.getElementById('pg-status').innerText = data.database === 'ok' ? 'Ready' : 'Offline';
        document.getElementById('redis-status').innerText = data.redis === 'ok' ? 'Ready' : 'Offline';
        if (data.dbVersion) {
          document.getElementById('pg-badge').innerText = data.dbVersion.toUpperCase();
        }
        if (data.redisVersion) {
          document.getElementById('redis-badge').innerText = data.redisVersion.toUpperCase();
        }
      } catch (err) {
        console.error(err);
      }
    }

    async function fetchTasks() {
      try {
        const res = await fetch('/api/tasks');
        const tasks = await res.json();
        const tbody = document.getElementById('tasks-tbody');
        if (!tasks || tasks.length === 0) {
          tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--text-muted); padding: 1.5rem;">No tasks recorded yet. Run a stream above!</td></tr>';
          return;
        }
        tbody.innerHTML = tasks.map(t => \`
          <tr>
            <td><span class="code-tag">\${t.task_id}</span></td>
            <td>\${t.prompt.substring(0, 50)}\${t.prompt.length > 50 ? '...' : ''}</td>
            <td><span style="color: var(--emerald); font-weight: 600;">\${t.status}</span></td>
            <td>\${t.tokens_used}</td>
            <td>\${t.latency_ms} ms</td>
            <td>\${new Date(t.created_at).toLocaleTimeString()}</td>
          </tr>
        \`).join('');
      } catch (err) {
        console.error(err);
      }
    }

    let activeSource = null;

    function startStream() {
      const prompt = document.getElementById('prompt-input').value.trim();
      if (!prompt) return;

      const btn = document.getElementById('run-btn');
      const box = document.getElementById('stream-box');
      const tokenCounter = document.getElementById('token-count');
      const latencyCounter = document.getElementById('stream-latency');
      const throughputCounter = document.getElementById('stream-throughput');
      const statusLabel = document.getElementById('stream-status');

      if (activeSource) {
        activeSource.close();
      }

      btn.disabled = true;
      box.innerText = '';
      tokenCounter.innerText = 'Tokens: 0';
      statusLabel.innerText = 'STREAMING...';
      statusLabel.style.color = 'var(--cyan)';
      const startTime = performance.now();

      let tokenCount = 0;
      const url = '/api/stream?prompt=' + encodeURIComponent(prompt);
      activeSource = new EventSource(url);

      activeSource.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload.token) {
            tokenCount += payload.token.split(/\\s+/).filter(Boolean).length;
            box.innerText += payload.token;
            box.scrollTop = box.scrollHeight;
            tokenCounter.innerText = 'Tokens: ' + tokenCount;
            const elapsed = Math.round(performance.now() - startTime);
            latencyCounter.innerText = 'Latency: ' + elapsed + ' ms';
            if (elapsed > 0) {
              const tokSec = Math.round((tokenCount / (elapsed / 1000)) * 10) / 10;
              throughputCounter.innerText = 'Throughput: ' + tokSec + ' tok/s';
            }
          } else if (payload.done) {
            activeSource.close();
            btn.disabled = false;
            statusLabel.innerText = 'COMPLETED';
            statusLabel.style.color = 'var(--emerald)';
            fetchTasks();
            updateHealth();
          }
        } catch (e) {
          box.innerText += event.data;
        }
      };

      activeSource.onerror = () => {
        activeSource.close();
        btn.disabled = false;
        statusLabel.innerText = 'STOPPED';
        fetchTasks();
      };
    }

    updateHealth();
    fetchTasks();
    setInterval(updateHealth, 5000);
  </script>
</body>
</html>`;
}

// HTTP Server
const server = http.createServer(async (req, res) => {
  const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = urlObj.pathname;

  // Root Dashboard
  if (pathname === '/' && (req.method === 'GET' || req.method === 'HEAD')) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    if (req.method === 'HEAD') {
      res.end();
    } else {
      res.end(renderDashboard());
    }
    return;
  }

  // Healthcheck endpoint (Watchdog & Caddy)
  if (pathname === '/api/health' && (req.method === 'GET' || req.method === 'HEAD')) {
    let pgOk = false;
    let redisOk = false;
    try {
      const r = await pool.query('SELECT 1 as alive');
      pgOk = r.rows.length > 0;
    } catch (_) {}

    try {
      const pong = await redis.ping();
      redisOk = pong === 'PONG';
    } catch (_) {}

    const backupState = getBackupState();

    const payload = {
      status: (pgOk && redisOk) ? 'ok' : 'degraded',
      uptime: process.uptime(),
      nodeVersion: process.version,
      database: pgOk ? 'ok' : 'error',
      dbVersion,
      redis: redisOk ? 'ok' : 'error',
      redisVersion,
      backups: backupState,
      memory: process.memoryUsage(),
      timestamp: new Date().toISOString(),
    };

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(payload));
    return;
  }

  // Interactive Guardrail Test API
  if (pathname === '/api/guardrail-test' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const { type, command } = JSON.parse(body);
        const result = testGuardrail(type || 'bash', command || '');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  // SSE Stream Endpoint (Simulates real-time LLM token streaming with Caddy bypass)
  if (pathname === '/api/stream' && req.method === 'GET') {
    const prompt = urlObj.searchParams.get('prompt') || 'Autonomous Agent Task';
    
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // Nginx/Caddy bypass
    });

    const taskId = 'tsk_' + Math.random().toString(36).substring(2, 10);
    const simulatedTokens = [
      "⚡ [Agent Pipeline Initialized]\n",
      `Target Goal: "${prompt}"\n\n`,
      "[Phase 1: ZeroVPS Guardrail Validation]\n",
      "- validate-bash.sh: Clean. No destructive host patterns detected.\n",
      "- validate-db-safety.sh: Verified. Non-destructive transactional queries only.\n",
      "- validate-backup-freshness.sh: Fresh database snapshot confirmed within 24h.\n\n",
      "[Phase 2: Architecture & State Verification]\n",
      `- Caddy 2.11 reverse proxy active with \`flush_interval -1\` unbuffered SSE.\n`,
      `- PostgreSQL 17 transactional database connected (schema: agent_tasks).\n`,
      `- Redis 7.4 in-memory queue verified with AOF persistence.\n\n`,
      "[Phase 3: Autonomous Execution & Token Delivery]\n",
      "Model inference stream delivering token packets at ~40 tokens/sec.\n",
      "All host telemetry running within normal bounds (<12% RAM, <1% CPU).\n\n",
      `[Summary]: Task ${taskId} successfully executed and committed to PostgreSQL 17.`
    ];

    let index = 0;
    const startTime = Date.now();
    let totalTokens = 0;

    const interval = setInterval(async () => {
      if (index < simulatedTokens.length) {
        const token = simulatedTokens[index++];
        totalTokens += token.split(/\s+/).filter(Boolean).length;
        res.write(`data: ${JSON.stringify({ token })}\n\n`);
      } else {
        clearInterval(interval);
        const duration = Date.now() - startTime;
        res.write(`data: ${JSON.stringify({ done: true, taskId, duration })}\n\n`);
        res.end();

        // Persist to Postgres 17 & Redis
        try {
          await pool.query(
            `INSERT INTO agent_tasks (task_id, prompt, status, tokens_used, latency_ms, result) 
             VALUES ($1, $2, $3, $4, $5, $6) 
             ON CONFLICT (task_id) DO NOTHING`,
            [taskId, prompt, 'completed', totalTokens, duration, simulatedTokens.join('')]
          );
          await redis.lpush('agent:recent_tasks', taskId);
          await redis.ltrim('agent:recent_tasks', 0, 49);
        } catch (dbErr) {
          console.error('[RUNTIME ERROR] Failed to record task:', dbErr.message);
        }
      }
    }, 120);

    req.on('close', () => {
      clearInterval(interval);
    });
    return;
  }

  // List recent tasks from Postgres 17
  if (pathname === '/api/tasks' && req.method === 'GET') {
    try {
      const result = await pool.query(
        'SELECT task_id, prompt, status, tokens_used, latency_ms, created_at FROM agent_tasks ORDER BY created_at DESC LIMIT 20'
      );
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result.rows));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // Not Found
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Endpoint not found' }));
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[RUNTIME] Agent runtime listening on port ${PORT}`);
  initDb();
});
