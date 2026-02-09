/**
 * SP-API client (LWA + AWS SigV4) for Hermes.
 *
 * This is intentionally focused and "worker friendly":
 * - in-process caching for LWA access tokens and assumed-role creds
 * - token-bucket pacing that can learn from `x-amzn-RateLimit-Limit` when present
 *
 * For production at scale:
 * - store refresh tokens encrypted per connection
 * - use a shared/distributed rate limiter (Redis) if you run multiple workers
 */

import crypto from "crypto";
import { SignatureV4 } from "@aws-sdk/signature-v4";
import { HttpRequest } from "@aws-sdk/protocol-http";
import { Hash } from "@aws-sdk/hash-node";
import { AssumeRoleCommand, STSClient } from "@aws-sdk/client-sts";
import { getAwsSigningRegion, getSpApiHost, type SpApiRegion } from "./regions";
import { spApiLimiter, type TokenBucketConfig } from "./rate-limiter";
import { isHermesDryRun } from "../env/flags";

class Sha256 extends Hash {
  constructor(secret?: any) {
    super("sha256", secret as any);
  }
}

export type SpApiConfig = {
  region: SpApiRegion;

  // Optional sandbox support. (Many operations have limited sandbox fidelity.)
  sandbox?: boolean;

  // Optional overrides (useful for testing).
  endpointOverride?: string;
  awsRegionOverride?: string;

  // LWA (Login with Amazon)
  lwaClientId: string;
  lwaClientSecret: string;
  lwaRefreshToken: string;

  // AWS credentials
  awsAccessKeyId: string;
  awsSecretAccessKey: string;
  awsRoleArn?: string;

  // Optional nicer tracing (does not affect signing)
  userAgent?: string;
};

export type SpApiResponse = {
  status: number;
  body: unknown;
  headers: Record<string, string>;
};

export type SpApiRequestOpts = {
  method: "GET" | "POST";
  path: string;
  query?: Record<string, string | undefined>;
  body?: unknown;

  /**
   * Provide a stable key per *operation* (NOT per orderId), so the limiter behaves.
   * Example: "solicitations.getSolicitationActionsForOrder".
   */
  rateLimitKey?: string;

  /** Default limiter config if we don't yet know the dynamic rate. */
  defaultRateLimit?: TokenBucketConfig;

  /**
   * If set, limit how long we will wait for the in-process rate limiter.
   * When exceeded, the request short-circuits with a synthetic 429 response:
   * `{ error: "rate_limited", retryAfterMs }`.
   */
  maxLimiterWaitMs?: number;
};

type LwaTokenCacheEntry = {
  accessToken: string;
  expiresAtMs: number;
};

type AwsCreds = {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
  expiresAtMs?: number;
};

