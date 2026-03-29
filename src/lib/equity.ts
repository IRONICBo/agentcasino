/**
 * Monte Carlo poker equity calculator.
 * Given all players' hole cards and community cards, estimates each player's win probability.
 */

import { Card, Suit, Rank } from './types';
import { evaluateHand, compareHands } from './hand-evaluator';

const SUITS: Suit[] = ['hearts', 'diamonds', 'clubs', 'spades'];
const RANKS: Rank[] = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

function cardKey(c: Card): string {
  return `${c.rank}:${c.suit}`;
}

function fullDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ rank, suit });
    }
  }
  return deck;
}

/**
 * Calculate win probability for each active (non-folded) player.
 * Uses Monte Carlo simulation with `samples` random runouts.
 * Returns a Map of agentId → probability (0-1).
 */
export function calculateEquity(
  players: { agentId: string; holeCards: Card[]; hasFolded: boolean }[],
  communityCards: Card[],
  samples = 500,
): Map<string, number> {
  const active = players.filter(p => !p.hasFolded && p.holeCards.length === 2);
  const result = new Map<string, number>();

  // Folded players get 0
  for (const p of players) {
    if (p.hasFolded) result.set(p.agentId, 0);
  }

  if (active.length <= 1) {
    // Only one player left — 100% equity
    for (const p of active) result.set(p.agentId, 1);
    return result;
  }

  // If all 5 community cards are dealt, just evaluate directly
  if (communityCards.length === 5) {
    const hands = active.map(p => ({
      agentId: p.agentId,
      hand: evaluateHand(p.holeCards, communityCards),
    }));
    hands.sort((a, b) => compareHands(b.hand, a.hand));
    const bestValue = hands[0].hand.value;
    const winners = hands.filter(h => h.hand.value === bestValue);
    const share = 1 / winners.length;
    for (const p of active) {
      result.set(p.agentId, winners.some(w => w.agentId === p.agentId) ? share : 0);
    }
    return result;
  }

  // Build remaining deck
  const used = new Set<string>();
  for (const c of communityCards) used.add(cardKey(c));
  for (const p of active) {
    for (const c of p.holeCards) used.add(cardKey(c));
  }
  const remaining = fullDeck().filter(c => !used.has(cardKey(c)));

  const cardsNeeded = 5 - communityCards.length;
  const wins = new Map<string, number>();
  for (const p of active) wins.set(p.agentId, 0);

  for (let s = 0; s < samples; s++) {
    // Random runout: pick cardsNeeded from remaining
    const board = [...communityCards];
    const shuffled = [...remaining];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    for (let i = 0; i < cardsNeeded; i++) board.push(shuffled[i]);

    // Evaluate all hands
    const hands = active.map(p => ({
      agentId: p.agentId,
      hand: evaluateHand(p.holeCards, board),
    }));
    hands.sort((a, b) => compareHands(b.hand, a.hand));
    const bestValue = hands[0].hand.value;
    const winners = hands.filter(h => h.hand.value === bestValue);
    const share = 1 / winners.length;
    for (const w of winners) {
      wins.set(w.agentId, (wins.get(w.agentId) ?? 0) + share);
    }
  }

  for (const p of active) {
    result.set(p.agentId, (wins.get(p.agentId) ?? 0) / samples);
  }

  return result;
}
