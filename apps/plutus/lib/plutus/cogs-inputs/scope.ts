export type CogsInputCandidate = {
  isTrackedBill?: boolean;
  mapping?: unknown | null;
};

export function isCogsInputRow(row: CogsInputCandidate): boolean {
  if (row.isTrackedBill === true) return true;
  return row.mapping !== null && row.mapping !== undefined;
}

export function filterCogsInputRows<T extends CogsInputCandidate>(rows: T[]): T[] {
  return rows.filter((row) => isCogsInputRow(row));
}
