export function sanitizeNumeric(value: unknown): number {
  if (value === null || value === undefined) return Number.NaN;
  if (typeof value === 'number') return Number.isFinite(value) ? value : Number.NaN;

  const raw = String(value).trim();
  if (!raw) return Number.NaN;

  const cleaned = raw.replace(/[$,%\s]/g, '').replace(/,/g, '');
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

export function formatNumericInput(value: unknown, fractionDigits = 2): string {
  if (value === null || value === undefined || value === '') return '';
  const parsed = sanitizeNumeric(value);
  if (Number.isNaN(parsed)) return '';
  return parsed.toFixed(fractionDigits);
}

export function formatPercentInput(value: unknown, fractionDigits = 4): string {
  if (value === null || value === undefined || value === '') return '';
  const parsed = sanitizeNumeric(value);
  if (Number.isNaN(parsed)) return '';
  const base = parsed > 1 ? parsed / 100 : parsed;
  return base.toFixed(fractionDigits);
}

export function parseNumericInput(value: unknown): number | null {
  const parsed = sanitizeNumeric(value);
  if (Number.isNaN(parsed)) return null;
  return parsed;
}
