import { randomBytes, createHash } from 'crypto';
import { Card, Suit, Rank } from './types';

const SUITS: Suit[] = ['hearts', 'diamonds', 'clubs', 'spades'];
const RANKS: Rank[] = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

/** Create a standard 52-card deck (unshuffled). */
export function createOrderedDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ suit, rank });
    }
  }
  return deck;
}

/** Create and shuffle a deck using CSPRNG. */
export function createDeck(): Card[] {
  return csrngShuffle(createOrderedDeck());
}

/**
 * Create a deterministic deck from a seed string.
 * Used by the fairness protocol: seed = SHA-256(server_seed || nonce_1 || ... || nonce_n)
 */
export function createSeededDeck(seed: string): Card[] {
  return seededShuffle(createOrderedDeck(), seed);
}

/**
 * Fisher-Yates shuffle using CSPRNG (crypto.getRandomValues equivalent).
 * Each swap index is derived from cryptographically secure random bytes.
 */
export function csrngShuffle<T>(array: T[]): T[] {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = secureRandomInt(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Deterministic Fisher-Yates shuffle from a hex seed.
 * Produces the same deck for the same seed — publicly verifiable.
 * Uses successive SHA-256 hashes as the random source.
 */
export function seededShuffle<T>(array: T[], seed: string): T[] {
  const arr = [...array];
  let hashInput = seed;
  for (let i = arr.length - 1; i > 0; i--) {
    // Generate deterministic random bytes from seed chain
    const hash = createHash('sha256').update(hashInput + ':' + i).digest();
    // Use first 4 bytes as uint32, mod (i+1) for uniform distribution
    const rand = hash.readUInt32BE(0);
    const j = rand % (i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
    hashInput = hash.toString('hex');
  }
  return arr;
}

/** Generate a cryptographically secure random integer in [0, max). */
function secureRandomInt(max: number): number {
  if (max <= 1) return 0;
  // Use rejection sampling to avoid modulo bias
  const bytes = 4;
  const maxValid = Math.floor(0x100000000 / max) * max;
  let rand: number;
  do {
    const buf = randomBytes(bytes);
    rand = buf.readUInt32BE(0);
  } while (rand >= maxValid);
  return rand % max;
}

export function rankValue(rank: Rank): number {
  const map: Record<Rank, number> = {
    '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8,
    '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14,
  };
  return map[rank];
}

export function cardToString(card: Card): string {
  const suitSymbols: Record<Suit, string> = {
    hearts: '♥', diamonds: '♦', clubs: '♣', spades: '♠',
  };
  return `${card.rank}${suitSymbols[card.suit]}`;
}
