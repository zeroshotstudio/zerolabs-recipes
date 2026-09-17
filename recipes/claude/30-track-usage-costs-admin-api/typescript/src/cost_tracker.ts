/**
 * Anthropic Admin API Usage Cost Tracker & Prometheus Metrics Exporter (TypeScript).
 *
 * Tracks token consumption (input, output, cache creation, cache read) across
 * workspaces, computes dollar costs based on Anthropic published rates,
 * fetches organization audit events, and exposes Prometheus metrics.
 */

import http from "node:http";
import { Registry, Counter, Gauge, collectDefaultMetrics } from "prom-client";
import { z } from "zod";

// Pricing rates per 1,000,000 tokens in USD
export interface ModelRates {
  inputPerM: number;
  outputPerM: number;
  cacheWritePerM: number;
  cacheReadPerM: number;
}

export const MODEL_PRICING: Record<string, ModelRates> = {
  "claude-3-7-sonnet": {
    inputPerM: 3.0,
    outputPerM: 15.0,
    cacheWritePerM: 3.75,
    cacheReadPerM: 0.3,
  },
  "claude-3-5-sonnet": {
    inputPerM: 3.0,
    outputPerM: 15.0,
    cacheWritePerM: 3.75,
    cacheReadPerM: 0.3,
  },
  "claude-3-5-haiku": {
    inputPerM: 0.8,
    outputPerM: 4.0,
    cacheWritePerM: 1.0,
    cacheReadPerM: 0.08,
  },
  "claude-3-opus": {
    inputPerM: 15.0,
    outputPerM: 75.0,
    cacheWritePerM: 18.75,
    cacheReadPerM: 1.5,
  },
};

export const UsageRecordSchema = z.object({
  workspaceId: z.string().default("default"),
  model: z.string(),
  inputTokens: z.number().int().nonnegative().default(0),
  outputTokens: z.number().int().nonnegative().default(0),
  cacheCreationInputTokens: z.number().int().nonnegative().default(0),
  cacheReadInputTokens: z.number().int().nonnegative().default(0),
});

export type UsageRecord = z.infer<typeof UsageRecordSchema>;

export interface CostSummary {
  model: string;
  inputCost: number;
  outputCost: number;
  cacheWriteCost: number;
  cacheReadCost: number;
  totalCost: number;
  cacheReadRatio: number;
}

export function getPricingKey(modelName: string): string {
  const lower = modelName.toLowerCase();
  if (lower.includes("claude-3-7-sonnet")) return "claude-3-7-sonnet";
  if (lower.includes("claude-3-5-sonnet")) return "claude-3-5-sonnet";
  if (lower.includes("claude-3-5-haiku")) return "claude-3-5-haiku";
  if (lower.includes("claude-3-opus")) return "claude-3-opus";
  return "claude-3-7-sonnet";
}

export function calculateCost(record: UsageRecord): CostSummary {
  const key = getPricingKey(record.model);
  const rates = MODEL_PRICING[key] ?? MODEL_PRICING["claude-3-7-sonnet"];

  const inputCost = (record.inputTokens / 1_000_000.0) * rates.inputPerM;
  const outputCost = (record.outputTokens / 1_000_000.0) * rates.outputPerM;
  const cacheWriteCost = (record.cacheCreationInputTokens / 1_000_000.0) * rates.cacheWritePerM;
  const cacheReadCost = (record.cacheReadInputTokens / 1_000_000.0) * rates.cacheReadPerM;

  const totalCost = inputCost + outputCost + cacheWriteCost + cacheReadCost;
  const totalInput = record.inputTokens + record.cacheCreationInputTokens + record.cacheReadInputTokens;
  const cacheReadRatio = totalInput > 0 ? record.cacheReadInputTokens / totalInput : 0.0;

  return {
    model: record.model,
    inputCost: Number(inputCost.toFixed(6)),
    outputCost: Number(outputCost.toFixed(6)),
    cacheWriteCost: Number(cacheWriteCost.toFixed(6)),
    cacheReadCost: Number(cacheReadCost.toFixed(6)),
    totalCost: Number(totalCost.toFixed(6)),
    cacheReadRatio: Number(cacheReadRatio.toFixed(4)),
  };
}

export class MetricRegistryManager {
  public registry: Registry;
  public tokenUsageCounter: Counter<string>;
  public estimatedCostGauge: Gauge<string>;
  public cacheReadRatioGauge: Gauge<string>;
  public auditEventsCounter: Counter<string>;

