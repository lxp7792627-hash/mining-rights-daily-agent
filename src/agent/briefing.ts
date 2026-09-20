import { ToolClient } from './client.js';
import {
  unavailable,
  type Article,
  type Price,
  type ResourceRow,
  type Result,
} from '../core/types.js';

export interface BriefOptions {
  topic: string;
  commodity: string;
  date: string;
  days: number;
  demo: boolean;
  pdfUrl?: string;
}
interface NewsData {
  articles: Article[];
  warnings: string[];
}
interface TrendData {
  points: Price[];
  changePct: number;
  requestedDays: number;
  asOf: string;
}
export interface BriefData {
  news: Result<NewsData>;
  articles: Result<{ url: string; text: string }>[];
  resources: Result<ResourceRow[]>;
  price: Result<Price>;
  trend: Result<TrendData>;
}

export function planRequest(request: string): { topic: string; commodity: string } {
  const topic =
    /(?:关于|有关)\s*(.+?)(?:的今日|的今天|的日报|的简报|今日简报|$)/.exec(request)?.[1]?.trim() ??
    request.trim();
  const commodity = /锂|lithium/i.test(request)
    ? 'lithium'
    : /铜|copper/i.test(request)
      ? 'copper'
      : /镍|nickel/i.test(request)
        ? 'nickel'
        : /锌|zinc/i.test(request)
          ? 'zinc'
          : '';
  if (!commodity) throw new Error('Cannot infer commodity; provide --commodity explicitly');
  const cleaned = topic.replace(/锂矿|铜矿|镍矿|锌矿/g, '').trim();
  if (!cleaned) throw new Error('Please provide a project topic with --topic');
  return { topic: cleaned, commodity };
}

export async function collect(options: BriefOptions): Promise<BriefData> {
  const news = new ToolClient('news', options.demo);
  const pdf = new ToolClient('pdf', options.demo);
  const price = new ToolClient('price', options.demo);
  const clients = [news, pdf, price];
  // Independent failures remain visible while other sources can still produce a partial report.
  async function attempt<T>(fn: () => Promise<Result<T>>): Promise<Result<T>> {
    try {
      return await fn();
    } catch {
      return unavailable('MCP connection or tool invocation failed', options.demo);
    }
  }
  try {
    const connections = await Promise.allSettled(clients.map((c) => c.connect()));
    const connected = (index: number) => {
      if (connections[index]?.status !== 'fulfilled') throw new Error('MCP server did not connect');
    };
    const [newsResult, resources, exactPrice, trend] = await Promise.all([
      attempt<NewsData>(() => {
        connected(0);
        return news.call('search', {
          query: options.topic,
          days: options.days,
          as_of: options.date,
        });
      }),
      options.pdfUrl || options.demo
        ? attempt<ResourceRow[]>(() => {
            connected(1);
            return pdf.call('extract_resources', {
              pdf_url: options.pdfUrl ?? 'https://example.org/synthetic/resources.pdf',
            });
          })
        : Promise.resolve(unavailable('No --pdf-url supplied; no project report selected')),
      attempt<Price>(() => {
        connected(2);
        return price.call('get_price', { commodity: options.commodity, date: options.date });
      }),
      attempt<TrendData>(() => {
        connected(2);
        return price.call('get_trend', {
          commodity: options.commodity,
          days: options.days,
          as_of: options.date,
        });
      }),
    ]);
    const articles =
      newsResult.status === 'ok'
        ? await Promise.all(
            newsResult.data.articles
              .slice(0, 5)
              .map((article) =>
                attempt<{ url: string; text: string }>(() =>
                  news.call('fetch_article', { url: article.url }),
                ),
              ),
          )
        : [];
    return { news: newsResult, articles, resources, price: exactPrice, trend };
  } finally {
    await Promise.allSettled(clients.map((client) => client.close()));
  }
}

