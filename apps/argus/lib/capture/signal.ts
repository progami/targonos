import { sha256Hex, stableStringify } from './hash';

export type ListingSignalExtracted = {
  title?: string;
  price?: number;
  imageUrls: string[];
};

export type ListingSignalChangeSummary = {
  titleChanged: boolean;
  priceBefore?: number;
  priceAfter?: number;
  priceDeltaAbs?: number;
  priceDeltaPct?: number;
  imagesChanged: boolean;
  mainChanged?: boolean;
  reordered?: boolean;
  addedCount?: number;
  removedCount?: number;
};

function asFiniteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function amazonImageId(url: string): string | null {
  const marker = '/images/I/';
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  const rest = url.slice(idx + marker.length);
  const dot = rest.indexOf('.');
  if (dot <= 0) return null;
  return rest.slice(0, dot);
}

function imageKey(url: string): string {
  return amazonImageId(url) ?? url;
}

export function buildListingSignalExtracted(normalizedExtracted: unknown): ListingSignalExtracted {
  const obj = normalizedExtracted as any;
  const title = typeof obj?.title === 'string' ? (obj.title as string) : undefined;
  const price = asFiniteNumber(obj?.price);
  const imageUrlsRaw = Array.isArray(obj?.imageUrls) ? (obj.imageUrls as unknown[]) : [];
  const imageUrls = imageUrlsRaw.filter((v) => typeof v === 'string') as string[];

  return {
    title,
    price,
    imageUrls: imageUrls.slice(0, 9),
  };
}

export function signalContentHash(signal: ListingSignalExtracted): string {
  return sha256Hex(stableStringify(signal));
}

export function buildSignalChangeSummary(
  prev: ListingSignalExtracted,
  curr: ListingSignalExtracted,
): ListingSignalChangeSummary {
  const titleChanged = prev.title !== curr.title;

  let priceBefore: number | undefined;
  let priceAfter: number | undefined;
  let priceDeltaAbs: number | undefined;
  let priceDeltaPct: number | undefined;

  if (prev.price !== undefined && curr.price !== undefined) {
    if (prev.price !== curr.price) {
      priceBefore = prev.price;
      priceAfter = curr.price;
      const delta = curr.price - prev.price;
      priceDeltaAbs = Math.abs(delta);
      if (prev.price !== 0) {
        priceDeltaPct = (Math.abs(delta) / Math.abs(prev.price)) * 100;
      }
    }
  }

  const prevKeys = prev.imageUrls.map(imageKey);
  const currKeys = curr.imageUrls.map(imageKey);

  const prevSet = new Set(prevKeys);
  const currSet = new Set(currKeys);

  let addedCount = 0;
  for (const key of currSet) {
    if (!prevSet.has(key)) addedCount += 1;
  }
  let removedCount = 0;
  for (const key of prevSet) {
    if (!currSet.has(key)) removedCount += 1;
  }

  const reordered =
    addedCount === 0 &&
    removedCount === 0 &&
    prevKeys.length === currKeys.length &&
    prevKeys.join('|') !== currKeys.join('|');

  const mainChanged = (prevKeys[0] ?? null) !== (currKeys[0] ?? null);
  const imagesChanged = mainChanged || reordered || addedCount > 0 || removedCount > 0;

  return {
    titleChanged,
    priceBefore,
    priceAfter,
    priceDeltaAbs,
    priceDeltaPct,
    imagesChanged,
    mainChanged,
    reordered,
    addedCount,
    removedCount,
  };
}