  constructor() {
    this.registry = new Registry();
    collectDefaultMetrics({ register: this.registry });

    this.tokenUsageCounter = new Counter({
      name: "anthropic_tokens_total",
      help: "Total token consumption across workspaces and models",
      labelNames: ["workspace_id", "model", "token_type"],
      registers: [this.registry],
    });

    this.estimatedCostGauge = new Gauge({
      name: "anthropic_estimated_cost_dollars",
      help: "Estimated cumulative cost in USD by workspace and model",
      labelNames: ["workspace_id", "model"],
      registers: [this.registry],
    });

    this.cacheReadRatioGauge = new Gauge({
      name: "anthropic_cache_read_ratio",
      help: "Ratio of cache read tokens to total prompt tokens",
      labelNames: ["workspace_id", "model"],
      registers: [this.registry],
    });

    this.auditEventsCounter = new Counter({
      name: "anthropic_audit_events_total",
      help: "Total audit events ingested from Admin API",
      labelNames: ["event_type", "actor_type"],
      registers: [this.registry],
    });
  }

  public recordUsage(record: UsageRecord, summary: CostSummary): void {
    const { workspaceId, model } = record;
    this.tokenUsageCounter.labels({ workspace_id: workspaceId, model, token_type: "input" }).inc(record.inputTokens);
    this.tokenUsageCounter.labels({ workspace_id: workspaceId, model, token_type: "output" }).inc(record.outputTokens);
    this.tokenUsageCounter
      .labels({ workspace_id: workspaceId, model, token_type: "cache_creation" })
      .inc(record.cacheCreationInputTokens);
    this.tokenUsageCounter
      .labels({ workspace_id: workspaceId, model, token_type: "cache_read" })
      .inc(record.cacheReadInputTokens);

    this.estimatedCostGauge.labels({ workspace_id: workspaceId, model }).set(summary.totalCost);
    this.cacheReadRatioGauge.labels({ workspace_id: workspaceId, model }).set(summary.cacheReadRatio);
  }

  public startServer(port: number = 9090): http.Server {
    const server = http.createServer(async (req, res) => {
      if (req.url === "/metrics") {
        res.setHeader("Content-Type", this.registry.contentType);
        const metrics = await this.registry.metrics();
        res.writeHead(200);
        res.end(metrics);
        return;
      }
      res.writeHead(404);
      res.end("Not Found");
    });

    server.listen(port, () => {
      console.log(`[Prometheus] Server listening on :${port}/metrics`);
    });
    return server;
  }
}

export class AdminAPIClient {
  private adminKey: string;
  private baseUrl: string;

  constructor(adminKey: string, baseUrl: string = "https://api.anthropic.com") {
    this.adminKey = adminKey;
    this.baseUrl = baseUrl.replace(/\/+$/, "");
  }

  public async listWorkspaces(): Promise<Array<{ id: string; name: string }>> {
    const url = `${this.baseUrl}/v1/organizations/workspaces`;
    try {
      const resp = await fetch(url, {
        headers: {
          "x-api-key": this.adminKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
      });
      if (!resp.ok) {
        console.warn(`[AdminAPIClient] listWorkspaces failed with status ${resp.status}`);
        return [];
      }
      const data = (await resp.json()) as { data?: Array<{ id: string; name: string }> };
      return data.data ?? [];
    } catch (err) {
      console.error("[AdminAPIClient] Network error during listWorkspaces:", err);
      return [];
    }
  }

  public async fetchAuditLogs(limit: number = 50): Promise<Array<Record<string, unknown>>> {
    const url = `${this.baseUrl}/v1/organizations/audit_logs?limit=${limit}`;
    try {
      const resp = await fetch(url, {
        headers: {
          "x-api-key": this.adminKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
      });
      if (!resp.ok) {
        console.warn(`[AdminAPIClient] fetchAuditLogs failed with status ${resp.status}`);
        return [];
      }
      const data = (await resp.json()) as { data?: Array<Record<string, unknown>> };
      return data.data ?? [];
    } catch (err) {
      console.error("[AdminAPIClient] Network error during fetchAuditLogs:", err);
      return [];
    }
  }
}

export function runStandaloneDemo(): void {
  console.log("[Demo] Starting TypeScript Claude Cost Tracker verification...");

  const manager = new MetricRegistryManager();

  const samples: UsageRecord[] = [
    {
      workspaceId: "wrk_prod_inference",
      model: "claude-3-7-sonnet-20250219",
      inputTokens: 150000,
      outputTokens: 45000,
      cacheCreationInputTokens: 80000,
      cacheReadInputTokens: 720000,
    },
    {
      workspaceId: "wrk_batch_eval",
      model: "claude-3-5-haiku-20241022",
      inputTokens: 500000,
      outputTokens: 120000,
      cacheCreationInputTokens: 200000,
      cacheReadInputTokens: 1800000,
    },
  ];

  for (const record of samples) {
    const summary = calculateCost(record);
    manager.recordUsage(record, summary);
    console.log(
      `[Calculated] ${record.workspaceId} (${record.model}) -> Total: $${summary.totalCost.toFixed(4)} | Cache Read Ratio: ${(summary.cacheReadRatio * 100).toFixed(1)}%`
    );
  }

  console.log("[Demo] Verification complete. Prometheus metrics ready.");
}

if (process.argv[1]?.endsWith("cost_tracker.ts") || process.argv[1]?.endsWith("cost_tracker.js")) {
  runStandaloneDemo();
}
