import type { SpApiMoney } from './types';

function parseSignedDecimalToCents(value: string): number {
  const trimmed = value.trim();
  if (trimmed === '') throw new Error('Amount is empty');

  const sign = trimmed.startsWith('-') ? -1 : 1;
  const unsigned = sign === -1 ? trimmed.slice(1) : trimmed;

  if (!/^[0-9]+(\\.[0-9]+)?$/.test(unsigned)) {
    throw new Error(`Invalid decimal amount: ${value}`);
  }

  const [wholeRaw, fracRaw] = unsigned.split('.');
  const whole = Number(wholeRaw);
  if (!Number.isFinite(whole) || !Number.isInteger(whole)) {
    throw new Error(`Invalid whole amount: ${value}`);
  }

  const frac = fracRaw ?? '';
  if (frac.length > 2) {
    throw new Error(`Too many decimal places: ${value}`);
  }

  const centsPart = frac.length === 0 ? 0 : frac.length === 1 ? Number(frac) * 10 : Number(frac);
  if (!Number.isFinite(centsPart) || !Number.isInteger(centsPart)) {
    throw new Error(`Invalid cents: ${value}`);
  }

  return sign * (whole * 100 + centsPart);
}

export function moneyToCents(money: SpApiMoney, context: string): number {
  const numeric = money.CurrencyAmount;
  if (typeof numeric === 'number') {
    if (!Number.isFinite(numeric)) {
      throw new Error(`Invalid money CurrencyAmount for ${context}`);
    }
    return Math.round(numeric * 100);
  }

  const raw = money.Amount;
  if (typeof raw !== 'string' || raw.trim() === '') {
    throw new Error(`Missing money amount for ${context}`);
  }
  return parseSignedDecimalToCents(raw);
}
