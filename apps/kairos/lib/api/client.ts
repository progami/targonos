import { withAppBasePath } from '@/lib/base-path';

type ApiErrorPayload = {
  error?: unknown;
};

const REQUEST_TIMEOUT_MS = 15_000;

function errorMessageFromPayload(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const rec = payload as ApiErrorPayload;
  if (typeof rec.error === 'string' && rec.error.trim()) return rec.error;
  return null;
}

async function readJsonSafely(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => '');
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

export async function fetchJson<TResponse>(path: string, init?: RequestInit): Promise<TResponse> {
  if (!path.startsWith('/')) {
    throw new Error('fetchJson expects an absolute path starting with "/"');
  }

  const timeoutSignal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  const signal = init?.signal
    ? AbortSignal.any([init.signal, timeoutSignal])
    : timeoutSignal;

  let response: Response;
  try {
    response = await fetch(withAppBasePath(path), {
      ...init,
      signal,
      headers: {
        accept: 'application/json',
        ...init?.headers,
      },
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'TimeoutError') {
      throw new Error('Request timed out.');
    }
    if (error instanceof DOMException && error.name === 'AbortError' && timeoutSignal.aborted) {
      throw new Error('Request timed out.');
    }
    throw error;
  }

  const payload = await readJsonSafely(response);

  if (!response.ok) {
    const message = errorMessageFromPayload(payload) ?? `Request failed (${response.status})`;
    throw new Error(message);
  }

  return payload as TResponse;
}
