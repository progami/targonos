interface RetryError extends Error {
 status?: number
 code?: string
 headers?: Record<string, string>
}

interface RateLimitError extends Error {
 retryAfter: number
}

const isRetryError = (error: unknown): error is RetryError =>
 typeof error === 'object' && error !== null


interface RetryOptions {
 maxRetries?: number;
 maxAttempts?: number; // Alias for maxRetries + 1
 initialDelayMs?: number;
 initialDelay?: number; // Alias for initialDelayMs
 maxDelayMs?: number;
 maxDelay?: number; // Alias for maxDelayMs
 backoffMultiplier?: number;
 factor?: number; // Alias for backoffMultiplier
 jitter?: boolean;
 retryOn?: (error: unknown) => boolean;
 shouldRetry?: (error: unknown) => boolean; // Alias for retryOn
 onRetry?: (attempt: number, delay: number) => void;
}

export async function withRetry<T>(
 fn: () => Promise<T>,
 options: RetryOptions = {}
): Promise<T> {
 // Handle aliases
 const maxRetries = options.maxAttempts !== undefined ? options.maxAttempts - 1 : (options.maxRetries ?? 3);
 const initialDelayMs = options.initialDelay ?? options.initialDelayMs ?? 1000;
 const maxDelayMs = options.maxDelay ?? options.maxDelayMs ?? 30000;
 const backoffMultiplier = options.factor ?? options.backoffMultiplier ?? 2;
 const jitter = options.jitter ?? false;
 const onRetry = options.onRetry;
 
 const retryOn = options.shouldRetry ?? options.retryOn ?? ((error: unknown) => {
 if (!isRetryError(error)) {
 return false
 }

 if (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT') return true
 if (typeof error.status === 'number' && error.status >= 500) return true
 if (error.status === 429) return true // Rate limited
 return false;
 });

 let lastError: Error | undefined;
 let delayMs = initialDelayMs;

 for (let attempt = 0; attempt <= maxRetries; attempt++) {
 try {
 return await fn();
 } catch (error) {
 lastError = error as RetryError;

 if (attempt === maxRetries || !retryOn(lastError)) {
 throw lastError;
 }

 // Handle rate limit headers
 if (isRetryError(lastError) && lastError.status === 429 && lastError.headers?.['retry-after']) {
 delayMs = parseInt(lastError.headers['retry-after'], 10) * 1000;
 }

 // Apply jitter if enabled
 let actualDelay = delayMs;
 if (jitter) {
 // Add random jitter between 0% and 25% of the delay
 actualDelay = delayMs + Math.random() * delayMs * 0.25;
 }

 // Cap the delay
 actualDelay = Math.min(actualDelay, maxDelayMs);

 // Call onRetry callback if provided
 if (onRetry) {
 onRetry(attempt + 1, actualDelay);
 }

 // Wait before retry
 await new Promise(resolve => setTimeout(resolve, actualDelay));

 // Exponential backoff
 delayMs *= backoffMultiplier;
 }
 }

 throw lastError || new Error('Retry failed');
}

export async function withTimeout<T>(
 fn: ((signal?: AbortSignal) => Promise<T>) | (() => Promise<T>),
 timeoutMs: number = 5000
): Promise<T> {
 const controller = new AbortController();
 const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

 const timeoutPromise = new Promise<never>((_, reject) => {
 controller.signal.addEventListener('abort', () => {
 reject(new Error(`Operation timed out after ${timeoutMs}ms`));
 });
 });

 try {
 // Try to pass abort signal if function accepts it
 const result = await Promise.race([
 fn.length > 0 ? (fn as (signal: AbortSignal) => Promise<T>)(controller.signal) : (fn as () => Promise<T>)(),
 timeoutPromise
 ]);
 clearTimeout(timeoutId);
 return result;
 } catch (_error) {
 clearTimeout(timeoutId);
 if (controller.signal.aborted) {
 throw new Error('Operation timed out');
 }
 throw _error;
 }
}

// Circuit breaker implementation
export class CircuitBreaker {
 private failures = 0;
 private lastFailureTime?: number;
 private state: 'closed' | 'open' | 'half-open' = 'closed';

 constructor(
 private readonly threshold: number = 5,
 private readonly resetTimeMs: number = 60000,
 private readonly halfOpenRequests: number = 3
 ) {}

 async execute<T>(fn: () => Promise<T>): Promise<T> {
 if (this.state === 'open') {
 if (Date.now() - (this.lastFailureTime || 0) > this.resetTimeMs) {
 this.state = 'half-open';
 this.failures = 0;
 } else {
 throw new Error('Circuit breaker is open');
 }
 }

 try {
 const result = await fn();
 
 if (this.state === 'half-open') {
 this.failures = 0;
 this.state = 'closed';
 }
 
 return result;
 } catch (_error) {
 this.failures++;
 this.lastFailureTime = Date.now();

 if (this.failures >= this.threshold) {
 this.state = 'open';
 }

 throw _error;
 }
 }

 reset(): void {
 this.failures = 0;
 this.state = 'closed';
 this.lastFailureTime = undefined;
 }
}

// API client with resilience
export class ResilientAPIClient {
 private circuitBreakers = new Map<string, CircuitBreaker>();

 constructor(
 private readonly baseURL: string,
 private readonly defaultTimeout: number = 5000
 ) {}

 private getCircuitBreaker(endpoint: string): CircuitBreaker {
 if (!this.circuitBreakers.has(endpoint)) {
 this.circuitBreakers.set(endpoint, new CircuitBreaker());
 }
 return this.circuitBreakers.get(endpoint)!;
 }

 async request<T>(
 endpoint: string,
 options: RequestInit & { timeout?: number } = {}
 ): Promise<T> {
 const circuitBreaker = this.getCircuitBreaker(endpoint);
 const timeout = options.timeout || this.defaultTimeout;

 return circuitBreaker.execute(async () => {
 return withRetry(async () => {
 return withTimeout(async () => {
 const controller = new AbortController();
 const timeoutId = setTimeout(() => controller.abort(), timeout);

 try {
 const response = await fetch(`${this.baseURL}${endpoint}`, {
 ...options,
 signal: controller.signal
 });

 if (!response.ok) {
 const error = new Error(`HTTP ${response.status}`) as RetryError;
 error.status = response.status;
 error.headers = Object.fromEntries(response.headers);
 throw error;
 }

 return response.json();
 } finally {
 clearTimeout(timeoutId);
 }
 }, timeout);
 });
 });
 }
}

// Bulk processing with partial failure handling
export async function processBulk<T, R>(
  items: T[],
  processor: (item: T) => Promise<R>,
  options: {
    concurrency?: number;
    continueOnError?: boolean;
 } = {}
): Promise<{
 successful: Array<{ item: T; result: R }>;
 failed: Array<{ item: T; error: Error }>;
}> {
 const { concurrency = 5, continueOnError = true } = options;
 
 const successful: Array<{ item: T; result: R }> = [];
 const failed: Array<{ item: T; error: Error }> = [];
 
 const chunks = [];
 for (let i = 0; i < items.length; i += concurrency) {
 chunks.push(items.slice(i, i + concurrency));
 }

 for (const chunk of chunks) {
 const promises = chunk.map(async (item) => {
 try {
 const result = await processor(item);
 successful.push({ item, result });
 } catch (error) {
 failed.push({ item, error: error as Error });
 if (!continueOnError) {
 throw error;
 }
 }
 });

 await Promise.all(promises);
 }

 return { successful, failed };
}

// Wrapper function for circuit breaker
export function withCircuitBreaker<T>(
 fn: () => Promise<T>,
 options: {
 failureThreshold?: number;
 resetTimeout?: number;
 halfOpenRequests?: number;
 monitoringPeriod?: number;
 onStateChange?: (from: string, to: string) => void;
 } = {}
): () => Promise<T> {
 const {
 failureThreshold = 5,
 resetTimeout = 60000,
 halfOpenRequests = 3,
 onStateChange
 } = options;

 const circuitBreaker = new CircuitBreaker(failureThreshold, resetTimeout, halfOpenRequests);
 let previousState = 'CLOSED';

 return async () => {
 // Check current state for monitoring
 const currentState = circuitBreaker['state'].toUpperCase();
 if (previousState !== currentState && onStateChange) {
 onStateChange(previousState, currentState);
 previousState = currentState;
 }

 try {
 return await circuitBreaker.execute(fn);
 } catch (error) {
 if ((error as Error).message === 'Circuit breaker is open') {
 throw new Error('Circuit breaker is OPEN');
 }
 throw error;
 }
 };
}

// Wrapper function for rate limiting
interface RateLimitOptions {
 maxRequests: number;
 windowMs: number;
}

export function withRateLimit<T>(
 fn: (...args: unknown[]) => Promise<T>,
 options: RateLimitOptions
): (...args: unknown[]) => Promise<T> {
 const { maxRequests, windowMs } = options;
 const requests: number[] = [];

 return async (...args: unknown[]) => {
 const now = Date.now();
 
 // Remove old requests outside the window
 while (requests.length > 0 && requests[0] < now - windowMs) {
 requests.shift();
 }

 // Check if we've exceeded the limit
 if (requests.length >= maxRequests) {
 const oldestRequest = requests[0];
 const retryAfter = Math.ceil((oldestRequest + windowMs - now) / 1000);
 const error = new Error(`Rate limit exceeded. Try again in ${retryAfter} seconds.`) as RateLimitError
 error.retryAfter = retryAfter;
 throw error;
 }

 // Record this request
 requests.push(now);

 // Execute the function
 return fn(...args);
 };
}

// Token refresh manager
export class TokenManager {
 private token?: string;
 private refreshPromise?: Promise<string>;
 private tokenExpiry?: number;

 constructor(
 private readonly refreshToken: () => Promise<{ token: string; expiresIn: number }>
 ) {}

 async getToken(): Promise<string> {
 // Check if token is still valid
 if (this.token && this.tokenExpiry && Date.now() < this.tokenExpiry) {
 return this.token;
 }

 // If already refreshing, wait for that
 if (this.refreshPromise) {
 return this.refreshPromise;
 }

 // Refresh token
 this.refreshPromise = this.refreshToken()
 .then(({ token, expiresIn }) => {
 this.token = token;
 this.tokenExpiry = Date.now() + (expiresIn * 1000);
 this.refreshPromise = undefined;
 return token;
 })
 .catch((error) => {
 this.refreshPromise = undefined;
 throw error;
 });

 return this.refreshPromise;
 }

 invalidate(): void {
 this.token = undefined;
 this.tokenExpiry = undefined;
 }
}
