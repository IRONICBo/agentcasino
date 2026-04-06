import { v4 as uuid } from 'uuid';
import { Card, GameState, GamePhase, Player, PlayerAction, WinnerInfo, SidePot } from './types';
import { createDeck } from './deck';
import { evaluateHand, compareHands } from './hand-evaluator';
import { commitSeed, generateFairDeck } from './fairness';
import { trackHandStart, trackAction, trackHandEnd } from './stats';

export function createGame(smallBlind: number, bigBlind: number): GameState {
  return {
    id: uuid(),
    phase: 'waiting',
    players: [],
    communityCards: [],
    pot: 0,
    sidePots: [],
    currentPlayerIndex: -1,
    dealerIndex: 0,
    smallBlind,
    bigBlind,
    minRaise: bigBlind,
    deck: [],
    winners: null,
    lastAction: null,
  };
}

export function addPlayer(game: GameState, agentId: string, name: string, chips: number, seatIndex: number): boolean {
  if (game.players.length >= 9) return false;
  if (game.players.find(p => p.agentId === agentId)) return false;
  if (game.players.find(p => p.seatIndex === seatIndex)) return false;

  game.players.push({
    agentId,
    name,
    seatIndex,
    chips,
    holeCards: [],
    currentBet: 0,
    totalBetThisRound: 0,
    hasFolded: false,
    hasActed: false,
    isAllIn: false,
    isConnected: true,
    lastSeenAt: Date.now(),
    pendingLeave: false,
  });
  return true;
}

export function removePlayer(game: GameState, agentId: string): Player | null {
  const idx = game.players.findIndex(p => p.agentId === agentId);
  if (idx === -1) return null;
  const [player] = game.players.splice(idx, 1);

  if (game.players.length === 0) {
    game.currentPlayerIndex = 0;
    game.dealerIndex = 0;
    return player;
  }

  // Adjust dealerIndex after splice
  if (idx < game.dealerIndex) {
    game.dealerIndex--;
  }
  game.dealerIndex = game.dealerIndex % game.players.length;

  // Adjust currentPlayerIndex after splice
  if (idx < game.currentPlayerIndex) {
    game.currentPlayerIndex--;
  }
  game.currentPlayerIndex = game.currentPlayerIndex % game.players.length;

  return player;
}

/**
 * Gracefully remove a player mid-hand: fold + mark pendingLeave.
 * Between hands: remove immediately.
 * All-in: mark pendingLeave only (they stay for showdown).
 */
export function safeMidHandRemove(
  game: GameState,
  agentId: string,
): 'removed' | 'folded_pending' | 'pending' | 'not_found' {
  const player = game.players.find(p => p.agentId === agentId);
  if (!player) return 'not_found';

  // Between hands — remove immediately
  if (game.phase === 'waiting' || game.phase === 'showdown') {
    removePlayer(game, agentId);
    return 'removed';
  }

  // All-in — can't fold, just mark for removal after hand
  if (player.isAllIn) {
    player.pendingLeave = true;
    return 'pending';
  }

  // It's this player's turn — fold first, then mark
  const isCurrentTurn = game.players[game.currentPlayerIndex]?.agentId === agentId;
  if (isCurrentTurn) {
    processAction(game, agentId, 'fold');
  } else {
    // Not their turn — just mark as folded
    player.hasFolded = true;
  }

  player.pendingLeave = true;
  return 'folded_pending';
}

export function canStartGame(game: GameState): boolean {
  return game.phase === 'waiting' && game.players.length >= 2;
}

