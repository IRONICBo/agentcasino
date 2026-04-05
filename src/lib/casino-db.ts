/**
 * casino-db.ts — Supabase persistence layer for Agent Casino
 *
 * All writes are fire-and-forget (non-blocking) so DB latency never affects gameplay.
 */

import { supabase } from './supabase';
import { Agent, WinnerInfo, Player } from './types';

// ── Agents ──────────────────────────────────────────────────────────────────

/** Load all agents from DB on server startup (includes claim tracking) */
export async function loadAgents(): Promise<Map<string, Agent>> {
  const { data, error } = await supabase
    .from('casino_agents')
    .select('id, name, chips, claims_today, last_claim_at, last_claim_date');

  if (error) { console.error('[casino-db] loadAgents:', error.message); return new Map(); }

  const map = new Map<string, Agent>();
  for (const row of data ?? []) {
    map.set(row.id, {
      id:            row.id,
      name:          row.name,
      chips:         row.chips,
      claimsToday:   row.claims_today    ?? 0,
      lastClaimAt:   row.last_claim_at   ?? 0,
      lastClaimDate: row.last_claim_date ?? '',
      createdAt:     Date.now(),
    });
  }
  return map;
}

/** Load a single agent's latest chips from DB (cross-instance consistency) */
export async function loadAgentChips(agentId: string): Promise<number | null> {
  const { data, error } = await supabase
    .from('casino_agents')
    .select('chips')
    .eq('id', agentId)
    .single();
  if (error || !data) return null;
  return data.chips;
}

/** Upsert agent — persists chips AND claim tracking.
 *  Returns a promise so callers on critical paths can await it. */
export async function saveAgent(agent: Agent): Promise<void> {
  const { error } = await supabase.from('casino_agents').upsert({
    id:              agent.id,
    name:            agent.name,
    chips:           agent.chips,
    claims_today:    agent.claimsToday,
    last_claim_at:   agent.lastClaimAt,
    last_claim_date: agent.lastClaimDate,
  }, { onConflict: 'id' });
  if (error) console.error('[casino-db] saveAgent:', error.message);
}

// ── Room Players ─────────────────────────────────────────────────────────────

export interface RoomPlayerRecord {
  agentId:   string;
  agentName: string;
  chips:     number;
  updatedAt: number; // ms since epoch
}

const STALE_MS = 15 * 60 * 1000; // 15 minutes — players idle longer than this are treated as disconnected

/** Load all seated players for a room (used on cold-start hydration) */
export async function loadRoomPlayers(roomId: string): Promise<RoomPlayerRecord[]> {
  const { data, error } = await supabase
    .from('casino_room_players')
    .select('agent_id, agent_name, chips_at_table, updated_at')
    .eq('room_id', roomId);
  if (error) { console.error('[casino-db] loadRoomPlayers:', error.message); return []; }
  return (data ?? []).map(row => ({
    agentId:   row.agent_id,
    agentName: row.agent_name,
    chips:     row.chips_at_table,
    updatedAt: new Date(row.updated_at).getTime(),
  }));
}

export { STALE_MS };

/** Load ALL room players across all rooms (for cold-start table discovery) */
export async function loadAllRoomPlayers(): Promise<(RoomPlayerRecord & { roomId: string })[]> {
  const { data, error } = await supabase
    .from('casino_room_players')
    .select('room_id, agent_id, agent_name, chips_at_table, updated_at');
  if (error) { console.error('[casino-db] loadAllRoomPlayers:', error.message); return []; }
  return (data ?? []).map(row => ({
    roomId:    row.room_id,
    agentId:   row.agent_id,
    agentName: row.agent_name,
    chips:     row.chips_at_table,
    updatedAt: new Date(row.updated_at).getTime(),
  }));
}

/** Upsert a player's seat + chip count (call on join and after each hand) */
export function saveRoomPlayer(roomId: string, agentId: string, agentName: string, chips: number): void {
  supabase.from('casino_room_players').upsert({
    room_id:        roomId,
    agent_id:       agentId,
    agent_name:     agentName,
    chips_at_table: chips,
  }, { onConflict: 'room_id,agent_id' }).then(({ error }) => {
    if (error) console.error('[casino-db] saveRoomPlayer:', error.message);
  });
}

/** Delete all casino_room_players rows not updated within STALE_MS. Returns removed count. */
export async function cleanStaleRoomPlayers(): Promise<number> {
  const cutoff = new Date(Date.now() - STALE_MS).toISOString();
  const { data, error } = await supabase
    .from('casino_room_players')
    .delete()
    .lt('updated_at', cutoff)
    .select('agent_id');
  if (error) { console.error('[casino-db] cleanStaleRoomPlayers:', error.message); return 0; }
  return data?.length ?? 0;
}

/** Remove a player from the persistent seat list (call on leave) */
export function removeRoomPlayer(roomId: string, agentId: string): void {
  supabase.from('casino_room_players')
    .delete()
    .eq('room_id', roomId)
    .eq('agent_id', agentId)
    .then(({ error }) => {
      if (error) console.error('[casino-db] removeRoomPlayer:', error.message);
    });
}

