export function toCents(amount: number): number {
  return Math.round(amount * 100);
}

export function fromCents(cents: number): number {
  return cents / 100;
}

function sum(values: number[]): number {
  let total = 0;
  for (const v of values) total += v;
  return total;
}

/**
 * Allocate cents proportionally by integer weights (largest-remainder method).
 * Ensures the returned allocations sum exactly to totalCents.
 */
export function allocateByWeight(
  totalCents: number,
  weights: Array<{ key: string; weight: number }>,
): Record<string, number> {
  if (!Number.isInteger(totalCents)) {
    throw new Error(`totalCents must be an integer (got ${totalCents})`);
  }

  const totalWeight = sum(weights.map((w) => w.weight));
  if (totalWeight <= 0) {
    throw new Error('Cannot allocate: total weight is 0');
  }

  const base: Array<{ key: string; cents: number; remainder: number }> = [];
  let allocated = 0;

  for (const item of weights) {
    const numerator = totalCents * item.weight;
    const cents = Math.floor(numerator / totalWeight);
    const remainder = numerator % totalWeight;
    base.push({ key: item.key, cents, remainder });
    allocated += cents;
  }

  let remaining = totalCents - allocated;
  base.sort((a, b) => b.remainder - a.remainder);

  for (let i = 0; i < base.length && remaining > 0; i++) {
    base[i].cents += 1;
    remaining -= 1;
  }

  const result: Record<string, number> = {};
  for (const item of base) {
    result[item.key] = item.cents;
  }

  return result;
}

/**
 * Remove a proportional share of component values for a given unit movement.
 * Uses integer division + remainder distribution to keep cents consistent.
 */
export function removeProportionalComponents(
  valuesByComponentCents: Record<string, number>,
  unitsToRemove: number,
  onHandUnits: number,
): Record<string, number> {
  if (!Number.isInteger(unitsToRemove) || unitsToRemove <= 0) {
    throw new Error(`unitsToRemove must be a positive integer (got ${unitsToRemove})`);
  }
  if (!Number.isInteger(onHandUnits) || onHandUnits <= 0) {
    throw new Error(`onHandUnits must be a positive integer (got ${onHandUnits})`);
  }
  if (unitsToRemove > onHandUnits) {
    throw new Error(`Cannot remove ${unitsToRemove} units from on-hand ${onHandUnits}`);
  }

  const entries = Object.entries(valuesByComponentCents).map(([key, cents]) => ({
    key,
    valueCents: cents,
  }));

  const totalValueCents = sum(entries.map((e) => e.valueCents));
  const targetTotal = Math.floor((totalValueCents * unitsToRemove) / onHandUnits);

  const parts: Array<{ key: string; cents: number; remainder: number }> = [];
  let allocated = 0;

  for (const entry of entries) {
    const numerator = entry.valueCents * unitsToRemove;
    const cents = Math.floor(numerator / onHandUnits);
    const remainder = numerator % onHandUnits;
    parts.push({ key: entry.key, cents, remainder });
    allocated += cents;
  }

  let remaining = targetTotal - allocated;
  parts.sort((a, b) => b.remainder - a.remainder);
  for (let i = 0; i < parts.length && remaining > 0; i++) {
    parts[i].cents += 1;
    remaining -= 1;
  }

  const result: Record<string, number> = {};
  for (const p of parts) {
    result[p.key] = p.cents;
  }

  return result;
}

