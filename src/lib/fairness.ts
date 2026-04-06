/**
 * Provably Fair Card Dealing — Commit-Reveal Protocol (simplified)
 *
 * 1. COMMIT: Before dealing, generate a random seed, publish SHA-256(seed)
 * 2. DEAL: Shuffle deck deterministically using the seed
 * 3. REVEAL: After hand ends, reveal the seed so anyone can verify
 *
 * Fairness data (seedCommitment, seedReveal) is stored in-memory per hand.
 * Hand history and action recording are handled by casino-db.ts / stats.ts.
 */

import { randomBytes, createHash } from 'crypto';
import { Card } from './types';
import { createSeededDeck } from './deck';

// ── In-memory seed store (per serverless instance) ──────────────────────────

const globalAny = globalThis as any;
if (!globalAny.__casino_seeds) globalAny.__casino_seeds = new Map<string, string>();
const seedStore: Map<string, string> = globalAny.__casino_seeds;

function sha256(data: string): string {
  return createHash('sha256').update(data).digest('hex');
}

/** Generate a server seed and return its SHA-256 commitment. */
export function commitSeed(handId: string): { seedCommitment: string } {
  const serverSeed = randomBytes(32).toString('hex');
  seedStore.set(handId, serverSeed);
  // Trim to prevent unbounded growth
  if (seedStore.size > 500) {
    const first = seedStore.keys().next().value;
    if (first) seedStore.delete(first);
  }
  return { seedCommitment: sha256(serverSeed) };
}

/** Generate a deterministic deck from the committed seed. */
export function generateFairDeck(handId: string): Card[] | null {
  const seed = seedStore.get(handId);
  if (!seed) return null;
  return createSeededDeck(sha256(seed));
}
