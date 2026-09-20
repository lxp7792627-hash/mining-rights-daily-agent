import { describe, expect, it } from 'vitest';
import PDFDocument from 'pdfkit';
import { extractRows, parsePdf } from '../src/providers/resources.js';

const source = 'https://example.org/report.pdf';
describe('resource evidence and abstention', () => {
  it('reads explicit table headers without guessing units from numeric columns', () => {
    const result = extractRows(
      [
        {
          num: 3,
          text: 'Category | Ore (Mt) | Cu (%) | Contained copper (kt)\nIndicated | 10 | 1 | 100\nInferred | 5 | 0.8 | 40',
        },
      ],
      source,
    );
    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.data[0]?.contained).toBe(100000);
      expect(result.data[0]?.evidence).toContain('Ore (Mt)');
      expect(result.data).toHaveLength(2);
    }
  });
  it('does not reuse units across page breaks or intervening prose', () => {
    expect(
      extractRows(
        [
          { num: 1, text: 'Category | Ore (Mt) | Cu (%) | Contained copper (kt)' },
          { num: 2, text: 'Indicated | 10 | 1 | 100' },
        ],
        source,
      ).status,
    ).toBe('needs_review');
    expect(
      extractRows(
        [
          {
            num: 1,
            text: 'Category | Ore (Mt) | Cu (%) | Contained copper (kt)\nDifferent table\nIndicated | 10 | 1 | 100',
          },
        ],
        source,
      ).status,
    ).toBe('needs_review');
  });
  it('normalizes quantities and keeps both resource categories with page evidence', () => {
    const result = extractRows(
      [{ num: 7, text: 'Indicated 10000 kt 1 % Cu 100 kt\nInferred 5 Mt 0.8 % Cu 40000 t' }],
      source,
    );
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.data).toHaveLength(2);
    expect(result.data[0]).toMatchObject({ oreMt: 10, contained: 100000, page: 7, source });
  });
  it('converts gold koz to ounces', () => {
    const result = extractRows([{ num: 1, text: 'Indicated 1 Mt 1 g/t Au 32.15 koz' }], source);
    expect(result.status).toBe('ok');
    if (result.status === 'ok') expect(result.data[0]?.contained).toBe(32150);
  });
  it.each([
    'Indicated 10 Mt 1 % Cu 999999 t',
    'Indicated 10 Mt 1 % Cu 100000 oz',
    'Indicated 10 1 100000',
    'Indicated 0 Mt 1 % Cu 0 t',
    'Scanned image with no text',
    'Indicated 10 Mt 1 % Cu 100000 t\nInferred 5 0.8 40000',
  ])('abstains on unsafe or ambiguous content: %s', (text) => {
    expect(extractRows([{ num: 1, text }], source).status).toBe('needs_review');
  });
  it('accepts within 5% rounding tolerance and rejects beyond it', () => {
    expect(extractRows([{ num: 1, text: 'Indicated 10 Mt 1 % Cu 105000 t' }], source).status).toBe(
      'ok',
    );
    expect(extractRows([{ num: 1, text: 'Indicated 10 Mt 1 % Cu 105001 t' }], source).status).toBe(
      'needs_review',
    );
  });
  it('parses a real generated PDF byte stream, preserving rows and page numbers', async () => {
    const doc = new PDFDocument();
    const chunks: Buffer[] = [];
    const buffer = new Promise<Buffer>((resolve) => {
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
    });
    doc
      .font('Helvetica')
      .fontSize(11)
      .text('Indicated 10 Mt 1 % Cu 100000 t')
      .text('Inferred 5 Mt 0.8 % Cu 40000 t');
    doc.end();
    const result = await parsePdf(await buffer, source);
    expect(result.status).toBe('ok');
    if (result.status === 'ok') expect(result.data.map((x) => x.page)).toEqual([1, 1]);
  });
  it('rejects HTML masquerading as PDF', async () => {
    expect((await parsePdf(Buffer.from('<html>login</html>'), source)).status).toBe('needs_review');
  });
});
