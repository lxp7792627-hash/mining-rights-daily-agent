import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { CallToolResultSchema } from '@modelcontextprotocol/sdk/types.js';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import type { Result } from '../core/types.js';

const envelope = z.discriminatedUnion('status', [
  z.object({ status: z.literal('ok'), data: z.unknown(), demo: z.boolean() }),
  z.object({
    status: z.enum(['unavailable', 'needs_review']),
    reason: z.string(),
    demo: z.boolean(),
  }),
]);

export class ToolClient {
  private client: Client;
  private transport: StdioClientTransport;
  constructor(kind: 'news' | 'pdf' | 'price', demo: boolean) {
    this.client = new Client({ name: `daily-agent-${kind}`, version: '1.0.0' });
    const env: Record<string, string> = {};
    for (const key of [
      'PATH',
      'Path',
      'SystemRoot',
      'TEMP',
      'TMP',
      'HOME',
      'NEWS_FEEDS',
      'LME_PRICE_FILE',
      'LME_PRICE_URL',
      'ALLOWED_HOSTS',
    ]) {
      if (process.env[key] !== undefined) env[key] = process.env[key];
    }
    env.DATA_MODE = demo ? 'demo' : 'live';
    this.transport = new StdioClientTransport({
      command: process.execPath,
      args: [fileURLToPath(new URL('../../dist/servers/main.js', import.meta.url)), kind],
      env,
      stderr: 'inherit',
    });
  }
  async connect(): Promise<void> {
    await this.client.connect(this.transport, { timeout: 15000 });
  }
  async list(): Promise<string[]> {
    return (await this.client.listTools()).tools.map((tool) => tool.name);
  }
  async call<T>(name: string, args: Record<string, unknown>): Promise<Result<T>> {
    const result = CallToolResultSchema.parse(
      await this.client.callTool({ name, arguments: args }, undefined, { timeout: 60000 }),
    );
    if (result.isError) throw new Error(`MCP tool ${name} failed`);
    const block = result.content.find((item) => item.type === 'text');
    if (!block || block.type !== 'text') throw new Error('MCP tool returned no text payload');
    return envelope.parse(JSON.parse(block.text)) as Result<T>;
  }
  async close(): Promise<void> {
    await this.client.close();
  }
}
