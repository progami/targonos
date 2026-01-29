export function getHermesBasePath(): string {
  const raw = process.env.NEXT_PUBLIC_BASE_PATH;
  if (!raw) throw new Error("NEXT_PUBLIC_BASE_PATH is required");
  if (!raw.startsWith("/")) {
    throw new Error(`NEXT_PUBLIC_BASE_PATH must start with "/": got ${raw}`);
  }
  return raw.endsWith("/") ? raw.slice(0, -1) : raw;
}

export function hermesApiUrl(path: string): string {
  if (!path.startsWith("/")) {
    throw new Error(`hermesApiUrl expects an absolute path starting with "/": got ${path}`);
  }
  return `${getHermesBasePath()}${path}`;
}
