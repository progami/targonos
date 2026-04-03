const compactNumberFormatter = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 1,
  notation: 'compact',
});

const compactNumberFormatterWithFraction = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
  notation: 'compact',
});

const integerFormatter = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 0,
});

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

const currencyFormatterWithCents = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatCompactNumber(value: number | null): string {
  if (value === null) {
    return '-';
  }

  const absoluteValue = Math.abs(value);
  if (absoluteValue >= 1000 && absoluteValue < 10000) {
    return compactNumberFormatterWithFraction.format(value);
  }

  return compactNumberFormatter.format(value);
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

  const roundedValue = Math.round(value * 100) / 100;
  const cents = Math.round(Math.abs(roundedValue) * 100) % 100;

  if (cents === 0) {
    return currencyFormatter.format(roundedValue);
  }

  return currencyFormatterWithCents.format(roundedValue);
}

export function formatCount(value: number | null): string {
  if (value === null) {
    return '-';
  }

  return integerFormatter.format(value);
}

export function formatWeekStart(value: string): string {
  const parsed = new Date(value);
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
  }).format(parsed);
}
