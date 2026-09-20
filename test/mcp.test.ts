import { describe, expect, it } from 'vitest';
import { ToolClient } from '../src/agent/client.js';
import { collect, render, type BriefOptions } from '../src/agent/briefing.js';

describe('real MCP stdio integration', () => {
  it.each([
    ['news', ['search', 'fetch_article']],
    ['pdf', ['extract_resources']],
    ['price', ['get_price', 'get_trend']],
  ] as const)(
    '%s server initializes and advertises required tools',
    async (kind, expected) => {
      const client = new ToolClient(kind, true);
      try {
        await client.connect();
        expect(await client.list()).toEqual(expect.arrayContaining([...expected]));
      } finally {
        await client.close();
      }
    },
    30000,
  );
  it('generates complete cited demo through three subprocess servers', async () => {
    const options: BriefOptions = {
      topic: 'Pilbara',
      commodity: 'lithium',
      date: '2026-09-20',
      days: 7,
      demo: true,
    };
    const data = await collect(options);
    expect(data.news.status).toBe('ok');
    expect(data.resources.status).toBe('ok');
    expect(data.price.status).toBe('ok');
    expect(data.trend.status).toBe('ok');
    expect(data.articles[0]?.status).toBe('ok');
    const report = render(options, data);
    expect(report).toContain('合成测试数据');
    expect(report).toContain('2.00%');
    expect(report).toContain('https://example.org/synthetic/resources.pdf');
    expect(report).toContain('Inferred');
    expect(report).toContain('风险提示');
  }, 60000);
  it('returns explicit missing prices instead of demo fallback for another commodity', async () => {
    const client = new ToolClient('price', true);
    try {
      await client.connect();
      expect(
        (await client.call('get_price', { commodity: 'copper', date: '2026-09-20' })).status,
      ).toBe('unavailable');
      await expect(
        client.call('get_price', { commodity: 'copper', date: 'bad' }),
      ).rejects.toThrow();
    } finally {
      await client.close();
    }
  }, 30000);
});