function sha256Hex(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

function nowMs(): number {
  return Date.now();
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function normalizeHeaders(h: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of h.entries()) out[k.toLowerCase()] = v;
  return out;
}

function parseRateLimitHeader(headers: Record<string, string>): number | null {
  // Header is documented as `x-amzn-RateLimit-Limit` (rate limit, not burst).
  const raw = headers["x-amzn-ratelimit-limit"];
  if (!raw) return null;
  const n = Number.parseFloat(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

// --------- Process-global caches (safe for Next.js + worker reuse) ---------

const g = globalThis as unknown as {
  __hermesLwaCache?: Map<string, LwaTokenCacheEntry>;
  __hermesStsCache?: Map<string, AwsCreds>;
};

const lwaCache = g.__hermesLwaCache ?? (g.__hermesLwaCache = new Map());
const stsCache = g.__hermesStsCache ?? (g.__hermesStsCache = new Map());

// -------------------------------------------------------------------------

export class SpApiClient {
  constructor(private config: SpApiConfig) {}

  private host(): string {
    return getSpApiHost({
      region: this.config.region,
      sandbox: this.config.sandbox,
      endpointOverride: this.config.endpointOverride,
    });
  }

  private signingRegion(): string {
    return getAwsSigningRegion({
      region: this.config.region,
      awsRegionOverride: this.config.awsRegionOverride,
    });
  }

  private limiterKey(opKey: string): string {
    // Rate limits are per (application + selling partner) and other factors.
    // Refresh token is unique per seller authorization (for a given app).
    const sellerHash = sha256Hex(this.config.lwaRefreshToken).slice(0, 12);
    return `spapi|${this.config.region}|${sellerHash}|${opKey}`;
  }

  private async getLwaAccessToken(): Promise<string> {
    // Keyed by app + refresh token.
    const key = sha256Hex(`${this.config.lwaClientId}|${this.config.lwaRefreshToken}`);
    const cached = lwaCache.get(key);

    // 60s early refresh buffer.
    if (cached && cached.expiresAtMs - 60_000 > nowMs()) {
      return cached.accessToken;
    }

    const form = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: this.config.lwaRefreshToken,
      client_id: this.config.lwaClientId,
      client_secret: this.config.lwaClientSecret,
    });

    const res = await fetch("https://api.amazon.com/auth/o2/token", {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
      },
      body: form,
    });

    const text = await res.text();
    let data: any;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { raw: text };
    }

    if (!res.ok) {
      const msg = data?.error_description ?? data?.error ?? `LWA token exchange failed (${res.status})`;
      throw new Error(msg);
    }

    const accessToken = data?.access_token;
    const expiresIn = Number(data?.expires_in ?? 0);
    if (typeof accessToken !== "string" || !accessToken) {
      throw new Error("LWA token exchange returned no access_token");
    }

    // Guard: LWA tokens are typically ~1 hour. Keep sane bounds.
    const ttlMs = clamp(expiresIn * 1000, 60_000, 6 * 60 * 60 * 1000);
    lwaCache.set(key, {
      accessToken,
      expiresAtMs: nowMs() + ttlMs,
    });

    return accessToken;
  }

  private async getAwsCreds(): Promise<AwsCreds> {
    // If no role ARN, use static creds directly.
    if (!this.config.awsRoleArn) {
      return {
        accessKeyId: this.config.awsAccessKeyId,
        secretAccessKey: this.config.awsSecretAccessKey,
      };
    }

    const cacheKey = sha256Hex(`${this.config.awsAccessKeyId}|${this.config.awsRoleArn}`);
    const cached = stsCache.get(cacheKey);

    // 2-minute early refresh buffer.
    if (cached && (cached.expiresAtMs ?? 0) - 120_000 > nowMs()) {
      return cached;
    }

    const sts = new STSClient({
      region: this.signingRegion(),
      credentials: {
        accessKeyId: this.config.awsAccessKeyId,
        secretAccessKey: this.config.awsSecretAccessKey,
      },
    });

    const sessionName = `hermes-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;

    const out = await sts.send(
      new AssumeRoleCommand({
        RoleArn: this.config.awsRoleArn,
        RoleSessionName: sessionName,
      })
    );

    const c = out.Credentials;
    if (!c?.AccessKeyId || !c.SecretAccessKey) {
      throw new Error("AssumeRole did not return credentials");
    }

    const creds: AwsCreds = {
      accessKeyId: c.AccessKeyId,
      secretAccessKey: c.SecretAccessKey,
      sessionToken: c.SessionToken,
      expiresAtMs: c.Expiration ? new Date(c.Expiration).getTime() : undefined,
    };

    stsCache.set(cacheKey, creds);
    return creds;
  }

  private async signRequest(params: {
    method: "GET" | "POST";
    path: string;
    query?: Record<string, string | undefined>;
    headers: Record<string, string>;
    body?: string;
  }): Promise<{ url: string; headers: Record<string, string>; body?: string }> {
    const host = this.host();
    const region = this.signingRegion();

    const awsCreds = await this.getAwsCreds();

    const signer = new SignatureV4({
      credentials: {
        accessKeyId: awsCreds.accessKeyId,
        secretAccessKey: awsCreds.secretAccessKey,
        sessionToken: awsCreds.sessionToken,
      },
      service: "execute-api",
      region,
      sha256: Sha256,
    });

    const query: Record<string, string> | undefined = params.query
      ? Object.fromEntries(
          Object.entries(params.query)
            .filter(([, v]) => typeof v === "string" && v.length > 0)
            .map(([k, v]) => [k, v as string])
        )
      : undefined;

    const req = new HttpRequest({
      protocol: "https:",
      hostname: host,
      method: params.method,
      path: params.path,
      query,
      headers: {
        ...params.headers,
        host,
      },
      body: params.body,
    });

    const signed = (await signer.sign(req)) as HttpRequest;

    // Build URL for fetch.
    const url = new URL(`https://${host}${params.path}`);
    if (query) {
      for (const [k, v] of Object.entries(query)) url.searchParams.append(k, v);
    }

    return {
      url: url.toString(),
      headers: signed.headers as Record<string, string>,
      body: params.body,
    };
  }

  async request(opts: SpApiRequestOpts): Promise<SpApiResponse> {
    // Safety net: block all POST requests in dry-run mode.
    if (isHermesDryRun() && opts.method === "POST") {
      console.log(`[hermes:dry-run] BLOCKED ${opts.method} ${opts.path}`);
      return {
        status: 499,
        body: { dryRun: true, blocked: `${opts.method} ${opts.path}` },
        headers: {},
      };
    }

    const opKey = opts.rateLimitKey ?? `${opts.method} ${opts.path.split("?")[0]}`;
    const limiterKey = this.limiterKey(opKey);

    const defaultCfg: TokenBucketConfig = opts.defaultRateLimit ?? {
      ratePerSecond: 1,
      burst: 1,
    };

    // Ensure limiter exists for this operation+seller.
    spApiLimiter.ensure(limiterKey, defaultCfg);

    // Wait for a token (optionally bounded).
    if (typeof opts.maxLimiterWaitMs === "number") {
      const acquired = await spApiLimiter.acquireOrReturnWaitMs(limiterKey, opts.maxLimiterWaitMs);
      if (!acquired.ok) {
        return {
          status: 429,
          body: { error: "rate_limited", retryAfterMs: acquired.waitMs },
          headers: { "retry-after": String(Math.ceil(acquired.waitMs / 1000)) },
        };
      }
    } else {
      await spApiLimiter.acquire(limiterKey);
    }

    // LWA access token
    const accessToken = await this.getLwaAccessToken();

    const userAgent = this.config.userAgent ?? "targon-hermes/0.1";
    const headers: Record<string, string> = {
      "user-agent": userAgent,
      "x-amz-access-token": accessToken,
    };

    // Only send JSON when a body exists.
    let bodyStr: string | undefined;
    if (opts.body !== undefined) {
      bodyStr = JSON.stringify(opts.body);
      headers["content-type"] = "application/json";
    }

    const signed = await this.signRequest({
      method: opts.method,
      path: opts.path,
      query: opts.query,
      headers,
      body: bodyStr,
    });

    const res = await fetch(signed.url, {
      method: opts.method,
      headers: signed.headers,
      body: bodyStr,
    });

    const raw = await res.text();
    let parsed: unknown = null;
    try {
      parsed = raw ? JSON.parse(raw) : null;
    } catch {
      parsed = raw;
    }

    const outHeaders = normalizeHeaders(res.headers);

    // Learn dynamic rate when available.
    const rate = parseRateLimitHeader(outHeaders);
    if (rate) {
      spApiLimiter.updateRate(limiterKey, rate);
    }

    return {
      status: res.status,
      body: parsed,
      headers: outHeaders,
    };
  }
}
