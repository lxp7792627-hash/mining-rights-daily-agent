import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getPrice, getTrend } from '../src/providers/prices.js';

const folders: string[] = [];
afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(folders.splice(0).map((path) => rm(path, { recursive: true })));
});
async function fixture(rows: unknown[]) {
  const directory = await mkdtemp(join(tmpdir(), 'mining-prices-'));
  folders.push(directory);
  const path = join(directory, 'prices.json');
  await writeFile(path, JSON.stringify(rows));
  vi.stubEnv('LME_PRICE_FILE', path);
}
const row = {
  commodity: 'copper',
  date: '2026-09-18',
  price: 100,
  currency: 'USD',
  unit: 't',
  benchmark: 'test',
  source: 'https://example.org/prices',
};
describe('prices', () => {
  it('never fills an absent date or substitutes commodities', async () => {
    expect((await getPrice('lithium', '2026-09-17', true)).status).toBe('unavailable');
    expect((await getPrice('copper', '2026-09-20', true)).status).toBe('unavailable');
  });
  it('calculates observed trend with bounded date window', async () => {
    const result = await getTrend('lithium', 7, true, '2026-09-20');
    expect(result.status).toBe('ok');
    if (result.status === 'ok') expect(result.data.changePct).toBeCloseTo(2);
    expect((await getTrend('lithium', 1, true, '2026-09-20')).status).toBe('unavailable');
  });
  it('reads configured licensed dataset and excludes future points', async () => {
    await fixture([
      row,
      { ...row, date: '2026-09-19', price: 110 },
      { ...row, date: '2026-09-21', price: 200 },
    ]);
    const result = await getTrend('copper', 7, false, '2026-09-20');
    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.data.points).toHaveLength(2);
      expect(result.data.changePct).toBeCloseTo(10);
    }
  });
  it.each(['unit', 'currency', 'benchmark'])('rejects mixed %s', async (field) => {
    await fixture([
      row,
      { ...row, date: '2026-09-19', [field]: field === 'currency' ? 'CNY' : 'different' },
    ]);
    expect((await getTrend('copper', 7, false, '2026-09-20')).status).toBe('unavailable');
  });
  it('rejects duplicate commodity/date rather than choosing an arbitrary row', async () => {
    await fixture([row, row]);
    expect((await getPrice('copper', row.date)).status).toBe('unavailable');
  });
  it('rejects invalid calendar date', async () => {
    await expect(getPrice('copper', '2026-02-30')).rejects.toThrow();
  });
});
