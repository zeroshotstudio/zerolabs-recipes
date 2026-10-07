#!/usr/bin/env node
/**
 * ZeroLabs Self-Hosted Agent Starter (Node.js / OpenClaw)
 * ------------------------------------------------------
 * Connects to your self-hosted agent stack in 1 click.
 * Pre-wired with PostgreSQL 17 task persistence and Redis 7.4 task queue.
 */

const http = require('http');

const AGENT_HOST = process.env.AGENT_HOST || 'http://127.0.0.1:3080';
const AGENT_NAME = process.env.AGENT_NAME || 'node-agent-worker';
const FRAMEWORK = 'openclaw-node';

async function sendRequest(path, data) {
  const url = new URL(path, AGENT_HOST);
  const body = JSON.stringify(data);
  return new Promise((resolve, reject) => {
    const req = http.request(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      },
      timeout: 5000
    }, (res) => {
      let raw = '';
      res.on('data', chunk => raw += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(raw) });
        } catch (_) {
          resolve({ status: res.statusCode, data: raw });
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function main() {
  console.log(`--- ZeroLabs Agent Starter (${AGENT_NAME}) ---`);
  try {
    // 1. Send Heartbeat Ping
    const pingRes = await sendRequest('/api/agent/ping', {
      name: AGENT_NAME,
      framework: FRAMEWORK,
      version: '1.0.0'
    });
    console.log(`[OK] Registered with stack:`, pingRes.data.message || 'Connected');

    // 2. Dispatch Task
    const prompt = process.argv[2] || 'Automated multi-agent workflow verification';
    console.log(`Dispatching task: "${prompt}"...`);
    const dispatchRes = await sendRequest('/api/agent/dispatch', {
      agent_name: AGENT_NAME,
      framework: FRAMEWORK,
      prompt
    });
    console.log(`[SUCCESS] Task ID: ${dispatchRes.data.task_id} committed to PostgreSQL 17!`);
    console.log(`Guardrails: ${dispatchRes.data.guardrail_status} | Latency: ${dispatchRes.data.latency_ms}ms`);
  } catch (err) {
    console.error(`[ERROR] Connection failed:`, err.message);
    process.exit(1);
  }
}

main();
