export function formatCompactNumber(value: number | null): string {
  if (value === null) {
    return '-';
  }

  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 1,
    notation: 'compact',
  }).format(value);
}

export function formatPercent(value: number | null, digits = 1): string {
  if (value === null) {
    return '-';
  }

  return `${(value * 100).toFixed(digits)}%`;
}

export function formatDecimal(value: number | null, digits = 1): string {
  if (value === null) {
    return '-';
  }

  return value.toFixed(digits);
}

export function formatMoney(value: number | null): string {
  if (value === null) {
    return '-';
  }

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatWeekStart(value: string): string {
  const parsed = new Date(value);
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
  }).format(parsed);
}
