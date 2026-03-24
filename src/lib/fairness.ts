/**
 * Provably Fair Card Dealing — Commit-Reveal Protocol
 *
 * How it works:
 * 1. COMMIT: Before dealing, server generates a random seed and publishes
 *    SHA-256(seed) as the "seed commitment". Players can't see the seed yet.
 *
 * 2. NONCE: Players can optionally submit a nonce (random string) before cards
 *    are dealt. This ensures the server can't manipulate the shuffle after
 *    seeing player nonces.
 *
 * 3. DEAL: The deck is shuffled deterministically using:
 *    combined_seed = SHA-256(server_seed || nonce_1 || nonce_2 || ... || nonce_n)
 *    The deck order is fully determined by this combined seed.
 *
 * 4. REVEAL: After the hand ends, the server reveals the original seed.
 *    Anyone can verify:
 *    - SHA-256(revealed_seed) === the commitment from step 1
 *    - The deck shuffled with the combined seed matches the cards dealt
 *
 * This prevents:
 * - Server peeking at player nonces to manipulate the deck (commitment is before nonces)
 * - Server changing the seed after the hand (commitment locks it)
 * - Dispute about what cards were dealt (everything is deterministic + verifiable)
 */

import { randomBytes, createHash } from 'crypto';
import { Card } from './types';
import { createSeededDeck, cardToString } from './deck';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FairnessRecord {
  handId: string;
  /** SHA-256 hash of the server seed, published before dealing */
  seedCommitment: string;
  /** The actual server seed, revealed after the hand */
  seedReveal: string | null;
  /** Player nonces submitted before dealing */
  playerNonces: Record<string, string>;
  /** Combined seed = SHA-256(serverSeed || sorted nonces) */
  combinedSeed: string | null;
  /** The deck order produced by the combined seed */
  deckOrder: string[] | null;
  /** Timestamp of commitment */
  committedAt: number;
  /** Timestamp of reveal */
  revealedAt: number | null;
  /** Was this verified successfully? */
  verified: boolean | null;
}

export interface HandRecord {
  handId: string;
  roomId: string;
  roomName: string;
  /** Players at start of hand */
  players: { agentId: string; name: string; startingChips: number; seatIndex: number }[];
  /** Hole cards dealt to each player (revealed after showdown) */
  holeCards: Record<string, { rank: string; suit: string }[]>;
  /** Community cards in order dealt */
  communityCards: { rank: string; suit: string }[];
  /** Every action taken during the hand */
  actions: HandAction[];
  /** Pot(s) and winners */
  pots: { amount: number; winners: string[] }[];
  winners: { agentId: string; name: string; amount: number; hand: string }[];
  /** Fairness proof */
  fairness: FairnessRecord;
  /** Timestamps */
  startedAt: number;
  endedAt: number | null;
}

export interface HandAction {
  agentId: string;
  name: string;
  action: string;
  amount?: number;
  phase: string;
  timestamp: number;
}

// ---------------------------------------------------------------------------
// Global state
// ---------------------------------------------------------------------------

const globalAny = globalThis as any;
if (!globalAny.__casino_fairness) {
  globalAny.__casino_fairness = new Map<string, FairnessRecord>();
}
if (!globalAny.__casino_hand_history) {
  globalAny.__casino_hand_history = new Map<string, HandRecord>();
}
if (!globalAny.__casino_hand_history_by_room) {
  globalAny.__casino_hand_history_by_room = new Map<string, string[]>();
}
const fairnessRecords: Map<string, FairnessRecord> = globalAny.__casino_fairness;
const handHistory: Map<string, HandRecord> = globalAny.__casino_hand_history;
const handsByRoom: Map<string, string[]> = globalAny.__casino_hand_history_by_room;

// ---------------------------------------------------------------------------
// Commit phase — called before dealing
// ---------------------------------------------------------------------------

/** Generate a server seed and commit its hash. Returns the commitment. */
export function commitSeed(handId: string): { seedCommitment: string; serverSeed: string } {
  const serverSeed = randomBytes(32).toString('hex');
  const seedCommitment = sha256(serverSeed);

  const record: FairnessRecord = {
    handId,
    seedCommitment,
    seedReveal: null,
    playerNonces: {},
    combinedSeed: null,
    deckOrder: null,
    committedAt: Date.now(),
    revealedAt: null,
    verified: null,
  };
  fairnessRecords.set(handId, record);

  // Keep serverSeed in memory (NOT in the public record) until reveal
  (record as any)._serverSeed = serverSeed;

  return { seedCommitment, serverSeed };
}

// ---------------------------------------------------------------------------
// Nonce phase — players submit nonces before dealing
// ---------------------------------------------------------------------------

export function submitNonce(handId: string, agentId: string, nonce: string): boolean {
  const record = fairnessRecords.get(handId);
  if (!record) return false;
  if (record.combinedSeed) return false; // already dealt
  record.playerNonces[agentId] = nonce;
  return true;
}

// ---------------------------------------------------------------------------
// Deal phase — combine seed + nonces, generate deterministic deck
// ---------------------------------------------------------------------------

export function generateFairDeck(handId: string): Card[] | null {
  const record = fairnessRecords.get(handId);
  if (!record) return null;

  const serverSeed = (record as any)._serverSeed as string;
  if (!serverSeed) return null;

  // Sort nonces by agent ID for deterministic ordering
  const sortedAgentIds = Object.keys(record.playerNonces).sort();
  const nonceString = sortedAgentIds.map(id => record.playerNonces[id]).join('');

  // Combined seed = SHA-256(serverSeed || nonce1 || nonce2 || ...)
  const combinedSeed = sha256(serverSeed + nonceString);
  record.combinedSeed = combinedSeed;

  // Generate deterministic deck
  const deck = createSeededDeck(combinedSeed);
  record.deckOrder = deck.map(c => cardToString(c));

  return deck;
}

