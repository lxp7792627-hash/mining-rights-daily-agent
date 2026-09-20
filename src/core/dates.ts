import { z } from 'zod';

export const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const timestamp = Date.parse(value + 'T00:00:00Z');
    return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value;
  }, 'Expected a real calendar date (YYYY-MM-DD)');

export function windowStart(date: string, days: number): string {
  isoDate.parse(date);
  z.number().int().min(1).max(365).parse(days);
  return new Date(Date.parse(date + 'T00:00:00Z') - (days - 1) * 86400000)
    .toISOString()
    .slice(0, 10);
}

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}