export function startNewHand(game: GameState, roomId?: string, roomName?: string): void {
  if (game.players.length < 2) return;

  // Generate new hand ID
  const handId = uuid();

  // === FAIRNESS PROTOCOL: Commit-Reveal ===
  // Step 1: Server commits to a seed (SHA-256 hash published)
  const { seedCommitment } = commitSeed(handId);

  // Step 2: Generate fair deck from committed seed
  // (In production, there would be a nonce collection phase here)
  const fairDeck = generateFairDeck(handId);
  game.deck = fairDeck || createDeck(); // fallback to CSPRNG if fairness fails

  game.id = handId;
  game.communityCards = [];
  game.pot = 0;
  game.sidePots = [];
  game.winners = null;
  game.lastAction = null;
  game.phase = 'preflop';

  // Advance dealer
  game.dealerIndex = (game.dealerIndex + 1) % game.players.length;

  // Reset players
  for (const p of game.players) {
    p.holeCards = [];
    p.currentBet = 0;
    p.totalBetThisRound = 0;
    p.hasFolded = false;
    p.hasActed = false;
    p.isAllIn = false;
  }

  // Deal hole cards
  for (const p of game.players) {
    p.holeCards = [game.deck.pop()!, game.deck.pop()!];
  }

  // Post blinds
  const sbIdx = game.players.length === 2
    ? game.dealerIndex
    : (game.dealerIndex + 1) % game.players.length;
  const bbIdx = (sbIdx + 1) % game.players.length;

  postBlind(game, sbIdx, game.smallBlind);
  postBlind(game, bbIdx, game.bigBlind);

  // Stats: track hand start
  trackHandStart(handId, game.players.map(p => p.agentId), sbIdx, bbIdx);

  game.minRaise = game.bigBlind;

  // Action starts left of big blind
  game.currentPlayerIndex = (bbIdx + 1) % game.players.length;
  skipFoldedAndAllIn(game);
}

function postBlind(game: GameState, playerIdx: number, amount: number): void {
  const p = game.players[playerIdx];
  const actual = Math.min(amount, p.chips);
  p.chips -= actual;
  p.currentBet = actual;
  p.totalBetThisRound = actual;
  game.pot += actual;
  if (p.chips === 0) p.isAllIn = true;
}

function skipFoldedAndAllIn(game: GameState): void {
  const activePlayers = game.players.filter(p => !p.hasFolded && !p.isAllIn);

  if (activePlayers.length <= 1) {
    // Everyone is folded or all-in (at most 1 active) — fast-forward to showdown
    if (activePlayers.length === 1) {
      // Point to the sole active player so they can act or the round completes
      const idx = game.players.indexOf(activePlayers[0]);
      if (idx !== -1) game.currentPlayerIndex = idx;
    }
    return;
  }

  let attempts = 0;
  while (attempts < game.players.length) {
    const p = game.players[game.currentPlayerIndex];
    if (!p.hasFolded && !p.isAllIn) return;
    game.currentPlayerIndex = (game.currentPlayerIndex + 1) % game.players.length;
    attempts++;
  }
}

export function getValidActions(game: GameState): { action: PlayerAction; minAmount?: number; maxAmount?: number }[] {
  if (game.phase === 'waiting' || game.phase === 'showdown') return [];

  const player = game.players[game.currentPlayerIndex];
  if (!player || player.hasFolded || player.isAllIn) return [];

  const highestBet = game.players.length > 0 ? Math.max(...game.players.map(p => p.currentBet)) : 0;
  const toCall = highestBet - player.currentBet;
  const actions: { action: PlayerAction; minAmount?: number; maxAmount?: number }[] = [];

  actions.push({ action: 'fold' });

  if (toCall === 0) {
    actions.push({ action: 'check' });
  } else {
    actions.push({ action: 'call', minAmount: Math.min(toCall, player.chips) });
  }

  const minRaiseTotal = highestBet + game.minRaise;
  if (player.chips > toCall) {
    actions.push({
      action: 'raise',
      minAmount: Math.min(minRaiseTotal - player.currentBet, player.chips),
      maxAmount: player.chips,
    });
  }

  actions.push({ action: 'all_in', minAmount: player.chips });

  return actions;
}

