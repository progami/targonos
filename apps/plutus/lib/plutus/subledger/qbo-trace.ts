import { createHash } from 'node:crypto';

import { plutusTraceInputSchema, type PlutusTraceInput } from './types';

export type PostingFingerprintLine = {
  lineId: string;
  accountId: string;
  amountCents: number;
  description: string;
};

export type PostingFingerprint = {
  postingHash: string;
  lineHashesById: Map<string, string>;
};

export type PostingFingerprintDiff = {
  status: 'in_sync' | 'drifted';
  missingLineIds: string[];
  extraLineIds: string[];
  changedLineIds: string[];
};

function hashJson(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export function buildPlutusTraceMemo(input: PlutusTraceInput): string {
  const parsed = plutusTraceInputSchema.parse(input);
  return `PLUTUS_REF=${parsed.plutusRef}; SOURCE=${parsed.source}; MARKET=${parsed.market}; PERIOD=${parsed.period}`;
}

export function buildPlutusLineDescription(input: {
  category: string;
  plutusLineId: string;
}): string {
  const category = input.category.trim();
  const plutusLineId = input.plutusLineId.trim();
  if (category === '') throw new Error('category is required');
  if (plutusLineId === '') throw new Error('plutusLineId is required');
  return `${category}; PLUTUS_LINE=${plutusLineId}`;
}

export function fingerprintPostingLines(lines: PostingFingerprintLine[]): PostingFingerprint {
  const lineHashesById = new Map<string, string>();
  const normalizedLines = lines
    .map((line) => ({ ...line, lineId: line.lineId.trim() }))
    .sort((left, right) => {
      if (left.lineId < right.lineId) return -1;
      if (left.lineId > right.lineId) return 1;
      return 0;
    });

  for (const line of normalizedLines) {
    const lineId = line.lineId;
    if (lineId === '') throw new Error('lineId is required');
    if (lineHashesById.has(lineId)) throw new Error('duplicate lineId is not allowed');
    lineHashesById.set(
      lineId,
      hashJson({
        accountId: line.accountId,
        amountCents: line.amountCents,
        description: line.description,
      }),
    );
  }

  return {
    postingHash: hashJson(Array.from(lineHashesById.entries())),
    lineHashesById,
  };
}

export function comparePostingFingerprints(
  expected: PostingFingerprint,
  live: PostingFingerprint,
): PostingFingerprintDiff {
  const missingLineIds: string[] = [];
  const extraLineIds: string[] = [];
  const changedLineIds: string[] = [];

  for (const [lineId, expectedHash] of expected.lineHashesById.entries()) {
    const liveHash = live.lineHashesById.get(lineId);
    if (liveHash === undefined) {
      missingLineIds.push(lineId);
    } else if (liveHash !== expectedHash) {
      changedLineIds.push(lineId);
    }
  }

  for (const lineId of live.lineHashesById.keys()) {
    if (!expected.lineHashesById.has(lineId)) {
      extraLineIds.push(lineId);
    }
  }

  return {
    status:
      missingLineIds.length === 0 && extraLineIds.length === 0 && changedLineIds.length === 0
        ? 'in_sync'
        : 'drifted',
    missingLineIds: missingLineIds.sort(),
    extraLineIds: extraLineIds.sort(),
    changedLineIds: changedLineIds.sort(),
  };
}
