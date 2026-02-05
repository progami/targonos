const raw = process.env.NEXT_PUBLIC_BASE_PATH ?? process.env.BASE_PATH ?? '';

const normalizedBasePath = (() => {
  if (!raw || raw === '/') return '';
  const trimmed = raw.replace(/\/+$/g, '');
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
})();

export function withAppBasePath(path: string): string {
  if (!path.startsWith('/')) {
    throw new Error('withAppBasePath expects an absolute path starting with "/"');
  }
  if (!normalizedBasePath) return path;
  return `${normalizedBasePath}${path}`;
}

