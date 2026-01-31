let cachedHermesBasePath: string | null = null;

function detectBasePathFromNextAssets(): string {
  const scripts = Array.from(document.querySelectorAll<HTMLScriptElement>('script[src*="/_next/"]'));
  for (const s of scripts) {
    const src = s.getAttribute("src");
    if (!src) continue;
    const pathname = new URL(src, document.baseURI).pathname;
    const idx = pathname.indexOf("/_next/");
    if (idx === -1) continue;
    return pathname.slice(0, idx);
  }

  const links = Array.from(document.querySelectorAll<HTMLLinkElement>('link[href*="/_next/"]'));
  for (const l of links) {
    const href = l.getAttribute("href");
    if (!href) continue;
    const pathname = new URL(href, document.baseURI).pathname;
    const idx = pathname.indexOf("/_next/");
    if (idx === -1) continue;
    return pathname.slice(0, idx);
  }

  throw new Error("Could not detect Hermes base path");
}

function normalizeBasePath(raw: string): string {
  if (raw === "") return "";
  if (!raw.startsWith("/")) {
    throw new Error(`Base path must start with "/": got ${raw}`);
  }
  return raw.endsWith("/") ? raw.slice(0, -1) : raw;
}

export function getHermesBasePath(): string {
  if (cachedHermesBasePath !== null) return cachedHermesBasePath;

  if (typeof document !== "undefined") {
    cachedHermesBasePath = normalizeBasePath(detectBasePathFromNextAssets());
    return cachedHermesBasePath;
  }

  const raw = process.env.NEXT_PUBLIC_BASE_PATH;
  if (!raw) throw new Error("NEXT_PUBLIC_BASE_PATH is required");
  cachedHermesBasePath = normalizeBasePath(raw);
  return cachedHermesBasePath;
}

export function hermesApiUrl(path: string): string {
  if (!path.startsWith("/")) {
    throw new Error(`hermesApiUrl expects an absolute path starting with "/": got ${path}`);
  }
  return `${getHermesBasePath()}${path}`;
}
