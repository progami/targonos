import 'server-only';

export type AuditRequestMeta = {
  method: string;
  path: string;
  userAgent: string | null;
  xRealIp: string | null;
  xForwardedFor: string | null;
  cfConnectingIp: string | null;
  cfRay: string | null;
  requestId: string | null;
};

export function buildAuditRequestMeta(request: Request): AuditRequestMeta {
  const url = new URL(request.url);
  return {
    method: request.method,
    path: url.pathname,
    userAgent: request.headers.get('user-agent'),
    xRealIp: request.headers.get('x-real-ip'),
    xForwardedFor: request.headers.get('x-forwarded-for'),
    cfConnectingIp: request.headers.get('cf-connecting-ip'),
    cfRay: request.headers.get('cf-ray'),
    requestId: request.headers.get('x-request-id'),
  };
}

export function emitAuditEvent(payload: Record<string, unknown>) {
  const now = new Date();
  console.info(
    JSON.stringify({
      ...payload,
      at: now.toISOString(),
      atLocal: now.toString(),
    }),
  );
}

