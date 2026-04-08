/**
 * Behavioral metrics — VPIP, PFR, AF, WTSD, W$SD, C-Bet.
 *
 * DB-first architecture: per-hand deltas are accumulated in transient memory,
 * then flushed to Supabase via atomic RPC at hand end. No persistent in-memory state.
 */

import type { PlayerAction } from './types';
import { incrementAgentStats, loadAgentStats, loadAllAgentStats } from './casino-db';

// ---------------------------------------------------------------------------
// Per-hand transient state (cleared after hand resolves)
// ---------------------------------------------------------------------------

interface PerAgentHandState {
  vpip: boolean;
  pfr: boolean;
  inHand: boolean;  // hasn't folded yet
  seenFlop: boolean;
  // Delta accumulators for this hand
  vpipDelta: number;
  pfrDelta: number;
  aggressiveDelta: number;
  passiveDelta: number;
  cbetOpportunityDelta: number;
  cbetMadeDelta: number;
}

interface HandTracking {
  agentIds: string[];
  smallBlindId: string;
  bigBlindId: string;
  preflopAggressorId: string | null;
  agents: Map<string, PerAgentHandState>;
}

// Transient per-hand tracking — OK in memory (only lives during one hand)
const g = globalThis as any;
if (!g.__casino_hand_tracking) g.__casino_hand_tracking = new Map<string, HandTracking>();
const handTracking: Map<string, HandTracking> = g.__casino_hand_tracking;

// Pending stats flush promise from last trackHandEnd
let _pendingStatsFlush: Promise<void> | null = null;

// ---------------------------------------------------------------------------
// Tracking hooks — called from poker-engine
// ---------------------------------------------------------------------------

/**
 * Called when a new hand starts.
 * NOTE: Does NOT increment games_played — that's handled atomically by recordGame().
 */
export function trackHandStart(
  handId: string,
  agentIds: string[],
  sbIdx: number,
  bbIdx: number,
): void {
  const tracking: HandTracking = {
    agentIds,
    smallBlindId: agentIds[sbIdx] ?? '',
    bigBlindId: agentIds[bbIdx] ?? '',
    preflopAggressorId: null,
    agents: new Map(),
  };
  for (const id of agentIds) {
    tracking.agents.set(id, {
      vpip: false, pfr: false, inHand: true, seenFlop: false,
      vpipDelta: 0, pfrDelta: 0, aggressiveDelta: 0, passiveDelta: 0,
      cbetOpportunityDelta: 0, cbetMadeDelta: 0,
    });
  }
  handTracking.set(handId, tracking);
}

/**
 * Called after each player action in poker-engine.processAction.
 * Accumulates deltas in the per-hand transient state.
 */
export function trackAction(
  handId: string,
  agentId: string,
  action: PlayerAction,
  phase: string,
): void {
  const h = handTracking.get(handId);
  if (!h) return;
  const a = h.agents.get(agentId);
  if (!a) return;

  if (phase === 'preflop') {
    const isBlindCheck = (agentId === h.bigBlindId && action === 'check');

    switch (action) {
      case 'call':
        if (!a.vpip) { a.vpip = true; a.vpipDelta++; }
        a.passiveDelta++;
        break;
      case 'raise':
      case 'all_in':
        if (!a.vpip) { a.vpip = true; a.vpipDelta++; }
        if (!a.pfr) { a.pfr = true; a.pfrDelta++; }
        a.aggressiveDelta++;
        h.preflopAggressorId = agentId;
        break;
      case 'check':
        if (!isBlindCheck) a.passiveDelta++;
        break;
      case 'fold':
        a.inHand = false;
        break;
    }
  } else if (phase === 'flop') {
    if (!a.seenFlop) {
      a.seenFlop = true;
      if (h.preflopAggressorId === agentId && a.inHand) {
        a.cbetOpportunityDelta++;
        if (action === 'raise' || action === 'all_in') {
          a.cbetMadeDelta++;
        }
      }
    }

    switch (action) {
      case 'raise': case 'all_in': a.aggressiveDelta++; break;
      case 'call': a.passiveDelta++; break;
      case 'check': a.passiveDelta++; break;
      case 'fold': a.inHand = false; break;
    }
  } else if (phase === 'turn' || phase === 'river') {
    switch (action) {
      case 'raise': case 'all_in': a.aggressiveDelta++; break;
      case 'call': a.passiveDelta++; break;
      case 'check': a.passiveDelta++; break;
      case 'fold': a.inHand = false; break;
    }
  }
}

/**
 * Called when a hand ends. Flushes accumulated deltas to DB via atomic RPC.
 * Stores the flush promise — call flushPendingStats() to await it.
 */