export function processAction(game: GameState, agentId: string, action: PlayerAction, amount?: number): boolean {
  const playerIdx = game.players.findIndex(p => p.agentId === agentId);
  if (playerIdx === -1 || playerIdx !== game.currentPlayerIndex) return false;

  const player = game.players[playerIdx];
  if (player.hasFolded || player.isAllIn) return false;

  const highestBet = game.players.length > 0 ? Math.max(...game.players.map(p => p.currentBet)) : 0;
  const toCall = highestBet - player.currentBet;

  switch (action) {
    case 'fold':
      player.hasFolded = true;
      break;

    case 'check':
      if (toCall > 0) return false;
      break;

    case 'call': {
      const callAmount = Math.min(toCall, player.chips);
      player.chips -= callAmount;
      player.currentBet += callAmount;
      player.totalBetThisRound += callAmount;
      game.pot += callAmount;
      if (player.chips === 0) player.isAllIn = true;
      break;
    }

    case 'raise': {
      if (!amount || !Number.isFinite(amount) || amount <= 0) return false;
      const raiseAmount = Math.min(amount, player.chips);
      if (raiseAmount < toCall) return false; // Must at least call
      player.chips -= raiseAmount;
      const newBet = player.currentBet + raiseAmount;
      const raiseOver = newBet - highestBet;
      if (raiseOver > 0) game.minRaise = Math.max(game.minRaise, raiseOver);
      player.currentBet = newBet;
      player.totalBetThisRound += raiseAmount;
      game.pot += raiseAmount;
      if (player.chips === 0) player.isAllIn = true;
      // Reset hasActed for others (they need to respond to raise)
      for (const p of game.players) {
        if (p.agentId !== agentId && !p.hasFolded && !p.isAllIn) {
          p.hasActed = false;
        }
      }
      break;
    }

    case 'all_in': {
      const allInAmount = player.chips;
      const newBet = player.currentBet + allInAmount;
      if (newBet > highestBet) {
        const raiseOver = newBet - highestBet;
        game.minRaise = Math.max(game.minRaise, raiseOver);
        for (const p of game.players) {
          if (p.agentId !== agentId && !p.hasFolded && !p.isAllIn) {
            p.hasActed = false;
          }
        }
      }
      player.chips = 0;
      player.currentBet = newBet;
      player.totalBetThisRound += allInAmount;
      game.pot += allInAmount;
      player.isAllIn = true;
      break;
    }

    default:
      return false;
  }

  player.hasActed = true;
  game.lastAction = { agentId, action, amount };

  // Stats tracking
  trackAction(game.id, agentId, action, game.phase);

  // Check if only one player remains
  const activePlayers = game.players.filter(p => !p.hasFolded);
  if (activePlayers.length === 1) {
    awardPotToLastPlayer(game, activePlayers[0]);
    return true;
  }

  // Check if betting round is complete
  if (isBettingRoundComplete(game)) {
    advancePhase(game);
  } else {
    // Move to next player
    game.currentPlayerIndex = (game.currentPlayerIndex + 1) % game.players.length;
    skipFoldedAndAllIn(game);
  }

  return true;
}

function isBettingRoundComplete(game: GameState): boolean {
  const activePlayers = game.players.filter(p => !p.hasFolded && !p.isAllIn);
  if (activePlayers.length === 0) return true;

  const nonFolded = game.players.filter(p => !p.hasFolded);
  const highestBet = nonFolded.length > 0 ? Math.max(...nonFolded.map(p => p.currentBet)) : 0;
  return activePlayers.every(p => p.hasActed && p.currentBet === highestBet);
}

