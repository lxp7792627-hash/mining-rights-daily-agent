import { PDFParse } from 'pdf-parse';
import { download } from '../core/http.js';
import { ok, type ResourceRow, type Result } from '../core/types.js';

const number = '([0-9]+(?:,[0-9]{3})*(?:\\.[0-9]+)?)';
// Accept only rows with explicit per-value units. Ambiguous table layouts must be reviewed.
const rowPattern = new RegExp(
  `^\\s*(Indicated|Inferred)\\s*[|:]?\\s*${number}\\s*(Mt|kt|t)\\s*[|,;]?\\s*${number}\\s*(g/t\\s*Au|%\\s*Cu|%\\s*Li2O)\\s*[|,;]?\\s*${number}\\s*(Moz|koz|oz|kt|t)\\s*$`,
  'i',
);

interface TableHeader {
  ore: string;
  grade: string;
  metal: string;
  evidence: string;
}

function cells(line: string): string[] {
  return line
    .trim()
    .replace(/^\||\|$/g, '')
    .split(/\s*\|\s*|\t+| {2,}/)
    .map((x) => x.trim());
}

function tableHeader(line: string): TableHeader | undefined {
  const columns = cells(line);
  if (columns.length !== 4 || !/category|classification|resource/i.test(columns[0] ?? '')) return;
  const ore = /(?:tonnes|tonnage|ore).*\b(Mt|kt|t)\b/i.exec(columns[1] ?? '')?.[1];
  const gradeText = columns[2] ?? '';
  const grade =
    /Au/i.test(gradeText) && /g\/t/i.test(gradeText)
      ? 'g/t Au'
      : /Cu/i.test(gradeText) && /%/.test(gradeText)
        ? '% Cu'
        : /Li2O/i.test(gradeText) && /%/.test(gradeText)
          ? '% Li2O'
          : undefined;
  const metal = /(?:contained|metal|gold|copper|Li2O).*\b(Moz|koz|oz|kt|t)\b/i.exec(
    columns[3] ?? '',
  )?.[1];
  if (ore && grade && metal) return { ore, grade, metal, evidence: line.trim() };
}

export function extractRows(
  pages: { num: number; text: string }[],
  source: string,
): Result<ResourceRow[]> {
  const rows: ResourceRow[] = [];
  let suspicious = false;
  for (const page of pages) {
    let header: TableHeader | undefined;
    for (const line of page.text.split(/\r?\n/)) {
      const detectedHeader = tableHeader(line);
      if (detectedHeader) {
        header = detectedHeader;
        continue;
      }
      let candidate = line;
      let evidence = line.trim();
      if (header && /^\s*(Indicated|Inferred)\b/i.test(line)) {
        const values = cells(line);
        if (
          values.length === 4 &&
          values.slice(1).every((value) => new RegExp(`^${number}$`).test(value))
        ) {
          candidate = `${values[0]} ${values[1]} ${header.ore} ${values[2]} ${header.grade} ${values[3]} ${header.metal}`;
          evidence = `${header.evidence} / ${line.trim()}`;
        }
      } else if (line.trim() && !/^[\s|:-]+$/.test(line)) {
        // Do not carry units across prose, another section, or a page break.
        header = undefined;
      }
      const match = rowPattern.exec(candidate);
      if (!match) {
        if (/\b(indicated|inferred)\b.*\d/i.test(line)) suspicious = true;
        continue;
      }
      const [, category, oreRaw, oreUnit, gradeRaw, gradeUnitRaw, metalRaw, metalUnitRaw] = match;
      if (
        !category ||
        !oreRaw ||
        !oreUnit ||
        !gradeRaw ||
        !gradeUnitRaw ||
        !metalRaw ||
        !metalUnitRaw
      )
        continue;
      const numeric = (value: string) => Number(value.replaceAll(',', ''));
      const oreMt =
        numeric(oreRaw) * ({ mt: 1, kt: 0.001, t: 0.000001 }[oreUnit.toLowerCase()] ?? 1);
      const grade = numeric(gradeRaw);
      const gradeUnit = /au/i.test(gradeUnitRaw)
        ? 'g/t Au'
        : /cu/i.test(gradeUnitRaw)
          ? '% Cu'
          : '% Li2O';
      const metalUnit = metalUnitRaw.toLowerCase();
      const containedUnit = metalUnit.endsWith('oz') ? 'oz' : 't';
      const contained = numeric(metalRaw) * ({ moz: 1e6, koz: 1e3, kt: 1e3 }[metalUnit] ?? 1);
      const expected =
        gradeUnit === 'g/t Au' ? (oreMt * 1e6 * grade) / 31.1034768 : (oreMt * 1e6 * grade) / 100;
      if (
        oreMt <= 0 ||
        grade <= 0 ||
        contained <= 0 ||
        !Number.isFinite(expected) ||
        (gradeUnit !== 'g/t Au' && grade > 100) ||
        (gradeUnit === 'g/t Au' ? containedUnit !== 'oz' : containedUnit !== 't') ||
        Math.abs(contained - expected) / expected > 0.05
      ) {
        suspicious = true;
        continue;
      }
      rows.push({
        category: /^indicated$/i.test(category) ? 'Indicated' : 'Inferred',
        oreMt,
        grade,
        gradeUnit,
        contained,
        containedUnit,
        page: page.num,
        evidence,
        source,
      });
    }
  }
  if (suspicious || !rows.length)
    return {
      status: 'needs_review',
      reason:
        'Missing, ambiguous, or inconsistent resource rows. Manual review required; no resource total asserted.',
      demo: false,
    };
  return ok(rows);
}

export async function parsePdf(bytes: Uint8Array, source: string): Promise<Result<ResourceRow[]>> {
  if (Buffer.from(bytes.subarray(0, 5)).toString() !== '%PDF-')
    return { status: 'needs_review', reason: 'Response is not a PDF', demo: false };
  const parser = new PDFParse({ data: bytes });
  try {
    const info = await parser.getInfo();
    if (info.total > 300)
      return {
        status: 'needs_review',
        reason: 'PDF exceeds 300-page processing limit',
        demo: false,
      };
    const text = await parser.getText();
    return extractRows(text.pages, source);
  } finally {
    await parser.destroy();
  }
}

export async function extractResources(url: string, demo = false): Promise<Result<ResourceRow[]>> {
  if (demo) {
    const result = extractRows(
      [{ num: 1, text: 'Indicated 10 Mt 1 % Li2O 100000 t\nInferred 5 Mt 0.8 % Li2O 40000 t' }],
      'https://example.org/synthetic/resources.pdf',
    );
    return { ...result, demo: true };
  }
  try {
    return await parsePdf(await download(url, 20_000_000), url);
  } catch {
    return {
      status: 'needs_review',
      reason: 'PDF retrieval or parsing failed; manual review required',
      demo: false,
    };
  }
}
