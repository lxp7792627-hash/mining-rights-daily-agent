export type Result<T> =
  | { status: 'ok'; data: T; demo: boolean }
  | { status: 'unavailable' | 'needs_review'; reason: string; demo: boolean };

export const ok = <T>(data: T, demo = false): Result<T> => ({ status: 'ok', data, demo });
export const unavailable = (reason: string, demo = false): Result<never> => ({
  status: 'unavailable',
  reason,
  demo,
});
export interface Article {
  title: string;
  url: string;
  publishedAt: string;
  summary: string;
}
export interface ResourceRow {
  category: 'Indicated' | 'Inferred';
  oreMt: number;
  grade: number;
  gradeUnit: 'g/t Au' | '% Cu' | '% Li2O';
  contained: number;
  containedUnit: 'oz' | 't';
  page: number;
  evidence: string;
  source: string;
}
export interface Price {
  commodity: string;
  date: string;
  price: number;
  currency: string;
  unit: string;
  benchmark: string;
  source: string;
}
