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

  if (trimmed.startsWith('/')) {
    return trimmed;
  }

  return `/${trimmed}`;
}

export function getPublicBasePath(): string {
  return normalizeBasePath(process.env.NEXT_PUBLIC_BASE_PATH);
}
