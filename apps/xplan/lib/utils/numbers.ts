export function parseNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'bigint') {
    return Number(value);
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const sanitized = trimmed.replace(/[,$%\s]/g, '');
    if (!sanitized) return null;
    const numeric = Number(sanitized);
    return Number.isFinite(numeric) ? numeric : null;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

export function coerceNumber(value: unknown, fallback = 0): number {
  const numeric = parseNumber(value);
  return numeric ?? fallback;
}

export function parsePercent(value: unknown): number | null {
  const numeric = parseNumber(value);
  if (numeric == null) return null;
  return Math.abs(numeric) > 1 ? numeric / 100 : numeric;
}

export function coercePercent(value: unknown, fallback = 0): number {
  const parsed = parsePercent(value);
  return parsed ?? fallback;
}

export function roundWeeks(value: unknown, fallback = 1): number {
  const numeric = parseNumber(value);
  const safeFallback = Number.isFinite(fallback) && fallback >= 0 ? fallback : 0;
  if (numeric == null || !Number.isFinite(numeric) || numeric < 0) return safeFallback;
  return numeric;
}
