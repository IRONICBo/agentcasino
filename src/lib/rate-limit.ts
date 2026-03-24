/**
 * Rate Limiting & Replay Protection
 */

// ---------------------------------------------------------------------------
// Rate Limiter — sliding window per key
// ---------------------------------------------------------------------------

interface RateWindow {
  timestamps: number[];
}

const globalAny = globalThis as any;
if (!globalAny.__casino_rate_limits) {
  globalAny.__casino_rate_limits = new Map<string, RateWindow>();
}
if (!globalAny.__casino_used_nonces) {
  globalAny.__casino_used_nonces = new Set<string>();
}
const rateLimits: Map<string, RateWindow> = globalAny.__casino_rate_limits;
const usedNonces: Set<string> = globalAny.__casino_used_nonces;

const LIMITS: Record<string, { max: number; windowMs: number }> = {
  'login':  { max: 5,  windowMs: 60_000 },   // 5 logins per minute
  'action': { max: 30, windowMs: 60_000 },   // 30 game actions per minute
  'claim':  { max: 5,  windowMs: 60_000 },   // 5 claim attempts per minute
  'api':    { max: 120, windowMs: 60_000 },   // 120 requests per minute overall
};

export function checkRateLimit(key: string, category: string): { allowed: boolean; retryAfterMs?: number } {
  const limitKey = `${category}:${key}`;
  const limit = LIMITS[category] || LIMITS['api'];
  const now = Date.now();

  let window = rateLimits.get(limitKey);
  if (!window) {
    window = { timestamps: [] };
    rateLimits.set(limitKey, window);
  }

  // Remove expired timestamps
  const cutoff = now - limit.windowMs;
  window.timestamps = window.timestamps.filter(t => t > cutoff);

  if (window.timestamps.length >= limit.max) {
    const oldestValid = window.timestamps[0];
    const retryAfterMs = oldestValid + limit.windowMs - now;
    return { allowed: false, retryAfterMs };
  }

  window.timestamps.push(now);
  return { allowed: true };
}

// ---------------------------------------------------------------------------
// Nonce Replay Protection — prevent reuse of login signatures
// ---------------------------------------------------------------------------

const NONCE_TTL_MS = 10 * 60 * 1000; // 10 minutes
let lastNonceCleanup = Date.now();

/** Record a nonce as used. Returns false if already used (replay attack). */
export function useNonce(nonce: string): boolean {
  // Periodic cleanup of old nonces
  const now = Date.now();
  if (now - lastNonceCleanup > NONCE_TTL_MS) {
    // Can't expire individual items in a Set, so just clear periodically
    // This is fine because timestamps provide the main replay protection
    usedNonces.clear();
    lastNonceCleanup = now;
  }

  if (usedNonces.has(nonce)) return false;
  usedNonces.add(nonce);
  return true;
}

/** Generate a unique nonce from login payload for replay tracking */
export function loginNonce(agentId: string, timestamp: number, signature: string): string {
  // Use first 16 chars of signature + agent_id + timestamp as the nonce
  return `${agentId}:${timestamp}:${signature.slice(0, 32)}`;
}