// ---------------------------------------------------------------------------
// Reveal phase — called after hand ends
// ---------------------------------------------------------------------------

export function revealSeed(handId: string): FairnessRecord | null {
  const record = fairnessRecords.get(handId);
  if (!record) return null;

  const serverSeed = (record as any)._serverSeed as string;
  record.seedReveal = serverSeed;
  record.revealedAt = Date.now();
  delete (record as any)._serverSeed; // clean up

  return record;
}

// ---------------------------------------------------------------------------
// Verification — anyone can verify a hand was fair
// ---------------------------------------------------------------------------

export interface VerificationResult {
  valid: boolean;
  checks: {
    seedCommitmentValid: boolean;
    combinedSeedValid: boolean;
    deckOrderValid: boolean;
  };
  error?: string;
}

export function verifyFairness(handId: string): VerificationResult {
  const record = fairnessRecords.get(handId);
  if (!record) {
    return { valid: false, checks: { seedCommitmentValid: false, combinedSeedValid: false, deckOrderValid: false }, error: 'Hand not found' };
  }
  if (!record.seedReveal) {
    return { valid: false, checks: { seedCommitmentValid: false, combinedSeedValid: false, deckOrderValid: false }, error: 'Seed not yet revealed' };
  }

  // Check 1: SHA-256(revealed_seed) === commitment
  const expectedCommitment = sha256(record.seedReveal);
  const seedCommitmentValid = expectedCommitment === record.seedCommitment;

  // Check 2: Combined seed matches
  const sortedAgentIds = Object.keys(record.playerNonces).sort();
  const nonceString = sortedAgentIds.map(id => record.playerNonces[id]).join('');
  const expectedCombined = sha256(record.seedReveal + nonceString);
  const combinedSeedValid = expectedCombined === record.combinedSeed;

  // Check 3: Deck order matches
  let deckOrderValid = false;
  if (record.combinedSeed && record.deckOrder) {
    const expectedDeck = createSeededDeck(record.combinedSeed);
    const expectedOrder = expectedDeck.map(c => cardToString(c));
    deckOrderValid = JSON.stringify(expectedOrder) === JSON.stringify(record.deckOrder);
  }

  const valid = seedCommitmentValid && combinedSeedValid && deckOrderValid;
  return { valid, checks: { seedCommitmentValid, combinedSeedValid, deckOrderValid } };
}

// ---------------------------------------------------------------------------
// Hand History — record every action
// ---------------------------------------------------------------------------

export function startHandRecord(
  handId: string,
  roomId: string,
  roomName: string,
  players: { agentId: string; name: string; startingChips: number; seatIndex: number }[],
  fairness: FairnessRecord,
): void {
  const record: HandRecord = {
    handId,
    roomId,
    roomName,
    players,
    holeCards: {},
    communityCards: [],
    actions: [],
    pots: [],
    winners: [],
    fairness,
    startedAt: Date.now(),
    endedAt: null,
  };
  handHistory.set(handId, record);

  // Index by room
  if (!handsByRoom.has(roomId)) handsByRoom.set(roomId, []);
  handsByRoom.get(roomId)!.push(handId);
}

export function recordHoleCards(handId: string, agentId: string, cards: Card[]): void {
  const record = handHistory.get(handId);
  if (record) {
    record.holeCards[agentId] = cards.map(c => ({ rank: c.rank, suit: c.suit }));
  }
}

export function recordCommunityCards(handId: string, cards: Card[]): void {
  const record = handHistory.get(handId);
  if (record) {
    record.communityCards = cards.map(c => ({ rank: c.rank, suit: c.suit }));
  }
}

export function recordAction(
  handId: string,
  agentId: string,
  name: string,
  action: string,
  phase: string,
  amount?: number,
): void {
  const record = handHistory.get(handId);
  if (record) {
    record.actions.push({ agentId, name, action, amount, phase, timestamp: Date.now() });
  }
}

export function endHandRecord(
  handId: string,
  winners: { agentId: string; name: string; amount: number; hand: string }[],
  pots: { amount: number; winners: string[] }[],
  communityCards: Card[],
): void {
  const record = handHistory.get(handId);
  if (record) {
    record.winners = winners;
    record.pots = pots;
    record.communityCards = communityCards.map(c => ({ rank: c.rank, suit: c.suit }));
    record.endedAt = Date.now();

    // Reveal the seed
    revealSeed(handId);
  }
}

// ---------------------------------------------------------------------------
// Query hand history
// ---------------------------------------------------------------------------

export function getHandRecord(handId: string): HandRecord | null {
  return handHistory.get(handId) || null;
}

export function getHandsByRoom(roomId: string, limit = 50): HandRecord[] {
  const ids = handsByRoom.get(roomId) || [];
  return ids
    .slice(-limit)
    .reverse()
    .map(id => handHistory.get(id)!)
    .filter(Boolean);
}

export function getHandsByAgent(agentId: string, limit = 50): HandRecord[] {
  const records: HandRecord[] = [];
  for (const record of handHistory.values()) {
    if (record.players.some(p => p.agentId === agentId)) {
      records.push(record);
    }
  }
  return records.slice(-limit).reverse();
}

export function getFairnessRecord(handId: string): FairnessRecord | null {
  return fairnessRecords.get(handId) || null;
}

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function sha256(data: string): string {
  return createHash('sha256').update(data).digest('hex');
}
