import { Card, HandRank, HandResult } from './types';
import { rankValue } from './deck';

const HAND_RANK_VALUES: Record<HandRank, number> = {
  high_card: 0,
  pair: 1,
  two_pair: 2,
  three_of_a_kind: 3,
  straight: 4,
  flush: 5,
  full_house: 6,
  four_of_a_kind: 7,
  straight_flush: 8,
  royal_flush: 9,
};

const HAND_RANK_NAMES: Record<HandRank, string> = {
  high_card: 'High Card',
  pair: 'Pair',
  two_pair: 'Two Pair',
  three_of_a_kind: 'Three of a Kind',
  straight: 'Straight',
  flush: 'Flush',
  full_house: 'Full House',
  four_of_a_kind: 'Four of a Kind',
  straight_flush: 'Straight Flush',
  royal_flush: 'Royal Flush',
};

// Generate all 5-card combinations from 7 cards
function combinations(cards: Card[], k: number): Card[][] {
  if (k === 0) return [[]];
  if (cards.length < k) return [];
  const [first, ...rest] = cards;
  const withFirst = combinations(rest, k - 1).map(c => [first, ...c]);
  const withoutFirst = combinations(rest, k);
  return [...withFirst, ...withoutFirst];
}

function evaluateFiveCards(cards: Card[]): { rank: HandRank; value: number } {
  const sorted = [...cards].sort((a, b) => rankValue(b.rank) - rankValue(a.rank));
  const values = sorted.map(c => rankValue(c.rank));

  const isFlush = sorted.every(c => c.suit === sorted[0].suit);

  // Check straight (including A-2-3-4-5 wheel)
  let isStraight = false;
  let straightHigh = values[0];
  if (
    values[0] - values[1] === 1 &&
    values[1] - values[2] === 1 &&
    values[2] - values[3] === 1 &&
    values[3] - values[4] === 1
  ) {
    isStraight = true;
  }
  // Wheel: A-2-3-4-5
  if (values[0] === 14 && values[1] === 5 && values[2] === 4 && values[3] === 3 && values[4] === 2) {
    isStraight = true;
    straightHigh = 5;
  }

  // Count ranks
  const counts = new Map<number, number>();
  for (const v of values) counts.set(v, (counts.get(v) || 0) + 1);
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);

  if (isFlush && isStraight) {
    const rank = straightHigh === 14 ? 'royal_flush' : 'straight_flush';
    return { rank, value: encodeValue(HAND_RANK_VALUES[rank], [straightHigh]) };
  }

  if (groups[0][1] === 4) {
    const quad = groups[0][0];
    const kicker = groups[1][0];
    return { rank: 'four_of_a_kind', value: encodeValue(7, [quad, kicker]) };
  }

  if (groups[0][1] === 3 && groups[1][1] === 2) {
    return { rank: 'full_house', value: encodeValue(6, [groups[0][0], groups[1][0]]) };
  }

  if (isFlush) {
    return { rank: 'flush', value: encodeValue(5, values) };
  }

  if (isStraight) {
    return { rank: 'straight', value: encodeValue(4, [straightHigh]) };
  }

  if (groups[0][1] === 3) {
    const kickers = groups.slice(1).map(g => g[0]).sort((a, b) => b - a);
    return { rank: 'three_of_a_kind', value: encodeValue(3, [groups[0][0], ...kickers]) };
  }

  if (groups[0][1] === 2 && groups[1][1] === 2) {
    const pairs = [groups[0][0], groups[1][0]].sort((a, b) => b - a);
    const kicker = groups[2][0];
    return { rank: 'two_pair', value: encodeValue(2, [...pairs, kicker]) };
  }

  if (groups[0][1] === 2) {
    const kickers = groups.slice(1).map(g => g[0]).sort((a, b) => b - a);
    return { rank: 'pair', value: encodeValue(1, [groups[0][0], ...kickers]) };
  }

  return { rank: 'high_card', value: encodeValue(0, values) };
}

function encodeValue(handRank: number, kickers: number[]): number {
  // Use base-15 encoding: hand rank * 15^5 + kicker[0] * 15^4 + ...
  let value = handRank;
  for (let i = 0; i < 5; i++) {
    value = value * 15 + (kickers[i] || 0);
  }
  return value;
}

export function evaluateHand(holeCards: Card[], communityCards: Card[]): HandResult {
  const allCards = [...holeCards, ...communityCards];
  const combos = combinations(allCards, 5);

  let bestResult: { rank: HandRank; value: number } | null = null;
  let bestCards: Card[] = [];

  for (const combo of combos) {
    const result = evaluateFiveCards(combo);
    if (!bestResult || result.value > bestResult.value) {
      bestResult = result;
      bestCards = combo;
    }
  }

  return {
    rank: bestResult!.rank,
    value: bestResult!.value,
    cards: bestCards,
    description: HAND_RANK_NAMES[bestResult!.rank],
  };
}

export function compareHands(a: HandResult, b: HandResult): number {
  return a.value - b.value;
}
