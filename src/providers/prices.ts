import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import { downloadText } from '../core/http.js';
import { isoDate, today, windowStart } from '../core/dates.js';
import { ok, unavailable, type Price, type Result } from '../core/types.js';

export const priceSchema = z.object({
  commodity: z.string().min(1).max(50),
  date: isoDate,
  price: z.number().positive().finite(),
  currency: z.string().regex(/^[A-Z]{3}$/),
  unit: z.string().min(1),
  benchmark: z.string().min(1),
  source: z.url().refine((value) => value.startsWith('https://')),
});

async function loadPrices(demo: boolean): Promise<Price[]> {
  if (demo)
    return [18, 19, 20].map((day, i) => ({
      commodity: 'lithium',
      date: `2026-09-${day}`,
      price: 10000 + i * 100,
      currency: 'USD',
      unit: 't',
      benchmark: 'SYNTHETIC lithium carbonate; NOT LME',
      source: 'https://example.org/synthetic/prices',
    }));
  const text = process.env.LME_PRICE_FILE
    ? await readFile(process.env.LME_PRICE_FILE, 'utf8')
    : process.env.LME_PRICE_URL
      ? await downloadText(process.env.LME_PRICE_URL)
      : undefined;
  if (!text) throw new Error('No licensed price data configured');
  const rows = z.array(priceSchema).max(100000).parse(JSON.parse(text));
  const keys = new Set<string>();
  for (const row of rows) {
    row.commodity = row.commodity.toLowerCase();
    const key = `${row.commodity}:${row.date}`;
    if (keys.has(key)) throw new Error('Ambiguous duplicate commodity/date');
    keys.add(key);
  }
  return rows;
}

export async function getPrice(
  commodity: string,
  date: string,
  demo = false,
): Promise<Result<Price>> {
  isoDate.parse(date);
  try {
    const row = (await loadPrices(demo)).find(
      (x) => x.commodity === commodity.toLowerCase() && x.date === date,
    );
    return row
      ? ok(row, demo)
      : unavailable('No quote for the exact requested commodity and date; no forward-fill', demo);
  } catch {
    return unavailable(
      'Price source missing, inaccessible, or invalid. Configure licensed LME_PRICE_FILE or LME_PRICE_URL.',
      demo,
    );
  }
}

export async function getTrend(
  commodity: string,
  days: number,
  demo = false,
  asOf = today(),
): Promise<Result<{ points: Price[]; changePct: number; requestedDays: number; asOf: string }>> {
  const since = windowStart(asOf, days);
  try {
    const points = (await loadPrices(demo))
      .filter((x) => x.commodity === commodity.toLowerCase() && x.date >= since && x.date <= asOf)
      .sort((a, b) => a.date.localeCompare(b.date));
    const first = points[0],
      last = points.at(-1);
    if (!first || !last || points.length < 2)
      return unavailable(
        'At least two observed prices are required in the requested date window',
        demo,
      );
    if (
      points.some(
        (x) =>
          x.unit !== first.unit || x.currency !== first.currency || x.benchmark !== first.benchmark,
      )
    )
      return unavailable('Mixed benchmark, currency, or unit; trend calculation refused', demo);
    return ok(
      { points, changePct: (last.price / first.price - 1) * 100, requestedDays: days, asOf },
      demo,
    );
  } catch {
    return unavailable('Price source missing, inaccessible, or invalid', demo);
  }
}