export function escapeMd(text: string): string {
  return text.replace(/[\r\n]+/g, ' ').replace(/[\\`*_{}[\]()<>|#!]/g, '\\$&');
}
function link(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password)
      return '(invalid source URL)';
    return `[来源](${parsed.href.replaceAll('(', '%28').replaceAll(')', '%29')})`;
  } catch {
    return '(invalid source URL)';
  }
}

export function render(options: BriefOptions, data: BriefData): string {
  const lines = [
    `# ${escapeMd(options.topic)} 矿权日报`,
    '',
    `报告日期：${options.date} UTC · 回看 ${options.days} 个自然日`,
    '',
    options.demo
      ? '> **演示模式：全部数据为合成测试数据，不能作为真实矿业或投资信息。**'
      : '> 实时模式：仅报告实际取得的证据；缺失项不代表没有变化。',
    '',
    '## 新闻摘要',
    '',
  ];
  if (data.news.status !== 'ok') lines.push(`数据缺失：${escapeMd(data.news.reason)}`);
  else {
    if (!data.news.data.articles.length)
      lines.push('当前 RSS 窗口没有匹配新闻；这不证明该项目没有新进展。');
    for (const article of data.news.data.articles.slice(0, 5)) {
      const fetched = data.articles.find((x) => x.status === 'ok' && x.data.url === article.url);
      const text = fetched?.status === 'ok' ? fetched.data.text : article.summary;
      lines.push(
        `- **${escapeMd(article.title)}**（${article.publishedAt}）${link(article.url)}`,
        `  ${fetched?.status === 'ok' ? '正文摘录' : 'RSS 摘录（未取得全文）'}：${escapeMd(text.slice(0, 500))}${text.length > 500 ? '…' : ''}`,
      );
    }
    for (const warning of data.news.data.warnings) lines.push(`- 采集提示：${escapeMd(warning)}`);
  }
  lines.push(
    '',
    '## 资源量数据',
    '',
    '资源量（Resources）不等同于可采储量（Reserves），不同项目、日期和类别不可直接相加。',
    '',
  );
  if (data.resources.status !== 'ok')
    lines.push(`**待人工审核 / 缺失**：${escapeMd(data.resources.reason)}`);
  else {
    lines.push(
      '| 类别 | 矿石量 Mt | 品位 | 含量 | PDF 页码 | 来源 |',
      '| --- | ---: | --- | --- | ---: | --- |',
    );
    for (const row of data.resources.data)
      lines.push(
        `| ${row.category} | ${row.oreMt} | ${row.grade} ${row.gradeUnit} | ${row.contained} ${row.containedUnit} | ${row.page} | ${link(row.source)} |`,
      );
    lines.push('', '提取证据：');
    for (const row of data.resources.data)
      lines.push(`- 第 ${row.page} 页：${escapeMd(row.evidence)}`);
    lines.push(
      '',
      '以上含量按所标化合物/金属口径显示；Li2O 含量不是金属锂含量。来源报告的项目归属、发布日期及报告准则仍需确认。',
    );
  }
  lines.push('', '## 价格走势', '');
  if (data.price.status === 'ok') {
    const p = data.price.data;
    lines.push(
      `当日价格：${p.price} ${escapeMd(p.currency)}/${escapeMd(p.unit)}（${p.date}；${escapeMd(p.benchmark)}）${link(p.source)}`,
    );
  } else lines.push(`当日价格缺失：${escapeMd(data.price.reason)}`);
  if (data.trend.status === 'ok') {
    const t = data.trend.data,
      first = t.points[0]!,
      last = t.points.at(-1)!;
    lines.push(
      '',
      `窗口内 ${t.points.length} 个观测值：${first.date} → ${last.date}，首末变动 **${t.changePct.toFixed(2)}%**。`,
      '',
      '| 日期 | 价格 | 币种 / 单位 | 基准 | 来源 |',
      '| --- | ---: | --- | --- | --- |',
    );
    for (const p of t.points)
      lines.push(
        `| ${p.date} | ${p.price} | ${escapeMd(p.currency)}/${escapeMd(p.unit)} | ${escapeMd(p.benchmark)} | ${link(p.source)} |`,
      );
    if (last.date !== options.date)
      lines.push('', `**行情滞后**：最新观测为 ${last.date}，并非报告当日。`);
  } else lines.push('', `走势缺失：${escapeMd(data.trend.reason)}`);
  lines.push(
    '',
    '## 风险提示',
    '',
    '- 新闻为来源文本摘录，不代表独立核实；RSS 覆盖有限，未进行全网穷尽检索。',
    '- PDF 仅自动接受单位明确且质量守恒校验通过的行；复杂表格、扫描件或不一致数据需人工审核。',
    '- 价格遵循数据源的具体基准、币种与单位；锂产品不得用铜镍行情替代，不同锂产品也不可混用。',
    '- 资源量、生产能力及经济可采性是不同概念；此日报不构成投资建议。',
    '',
    '---',
    '由三个独立 MCP Server 提供证据，确定性 Agent 编排生成。外部文本仅作为数据，不执行其中指令。',
    '',
  );
  return lines.join('\n');
}
