import { parseArgs } from 'node:util';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { z } from 'zod';
import { isoDate, today } from '../core/dates.js';
import { collect, planRequest, render, type BriefOptions } from './briefing.js';

try {
  const { values } = parseArgs({
    options: {
      demo: { type: 'boolean', default: false },
      request: { type: 'string' },
      topic: { type: 'string' },
      commodity: { type: 'string' },
      date: { type: 'string' },
      days: { type: 'string', default: '7' },
      'pdf-url': { type: 'string' },
      out: { type: 'string' },
      help: { type: 'boolean' },
    },
  });
  if (values.help) {
    console.log(
      'Usage: npm run brief -- --request "给我生成一份关于 Pilbara 锂矿的今日简报" [--pdf-url https://...] [--out reports/today.md]\nOr: --topic Pilbara --commodity lithium [--date YYYY-MM-DD] [--days 7] [--demo]',
    );
  } else {
    const planned =
      values.request && !(values.topic && values.commodity)
        ? planRequest(values.request)
        : undefined;
    const options: BriefOptions = {
      topic: z
        .string()
        .trim()
        .min(1)
        .max(200)
        .parse(values.topic ?? planned?.topic ?? 'Pilbara'),
      commodity: z
        .string()
        .trim()
        .min(1)
        .max(50)
        .parse(values.commodity ?? planned?.commodity ?? 'lithium'),
      date: isoDate.parse(values.date ?? today()),
      days: z.coerce.number().int().min(1).max(365).parse(values.days),
      demo: values.demo,
      ...(values['pdf-url'] ? { pdfUrl: z.url().parse(values['pdf-url']) } : {}),
    };
    const data = await collect(options);
    const markdown = render(options, data);
    if (values.out) {
      await mkdir(dirname(values.out), { recursive: true });
      await writeFile(values.out, markdown, 'utf8');
      await writeFile(
        values.out + '.json',
        JSON.stringify({ options, data }, null, 2) + '\n',
        'utf8',
      );
      console.error(`Report written: ${values.out}`);
    } else process.stdout.write(markdown);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Brief generation failed');
  process.exitCode = 1;
}
