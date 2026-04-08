/**
 * Behavioral metrics — VPIP, PFR, AF, WTSD, W$SD, C-Bet.
 *
 * Game-state architecture: tracking state lives in game._stats (persisted in
 * game_json via Supabase), so it survives cross-instance routing on Vercel.
 * At hand end, accumulated deltas are flushed to casino_agents via atomic RPC.
 */

import type { PlayerAction } from './types';
import { incrementAgentStats, loadAgentStats, loadAllAgentStats } from './casino-db';

// ---------------------------------------------------------------------------
// Per-hand stats — stored in game._stats (part of game_json in DB)
// ---------------------------------------------------------------------------

export interface PerAgentStats {
  vpip: boolean;
  pfr: boolean;
  inHand: boolean;
  seenFlop: boolean;
  vpipDelta: number;
  pfrDelta: number;
  aggressiveDelta: number;
  passiveDelta: number;
  cbetOpportunityDelta: number;
  cbetMadeDelta: number;
}

export interface GameHandStats {
  agentIds: string[];
  smallBlindId: string;
  bigBlindId: string;
  preflopAggressorId: string | null;
  agents: Record<string, PerAgentStats>;
}

// ---------------------------------------------------------------------------
// Tracking functions — operate on game._stats (persisted in game_json)
// ---------------------------------------------------------------------------

/** Initialize stats tracking for a new hand. Stored in game._stats. */
export function initHandStats(
  game: any,
  agentIds: string[],
  sbIdx: number,
  bbIdx: number,
): void {
  const agents: Record<string, PerAgentStats> = {};
  for (const id of agentIds) {
    agents[id] = {
      vpip: false, pfr: false, inHand: true, seenFlop: false,
      vpipDelta: 0, pfrDelta: 0, aggressiveDelta: 0, passiveDelta: 0,
      cbetOpportunityDelta: 0, cbetMadeDelta: 0,
    };
  }
  game._stats = {
    agentIds,
    smallBlindId: agentIds[sbIdx] ?? '',
    bigBlindId: agentIds[bbIdx] ?? '',
    preflopAggressorId: null,
    agents,
  } as GameHandStats;
}

/** Record an action in the game stats. Reads/writes game._stats. */
export function recordAction(
  game: any,
  agentId: string,
  action: PlayerAction,
  phase: string,
): void {
  const h: GameHandStats | undefined = game._stats;
  if (!h) return;
  const a = h.agents[agentId];
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
 * Compute final stats at hand end and store flush instructions in game._pendingStatsFlush.
 * Does NOT do DB writes (those happen after save succeeds in room-manager).
 */
export function finalizeHandStats(
  game: any,
  winnerIds: string[],
  atShowdown: boolean,
): void {
  const h: GameHandStats | undefined = game._stats;
  if (!h) return;

  const pending: Array<{ agentId: string; deltas: Parameters<typeof incrementAgentStats>[1] }> = [];

  for (const id of h.agentIds) {
    const a = h.agents[id];
    if (!a) continue;

    const isWinner = winnerIds.includes(id);
    let showdownDelta = 0;
    let showdownWinDelta = 0;
    if (atShowdown && a.inHand) {
      showdownDelta = 1;
      if (isWinner) showdownWinDelta = 1;
    }

    pending.push({
      agentId: id,
      deltas: {
        isWinner,
        vpipHands: a.vpipDelta,
        pfrHands: a.pfrDelta,
        aggressiveActions: a.aggressiveDelta,
        passiveActions: a.passiveDelta,
        showdownHands: showdownDelta,
        showdownWins: showdownWinDelta,
        cbetOpportunities: a.cbetOpportunityDelta,
        cbetMade: a.cbetMadeDelta,
      },
    });
  }

  game._pendingStatsFlush = pending;
}

/**
 * Flush pending stats from game._pendingStatsFlush to DB via atomic RPC.
 * Call after saveWithRetry succeeds.
 */
export async function flushGameStats(game: any): Promise<void> {
  const pending: Array<{ agentId: string; deltas: Parameters<typeof incrementAgentStats>[1] }> | undefined = game?._pendingStatsFlush;
  if (!pending || pending.length === 0) return;

  await Promise.all(pending.map(p => incrementAgentStats(p.agentId, p.deltas)));
  delete game._pendingStatsFlush;
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
