export function parseFirstNumber(raw: string): number | undefined {
  const text = raw.trim();
  if (!text) return undefined;

  const match = text.match(/(\d[\d,]*\.?\d*)/);
  if (!match) return undefined;

  const normalized = match[1].replace(/,/g, '');
  const value = Number.parseFloat(normalized);
  if (Number.isFinite(value)) return value;
  return undefined;
}

export function parseFirstInt(raw: string): number | undefined {
  const value = parseFirstNumber(raw);
  if (value === undefined) return undefined;
  return Math.trunc(value);
}