export function trackHandEnd(
  handId: string,
  winnerIds: string[],
  atShowdown: boolean,
): void {
  const h = handTracking.get(handId);
  if (!h) return;

  // Build per-agent flush calls
  const flushCalls: Promise<void>[] = [];

  for (const id of h.agentIds) {
    const a = h.agents.get(id);
    if (!a) continue;

    const isWinner = winnerIds.includes(id);

    // Add showdown deltas
    let showdownDelta = 0;
    let showdownWinDelta = 0;
    if (atShowdown && a.inHand) {
      showdownDelta = 1;
      if (isWinner) showdownWinDelta = 1;
    }

    flushCalls.push(incrementAgentStats(id, {
      isWinner,
      vpipHands: a.vpipDelta,
      pfrHands: a.pfrDelta,
      aggressiveActions: a.aggressiveDelta,
      passiveActions: a.passiveDelta,
      showdownHands: showdownDelta,
      showdownWins: showdownWinDelta,
      cbetOpportunities: a.cbetOpportunityDelta,
      cbetMade: a.cbetMadeDelta,
    }));
  }

  handTracking.delete(handId);

  // Store the flush promise for the caller to await
  _pendingStatsFlush = Promise.all(flushCalls).then(() => {});
}

/**
 * Reset all delta accumulators for a hand before a retry attempt.
 * Call at the top of saveWithRetry's buildState callback so version-conflict
 * retries don't double-accumulate actions in the handTracking map.
 *
 * Resets: all numeric deltas, boolean VPIP/PFR guards, seenFlop gate, preflopAggressorId.
 * Does NOT reset: inHand (reflects fold state — replayed by processAction on retry).
 */
export function resetHandTrackingDeltas(handId: string): void {
  const h = handTracking.get(handId);
  if (!h) return;
  h.preflopAggressorId = null;
  for (const a of h.agents.values()) {
    a.vpip = false;
    a.vpipDelta = 0;
    a.pfr = false;
    a.pfrDelta = 0;
    a.seenFlop = false;
    a.aggressiveDelta = 0;
    a.passiveDelta = 0;
    a.cbetOpportunityDelta = 0;
    a.cbetMadeDelta = 0;
  }
}

/**
 * Await the pending stats flush from the last trackHandEnd call.
 * Call this after saving game state to ensure stats are persisted.
 */
export async function flushPendingStats(): Promise<void> {
  if (_pendingStatsFlush) {
    await _pendingStatsFlush;
    _pendingStatsFlush = null;
  }
}

// ---------------------------------------------------------------------------
// Computed stats for API — DB-first, no in-memory dependency
// ---------------------------------------------------------------------------

export interface AgentRawStats {
  handsPlayed: number;
  vpipHands: number;
  pfrHands: number;
  aggressiveActions: number;
  passiveActions: number;
  showdownHands: number;
  showdownWins: number;
  cbetOpportunities: number;
  cbetMade: number;
  bestWinStreak: number;
  worstLossStreak: number;
}

export interface ComputedStats {
  agent_id: string;
  hands_played: number;
  vpip_pct: number;
  pfr_pct: number;
  af: number;
  wtsd_pct: number;
  w_sd_pct: number;
  cbet_pct: number;
  style: string;
  current_streak: number;
  best_win_streak: number;
  worst_loss_streak: number;
  raw: AgentRawStats;
}

function pct(n: number, d: number): number {
  if (d === 0) return 0;
  return Math.round((n / d) * 1000) / 10;
}

function classifyStyle(vpip: number, af: number): string {
  if (vpip < 25 && af > 1.5) return 'TAG';
  if (vpip >= 25 && af > 1.5) return 'LAG';
  if (vpip < 25 && af <= 1.5) return 'Rock';
  return 'Calling Station';
}

function computeStats(agentId: string, r: AgentRawStats & { currentStreak?: number }): ComputedStats {
  const vpip = pct(r.vpipHands, r.handsPlayed);
  const pfr = pct(r.pfrHands, r.handsPlayed);
  const af = r.passiveActions === 0
    ? r.aggressiveActions > 0 ? 99 : 0
    : Math.round((r.aggressiveActions / r.passiveActions) * 100) / 100;
  return {
    agent_id: agentId,
    hands_played: r.handsPlayed,
    vpip_pct: vpip,
    pfr_pct: pfr,
    af,
    wtsd_pct: pct(r.showdownHands, r.handsPlayed),
    w_sd_pct: pct(r.showdownWins, r.showdownHands),
    cbet_pct: pct(r.cbetMade, r.cbetOpportunities),
    style: classifyStyle(vpip, af),
    current_streak: r.currentStreak ?? 0,
    best_win_streak: r.bestWinStreak,
    worst_loss_streak: r.worstLossStreak,
    raw: { ...r },
  };
}

/** DB-first stats for a single agent. */
export async function getStatsFromDB(agentId: string): Promise<ComputedStats> {
  const dbRow = await loadAgentStats(agentId);
  if (!dbRow) {
    return computeStats(agentId, {
      handsPlayed: 0, vpipHands: 0, pfrHands: 0,
      aggressiveActions: 0, passiveActions: 0,
      showdownHands: 0, showdownWins: 0,
      cbetOpportunities: 0, cbetMade: 0,
      bestWinStreak: 0, worstLossStreak: 0,
      currentStreak: 0,
    });
  }
  return computeStats(agentId, dbRow);
}

/** DB-first stats for all agents. */
export async function getAllStatsFromDB(): Promise<ComputedStats[]> {
  const all = await loadAllAgentStats();
  return Array.from(all.entries()).map(([id, row]) => computeStats(id, row));
}
