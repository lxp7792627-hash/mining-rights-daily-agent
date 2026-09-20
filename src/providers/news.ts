import Parser from 'rss-parser';
import { load } from 'cheerio';
import { downloadText } from '../core/http.js';
import { today, windowStart } from '../core/dates.js';
import { ok, unavailable, type Article, type Result } from '../core/types.js';

const demoArticles: Article[] = [
  {
    title: '[SYNTHETIC] Pilbara lithium project quarterly operating update',
    url: 'https://example.org/synthetic/pilbara-news',
    publishedAt: '2026-09-19',
    summary:
      'Synthetic test article: the fictional project is reviewing production costs and expansion timing. This is not a company announcement.',
  },
];

export async function searchNews(
  query: string,
  days: number,
  demo = false,
  asOf = today(),
): Promise<Result<{ articles: Article[]; warnings: string[] }>> {
  const since = windowStart(asOf, days);
  const warnings: string[] = [];
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  let candidates = demoArticles;
  if (!demo) {
    const feeds = (
      process.env.NEWS_FEEDS ??
      'https://www.mining.com/feed/,https://www.miningweekly.com/page/home/feed,https://www.mining-technology.com/feed/'
    )
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean);
    const results = await Promise.allSettled(
      feeds.slice(0, 8).map(async (url) => {
        const parsed = await new Parser().parseString(await downloadText(url));
        return parsed.items.flatMap((item) => {
          const timestamp = Date.parse(item.isoDate ?? item.pubDate ?? '');
          if (!item.title || !item.link || !Number.isFinite(timestamp)) return [];
          let link: URL;
          try {
            link = new URL(item.link);
          } catch {
            return [];
          }
          if (link.protocol !== 'https:' || link.username || link.password) return [];
          link.hash = '';
          return [
            {
              title: item.title,
              url: link.href,
              publishedAt: new Date(timestamp).toISOString().slice(0, 10),
              summary: load(item.contentSnippet ?? item.content ?? '')
                .text()
                .slice(0, 1500),
            },
          ];
        });
      }),
    );
    candidates = [];
    for (const result of results) {
      if (result.status === 'fulfilled') candidates.push(...result.value);
      else warnings.push('A configured RSS feed could not be fetched or parsed.');
    }
    if (results.every((x) => x.status === 'rejected'))
      return unavailable('All configured RSS feeds failed');
  }
  const seen = new Set<string>();
  const articles = candidates
    .filter((article) => {
      const text = `${article.title} ${article.summary}`.toLowerCase();
      if (
        article.publishedAt < since ||
        article.publishedAt > asOf ||
        !terms.every((t) => text.includes(t)) ||
        seen.has(article.url)
      )
        return false;
      seen.add(article.url);
      return true;
    })
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
    .slice(0, 20);
  return ok({ articles, warnings }, demo);
}

export async function fetchArticle(
  url: string,
  demo = false,
): Promise<Result<{ url: string; text: string }>> {
  if (demo) {
    const article = demoArticles.find((a) => a.url === url);
    return article
      ? ok({ url, text: article.summary }, true)
      : unavailable('No such demo article', true);
  }
  try {
    const $ = load(await downloadText(url));
    $('script, style, nav, footer, header, aside').remove();
    const body = $('article').first().text() || $('main').first().text() || $('body').text();
    const text = body.replace(/\s+/g, ' ').trim().slice(0, 16000);
    return text.length >= 100
      ? ok({ url, text })
      : unavailable('Article text is empty or access-restricted');
  } catch {
    return unavailable('Article could not be retrieved; no paywall bypass attempted');
  }
}
