export function normalizeBasePath(value: string | undefined): string {
  if (value === undefined) {
    return '';
  }

  if (value === '') {
    return '';
  }

  if (value === '/') {
    return '';
  }

  const trimmed = value.replace(/\/+$/g, '');
  if (trimmed === '') {
    return '';
  }

  const segments = trimmed.split('/').filter(Boolean);
  const halfLen = Math.floor(segments.length / 2);
  const hasDuplicatedBasePath =
    segments.length > 0 &&
    segments.length % 2 === 0 &&
    segments.slice(0, halfLen).join('/') === segments.slice(halfLen).join('/');
  const deduped = hasDuplicatedBasePath
    ? `/${segments.slice(0, halfLen).join('/')}`
    : trimmed;

  if (deduped.startsWith('/')) {
    return deduped;
  }

  return `/${deduped}`;
}

export function getPublicBasePath(): string {
  return normalizeBasePath(process.env.NEXT_PUBLIC_BASE_PATH);
}
