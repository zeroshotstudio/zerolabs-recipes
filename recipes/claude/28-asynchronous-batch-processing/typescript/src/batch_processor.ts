import Anthropic from '@anthropic-ai/sdk';
import * as dotenv from 'dotenv';

dotenv.config();

const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  console.error('ERROR: ANTHROPIC_API_KEY environment variable is required.');
  process.exit(1);
}

const client = new Anthropic({ apiKey });

interface BatchPrompt {
  id: string;
  prompt: string;
}

interface ParsedBatchResult {
  customId: string;
  status: 'succeeded' | 'errored' | 'canceled' | 'expired';
  content?: string;
  error?: string;
  inputTokens?: number;
  outputTokens?: number;
}

async function createBatch(prompts: BatchPrompt[]) {
  console.log(`[+] Submitting batch containing ${prompts.length} requests...`);
  
  const requests = prompts.map((item) => ({
    custom_id: item.id,
    params: {
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 500,
      messages: [{ role: 'user' as const, content: item.prompt }]
    }
  }));

  const batch = await client.messages.batches.create({ requests });
  console.log(`[+] Batch created successfully! ID: ${batch.id}`);
  console.log(`    Processing status: ${batch.processing_status}`);
  return batch;
}

async function pollBatch(batchId: string, intervalSeconds: number = 5, timeoutSeconds: number = 300) {
  const startTime = Date.now();
  console.log(`[+] Polling batch status for ${batchId} every ${intervalSeconds}s...`);

  while (true) {
    const batch = await client.messages.batches.retrieve(batchId);
    const counts = batch.request_counts;
    console.log(
      `    Status: ${batch.processing_status} | ` +
      `Processing: ${counts.processing} | ` +
      `Succeeded: ${counts.succeeded} | ` +
      `Errored: ${counts.errored} | ` +
      `Canceled: ${counts.canceled} | ` +
      `Expired: ${counts.expired}`
    );

    if (batch.processing_status === 'ended') {
      console.log(`[+] Batch ended at ${batch.ended_at}`);
      return batch;
    }

    if ((Date.now() - startTime) / 1000 > timeoutSeconds) {
      console.log(`[!] Polling timed out after ${timeoutSeconds}s.`);
      return batch;
    }

    await new Promise((resolve) => setTimeout(resolve, intervalSeconds * 1000));
  }
}

async function streamResults(batchId: string): Promise<Map<string, ParsedBatchResult>> {
  console.log(`[+] Streaming results for batch ${batchId}...`);
  const results = new Map<string, ParsedBatchResult>();

  const resultsStream = await client.messages.batches.results(batchId);

  for await (const entry of resultsStream) {
    const customId = entry.custom_id;
    const resultType = entry.result.type;

    if (resultType === 'succeeded') {
      const msg = entry.result.message;
      const text = msg.content
        .filter((c) => c.type === 'text')
        .map((c) => (c as { type: 'text'; text: string }).text)
        .join('\n');

      results.set(customId, {
        customId,
        status: 'succeeded',
        content: text,
        inputTokens: msg.usage.input_tokens,
        outputTokens: msg.usage.output_tokens
      });
      console.log(`  [${customId}] SUCCEEDED (${msg.usage.input_tokens} in / ${msg.usage.output_tokens} out tokens)`);
    } else if (resultType === 'errored') {
      const err = entry.result.error;
      results.set(customId, {
        customId,
        status: 'errored',
        error: JSON.stringify(err)
      });
      console.log(`  [${customId}] ERRORED:`, err);
    } else if (resultType === 'canceled') {
      results.set(customId, { customId, status: 'canceled' });
      console.log(`  [${customId}] CANCELED`);
    } else if (resultType === 'expired') {
      results.set(customId, { customId, status: 'expired' });
      console.log(`  [${customId}] EXPIRED`);
    }
  }

  return results;
}

async function cancelBatch(batchId: string) {
  console.log(`[!] Requesting cancellation for batch ${batchId}...`);
  const batch = await client.messages.batches.cancel(batchId);
  console.log(`[!] Batch status: ${batch.processing_status}`);
  return batch;
}

async function main() {
  const samplePrompts: BatchPrompt[] = [
    { id: 'summary-01', prompt: 'Summarize the role of message batches in large data pipelines.' },
    { id: 'summary-02', prompt: 'List 3 architectural patterns for handling 24-hour asynchronous SLAs.' }
  ];

  const batch = await createBatch(samplePrompts);
  const finalBatch = await pollBatch(batch.id, 3, 60);

  if (finalBatch.processing_status === 'ended') {
    const results = await streamResults(batch.id);
    console.log(`\n[+] Finished streaming ${results.size} items.`);
  } else {
    console.log(`\n[*] Batch processing still active or timed out. Batch ID: ${batch.id}`);
  }
}

if (require.main === module) {
  main().catch(console.error);
}

export { createBatch, pollBatch, streamResults, cancelBatch };