// ── Games ────────────────────────────────────────────────────────────────────

export interface GameRecord {
  roomId:      string;
  roomName:    string;
  categoryId:  string;
  smallBlind:  number;
  bigBlind:    number;
  pot:         number;
  players:     Player[];
  winners:     WinnerInfo[];
  startedAt:   number;
}

/** Record a completed game hand and per-player results */
export function recordGame(record: GameRecord): void {
  const winner = record.winners[0];

  supabase.from('casino_games').insert({
    room_id:      record.roomId,
    room_name:    record.roomName,
    category_id:  record.categoryId,
    small_blind:  record.smallBlind,
    big_blind:    record.bigBlind,
    pot:          record.pot,
    player_count: record.players.length,
    winner_id:    winner?.agentId ?? null,
    winner_name:  winner?.name ?? null,
    winning_hand: winner?.hand?.rank ?? null,
    started_at:   new Date(record.startedAt).toISOString(),
    ended_at:     new Date().toISOString(),
  }).select('id').single().then(({ data, error }) => {
    if (error) { console.error('[casino-db] recordGame:', error.message); return; }
    if (!data) return;

    const gameId = data.id;
    const playerRows = record.players.map(p => {
      const isWinner = record.winners.some(w => w.agentId === p.agentId);
      const winAmount = record.winners.find(w => w.agentId === p.agentId)?.amount ?? 0;
      return {
        game_id:    gameId,
        agent_id:   p.agentId,
        agent_name: p.name,
        buy_in:     0,  // buy-in tracking not in current model
        chips_end:  p.chips,
        profit:     isWinner ? winAmount : -p.currentBet,
        is_winner:  isWinner,
      };
    });

    supabase.from('casino_game_players').insert(playerRows).then(({ error: e }) => {
      if (e) console.error('[casino-db] recordGamePlayers:', e.message);
    });

    // Bump games_played for each participant
    const ids = record.players.map(p => p.agentId);
    supabase.from('casino_agents')
      .select('id, games_played')
      .in('id', ids)
      .then(({ data: agents }) => {
        if (!agents) return;
        for (const a of agents) {
          supabase.from('casino_agents')
            .update({ games_played: a.games_played + 1 })
            .eq('id', a.id)
            .then(() => {});
        }
      });
  });
}

// ── Chat — in-memory only (removed from Supabase) ──────────────────────────

// ── Leaderboard ──────────────────────────────────────────────────────────────

export async function getLeaderboard(limit = 50) {
  const [agentsResult, tableResult] = await Promise.all([
    supabase
      .from('casino_agents')
      .select('id, name, chips, games_played, games_won, total_won, vpip_hands, pfr_hands, aggressive_actions, passive_actions, showdown_hands, showdown_wins, cbet_opportunities, cbet_made')
      .order('chips', { ascending: false })
      .limit(limit * 2), // fetch extra so re-sorting by total chips still gives top N
    supabase
      .from('casino_room_players')
      .select('agent_id, chips_at_table'),
  ]);

  if (agentsResult.error) { console.error('[casino-db] getLeaderboard:', agentsResult.error.message); return []; }

  // Build map of at-table chips per agent
  const tableChips = new Map<string, number>();
  for (const row of tableResult.data ?? []) {
    tableChips.set(row.agent_id, (tableChips.get(row.agent_id) ?? 0) + row.chips_at_table);
  }

  return (agentsResult.data ?? [])
    .map(a => ({ ...a, chips: a.chips + (tableChips.get(a.id) ?? 0) }))
    .sort((a, b) => b.chips - a.chips)
    .slice(0, limit);
}

// ── Agent Stats (VPIP/PFR/AF etc.) ──────────────────────────────────────────

export interface AgentStatsRow {
  handsPlayed:        number;
  vpipHands:          number;
  pfrHands:           number;
  aggressiveActions:  number;
  passiveActions:     number;
  showdownHands:      number;
  showdownWins:       number;
  cbetOpportunities:  number;
  cbetMade:           number;
  bestWinStreak:      number;
  worstLossStreak:    number;
}

/** Persist poker stats for one agent (fire-and-forget). */
export function saveAgentStats(agentId: string, s: AgentStatsRow): void {
  supabase.from('casino_agents').update({
    games_played:       s.handsPlayed,
    vpip_hands:         s.vpipHands,
    pfr_hands:          s.pfrHands,
    aggressive_actions: s.aggressiveActions,
    passive_actions:    s.passiveActions,
    showdown_hands:     s.showdownHands,
    showdown_wins:      s.showdownWins,
    cbet_opportunities: s.cbetOpportunities,
    cbet_made:          s.cbetMade,
    best_win_streak:    s.bestWinStreak,
    worst_loss_streak:  s.worstLossStreak,
  }).eq('id', agentId).then(({ error }) => {
    if (error) console.error('[casino-db] saveAgentStats:', error.message);
  });
}

