import { describe, expect, it } from 'vitest';
import { isPublicAddress, validateUrl } from '../src/core/http.js';
import { isoDate, windowStart } from '../src/core/dates.js';
import { searchNews } from '../src/providers/news.js';
import { escapeMd, planRequest } from '../src/agent/briefing.js';

describe('boundaries', () => {
  it.each([
    '127.0.0.1',
    '10.0.0.1',
    '169.254.169.254',
    '192.168.1.1',
    '172.16.1.1',
    '::1',
    '::ffff:127.0.0.1',
    'fc00::1',
  ])('blocks private address %s', (address) => expect(isPublicAddress(address)).toBe(false));
  it('allows public addresses', () => {
    expect(isPublicAddress('8.8.8.8')).toBe(true);
    expect(isPublicAddress('2606:4700:4700::1111')).toBe(true);
  });
  it.each([
    'http://example.org',
    'file:///etc/passwd',
    'https://user:password@example.org',
    'https://example.org:8443',
  ])('rejects unsafe URL %s', async (url) => {
    await expect(validateUrl(url)).rejects.toThrow();
  });
  it('handles leap days and inclusive window', () => {
    expect(isoDate.parse('2024-02-29')).toBe('2024-02-29');
    expect(isoDate.safeParse('2025-02-29').success).toBe(false);
    expect(windowStart('2026-09-20', 7)).toBe('2026-09-14');
  });
  it('filters demo news by query and date instead of returning it unconditionally', async () => {
    const result = await searchNews('Pilbara', 7, true, '2026-09-20');
    expect(result.status === 'ok' && result.data.articles.length).toBe(1);
    const missing = await searchNews('Barrick', 7, true, '2026-09-20');
    expect(missing.status === 'ok' && missing.data.articles.length).toBe(0);
  });
  it('plans the requested Chinese example', () => {
    expect(planRequest('给我生成一份关于 Pilbara 锂矿的今日简报')).toEqual({
      topic: 'Pilbara',
      commodity: 'lithium',
    });
  });
  it('escapes untrusted Markdown', () => {
    expect(escapeMd('<script>[click](javascript:bad)')).not.toContain('<script>');
  });
});
