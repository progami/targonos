import { stableStringify } from './stable-json';

export type Change = {
  path: string;
  before: unknown;
  after: unknown;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object') return false;
  if (Array.isArray(value)) return false;
  return Object.getPrototypeOf(value) === Object.prototype;
}

function joinPath(base: string, key: string): string {
  if (!base) return key;
  return `${base}.${key}`;
}

function walkDiff(path: string, before: unknown, after: unknown, changes: Change[]) {
  if (stableStringify(before) === stableStringify(after)) return;

  if (isPlainObject(before) && isPlainObject(after)) {
    const keys = Array.from(new Set([...Object.keys(before), ...Object.keys(after)])).sort();
    for (const key of keys) {
      walkDiff(joinPath(path, key), before[key], after[key], changes);
    }
    return;
  }

  changes.push({ path, before, after });
}

export function diffObjects(before: unknown, after: unknown): Change[] {
  const changes: Change[] = [];
  walkDiff('', before, after, changes);
  return changes;
}