/** Load one agent's poker stats directly from DB (for cross-instance accurate reads). */
export async function loadAgentStats(agentId: string): Promise<AgentStatsRow | null> {
  const { data, error } = await supabase
    .from('casino_agents')
    .select('games_played, vpip_hands, pfr_hands, aggressive_actions, passive_actions, showdown_hands, showdown_wins, cbet_opportunities, cbet_made, best_win_streak, worst_loss_streak')
    .eq('id', agentId)
    .single();
  if (error || !data) return null;
  return {
    handsPlayed:       data.games_played       ?? 0,
    vpipHands:         data.vpip_hands         ?? 0,
    pfrHands:          data.pfr_hands          ?? 0,
    aggressiveActions: data.aggressive_actions ?? 0,
    passiveActions:    data.passive_actions    ?? 0,
    showdownHands:     data.showdown_hands     ?? 0,
    showdownWins:      data.showdown_wins      ?? 0,
    cbetOpportunities: data.cbet_opportunities ?? 0,
    cbetMade:          data.cbet_made          ?? 0,
    bestWinStreak:     data.best_win_streak    ?? 0,
    worstLossStreak:   data.worst_loss_streak  ?? 0,
  };
}

/** Load all agents' poker stats on cold-start. Returns map keyed by agent_id. */
export async function loadAllAgentStats(): Promise<Map<string, AgentStatsRow>> {
  const { data, error } = await supabase
    .from('casino_agents')
    .select('id, games_played, vpip_hands, pfr_hands, aggressive_actions, passive_actions, showdown_hands, showdown_wins, cbet_opportunities, cbet_made, best_win_streak, worst_loss_streak');
  if (error) { console.error('[casino-db] loadAllAgentStats:', error.message); return new Map(); }
  const map = new Map<string, AgentStatsRow>();
  for (const r of data ?? []) {
    map.set(r.id, {
      handsPlayed:       r.games_played       ?? 0,
      vpipHands:         r.vpip_hands         ?? 0,
      pfrHands:          r.pfr_hands          ?? 0,
      aggressiveActions: r.aggressive_actions ?? 0,
      passiveActions:    r.passive_actions    ?? 0,
      showdownHands:     r.showdown_hands     ?? 0,
      showdownWins:      r.showdown_wins      ?? 0,
      cbetOpportunities: r.cbet_opportunities ?? 0,
      cbetMade:          r.cbet_made          ?? 0,
      bestWinStreak:     r.best_win_streak    ?? 0,
      worstLossStreak:   r.worst_loss_streak  ?? 0,
    });
  }
  return map;
}

export async function getAgentHistory(agentId: string, limit = 20) {
  const { data, error } = await supabase
    .from('casino_game_players')
    .select(`
      id, is_winner, profit, chips_end, created_at,
      casino_games ( id, room_name, category_id, small_blind, big_blind, pot, winning_hand, ended_at )
    `)
    .eq('agent_id', agentId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) { console.error('[casino-db] getAgentHistory:', error.message); return []; }
  return (data ?? []).map(row => ({
    game_id:      (row.casino_games as any)?.id,
    room_name:    (row.casino_games as any)?.room_name,
    category_id:  (row.casino_games as any)?.category_id,
    big_blind:    (row.casino_games as any)?.big_blind,
    pot:          (row.casino_games as any)?.pot,
    winning_hand: (row.casino_games as any)?.winning_hand,
    is_winner:    row.is_winner,
    profit:       row.profit,
    chips_end:    row.chips_end,
    ended_at:     (row.casino_games as any)?.ended_at,
  }));
}

// ── Room Game State ──────────────────────────────────────────────────────────

/** Persist the full GameState JSON after every action (fire-and-forget). */
export function saveRoomState(roomId: string, game: unknown, stateVersion: number): void {
  supabase.from('casino_room_state').upsert({
    room_id:       roomId,
    game_json:     game,
    state_version: stateVersion,
  }, { onConflict: 'room_id' }).then(({ error }) => {
    if (error) console.error('[casino-db] saveRoomState:', error.message);
  });
}

/** Delete persisted state when a room becomes empty. */
export function deleteRoomState(roomId: string): void {
  supabase.from('casino_room_state')
    .delete().eq('room_id', roomId)
    .then(({ error }) => {
      if (error) console.error('[casino-db] deleteRoomState:', error.message);
    });
}

/** Load one room's saved game state (for cross-instance recovery). */
export async function loadRoomState(
  roomId: string,
): Promise<{ game: unknown; stateVersion: number } | null> {
  const { data, error } = await supabase
    .from('casino_room_state')
    .select('game_json, state_version')
    .eq('room_id', roomId)
    .single();
  if (error || !data) return null;
  return { game: data.game_json, stateVersion: data.state_version ?? 0 };
}

/** Load ALL rooms' game states on cold-start hydration. */
export async function loadAllRoomStates(): Promise<
  Map<string, { game: unknown; stateVersion: number }>
> {
  const { data, error } = await supabase
    .from('casino_room_state')
    .select('room_id, game_json, state_version');
  if (error) { console.error('[casino-db] loadAllRoomStates:', error.message); return new Map(); }
  const map = new Map<string, { game: unknown; stateVersion: number }>();
  for (const row of data ?? []) {
    map.set(row.room_id, { game: row.game_json, stateVersion: row.state_version ?? 0 });
  }
  return map;
}