export function advancePhase(game: GameState): void {
  // Reset for new betting round
  for (const p of game.players) {
    p.currentBet = 0;
    p.hasActed = false;
  }
  game.minRaise = game.bigBlind;

  const activePlayers = game.players.filter(p => !p.hasFolded && !p.isAllIn);

  switch (game.phase) {
    case 'preflop':
      game.phase = 'flop';
      game.deck.pop(); // burn
      game.communityCards.push(game.deck.pop()!, game.deck.pop()!, game.deck.pop()!);
      break;
    case 'flop':
      game.phase = 'turn';
      game.deck.pop(); // burn
      game.communityCards.push(game.deck.pop()!);
      break;
    case 'turn':
      game.phase = 'river';
      game.deck.pop(); // burn
      game.communityCards.push(game.deck.pop()!);
      break;
    case 'river':
      game.phase = 'showdown';
      resolveShowdown(game);
      return;
  }

  // If everyone is all-in, run out remaining cards
  if (activePlayers.length <= 1) {
    // Fast-forward to showdown
    while ((game.phase as string) !== 'showdown' && (game.phase as string) !== 'river') {
      advancePhase(game);
      if ((game.phase as string) === 'showdown') return;
    }
    if (game.phase === 'river') {
      game.phase = 'showdown';
      resolveShowdown(game);
    }
    return;
  }

  // Set action to first active player after dealer
  game.currentPlayerIndex = (game.dealerIndex + 1) % game.players.length;
  skipFoldedAndAllIn(game);
}

function awardPotToLastPlayer(game: GameState, winner: Player): void {
  game.phase = 'showdown';
  const amount = game.pot;
  winner.chips += amount;
  game.winners = [{
    agentId: winner.agentId,
    name: winner.name,
    amount,
    hand: { rank: 'high_card', value: 0, cards: [], description: 'Last player standing' },
  }];
  game.pot = 0;

  trackHandEnd(game.id, [winner.agentId], false);
}

function resolveShowdown(game: GameState): void {
  const activePlayers = game.players.filter(p => !p.hasFolded);

  // Calculate side pots
  const pots = calculateSidePots(game);
  const winners: WinnerInfo[] = [];

  for (const pot of pots) {
    const eligible = activePlayers.filter(p => pot.eligiblePlayerIds.includes(p.agentId));
    if (eligible.length === 0) continue;

    const hands = eligible.map(p => ({
      player: p,
      hand: evaluateHand(p.holeCards, game.communityCards),
    }));

    hands.sort((a, b) => compareHands(b.hand, a.hand));
    const bestValue = hands[0].hand.value;
    const potWinners = hands.filter(h => h.hand.value === bestValue);
    const share = Math.floor(pot.amount / potWinners.length);

    for (const w of potWinners) {
      w.player.chips += share;
      const existing = winners.find(x => x.agentId === w.player.agentId);
      if (existing) {
        existing.amount += share;
      } else {
        winners.push({
          agentId: w.player.agentId,
          name: w.player.name,
          amount: share,
          hand: w.hand,
        });
      }
    }
  }

  game.winners = winners;
  game.pot = 0;
  game.sidePots = pots;

  trackHandEnd(game.id, winners.map(w => w.agentId), true);
}

function calculateSidePots(game: GameState): SidePot[] {
  const activePlayers = game.players.filter(p => !p.hasFolded);
  const allInAmounts = [...new Set(
    activePlayers.filter(p => p.isAllIn).map(p => p.totalBetThisRound)
  )].sort((a, b) => a - b);

  if (allInAmounts.length === 0) {
    return [{
      amount: game.pot,
      eligiblePlayerIds: activePlayers.map(p => p.agentId),
    }];
  }

  const pots: SidePot[] = [];
  let prevLevel = 0;

  for (const level of allInAmounts) {
    const diff = level - prevLevel;
    const contributors = game.players.filter(p => !p.hasFolded && p.totalBetThisRound >= level);
    pots.push({
      amount: diff * contributors.length,
      eligiblePlayerIds: contributors.map(p => p.agentId),
    });
    prevLevel = level;
  }

  // Remaining pot for players not all-in
  const remainingPlayers = activePlayers.filter(p => !p.isAllIn);
  if (remainingPlayers.length > 0) {
    const accounted = pots.reduce((s, p) => s + p.amount, 0);
    const remaining = game.pot - accounted;
    if (remaining > 0) {
      pots.push({
        amount: remaining,
        eligiblePlayerIds: remainingPlayers.map(p => p.agentId),
      });
    }
  }

  return pots;
}
