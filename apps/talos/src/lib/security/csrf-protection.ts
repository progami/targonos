import { NextRequest } from 'next/server';

const CSRF_HEADER = 'x-csrf-token';
const CSRF_COOKIE = 'csrf-token';

const ALLOWED_CSRF_ORIGINS = [
 process.env.NEXTAUTH_URL,
 process.env.NEXT_PUBLIC_APP_URL,
 process.env.NEXT_PUBLIC_PORTAL_AUTH_URL,
 process.env.PORTAL_AUTH_URL,
].filter((value): value is string => Boolean(value));

if (ALLOWED_CSRF_ORIGINS.length === 0) {
 throw new Error(
  'CSRF protection requires NEXTAUTH_URL, NEXT_PUBLIC_APP_URL, NEXT_PUBLIC_PORTAL_AUTH_URL, or PORTAL_AUTH_URL to be configured.'
 );
}

export function generateCSRFToken(): string {
 // Generate random bytes using Web Crypto API (Edge Runtime compatible)
 const buffer = new Uint8Array(32);
 if (typeof globalThis.crypto !== 'undefined') {
 globalThis.crypto.getRandomValues(buffer);
 } else {
 // Fallback for environments without crypto
 for (let i = 0; i < buffer.length; i++) {
 buffer[i] = Math.floor(Math.random() * 256);
 }
 }
 
 // Convert to hex string
 return Array.from(buffer)
 .map(b => b.toString(16).padStart(2, '0'))
 .join('');
}

export function validateCSRFToken(req: NextRequest): boolean {
 // Skip CSRF for safe methods
 if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
 return true;
 }

 // Get token from header
 const headerToken = req.headers.get(CSRF_HEADER);
 if (!headerToken) {
 return false;
 }

 // Get token from cookie
 const cookieToken = req.cookies.get(CSRF_COOKIE)?.value;
 if (!cookieToken) {
 return false;
 }

 // Validate tokens match
 return headerToken === cookieToken;
}

export function setCSRFCookie(response: Response, token: string): Response {
 response.headers.set(
 'Set-Cookie',
 `${CSRF_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; ${
 process.env.NODE_ENV === 'production' ? 'Secure;' : ''
 }`
 );
 return response;
}

export function validateOrigin(req: NextRequest): boolean {
 const origin = req.headers.get('origin');
 const referer = req.headers.get('referer');
 
 if (!origin && !referer) {
 // No origin/referer for same-origin requests
 return true;
 }

 const requestOrigin = origin || new URL(referer!).origin;
 return ALLOWED_CSRF_ORIGINS.includes(requestOrigin);
}

export function csrfProtection(req: NextRequest): Response | null {
 // Skip CSRF for API routes that are meant to be public
 const publicPaths = ['/api/health'];
 if (publicPaths.some(path => req.nextUrl.pathname.startsWith(path))) {
 return null;
 }

 // Validate origin
 if (!validateOrigin(req)) {
 return new Response(
 JSON.stringify({ error: 'Invalid origin' }),
 { status: 403, headers: { 'Content-Type': 'application/json' } }
 );
 }

 // Validate CSRF token
 if (!validateCSRFToken(req)) {
 return new Response(
 JSON.stringify({ error: 'Invalid CSRF token' }),
 { status: 403, headers: { 'Content-Type': 'application/json' } }
 );
 }

 return null;
}
