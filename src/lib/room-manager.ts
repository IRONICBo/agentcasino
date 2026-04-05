import { Room, RoomInfo, StakeCategory, ClientGameState, ClientPlayer, GameState } from './types';
import { createGame, addPlayer, removePlayer, canStartGame, startNewHand, processAction, getValidActions } from './poker-engine';
import { deductChips, addChips, getAgent } from './chips';
import {
  loadRoomPlayers, saveRoomPlayer, removeRoomPlayer, STALE_MS,
  cleanStaleRoomPlayers, saveRoomState, deleteRoomState,
  loadRoomState, loadAllRoomStates, saveRoomStateWithVersion, deductChipsAtomic, addChipsAtomic,
  loadAllRoomPlayers,
} from './casino-db';
import { calculateEquity } from './equity';

// ─── Stake categories (fixed) ────────────────────────────────────────────────

export const STAKE_CATEGORIES: Omit<StakeCategory, 'tables'>[] = [
  {
    id: 'low',
    name: 'Low Stakes',
    description: 'Blinds 500/1,000 · Buy-in 20k–100k',
    smallBlind: 500,
    bigBlind: 1_000,
    minBuyIn: 20_000,
    maxBuyIn: 100_000,
    maxPlayers: 9,
  },
  {
    id: 'mid',
    name: 'Mid Stakes',
    description: 'Blinds 2,500/5,000 · Buy-in 100k–500k',
    smallBlind: 2_500,
    bigBlind: 5_000,
    minBuyIn: 100_000,
    maxBuyIn: 500_000,
    maxPlayers: 6,
  },
  {
    id: 'high',
    name: 'High Roller',
    description: 'Blinds 10,000/20,000 · Buy-in 200k–1M',
    smallBlind: 10_000,
    bigBlind: 20_000,
    minBuyIn: 200_000,
    maxBuyIn: 1_000_000,
    maxPlayers: 6,
  },
];

// ─── Fixed table counts per category ─────────────────────────────────────────

const MIN_TABLES: Record<string, number> = {
  low:  2,
  mid:  2,
  high: 2,
};

const SCALE_UP_THRESHOLD = 0.7;

// ─── Fun deterministic table names ───────────────────────────────────────────

const TABLE_NAMES: Record<string, string[]> = {
  low: [
    '\u{1F0CF} Dead Man\'s Hand',
    '\u{1F319} Midnight Felt',
    '\u{1F3B2} Ante Up Alley',
    '\u{1F40D} Snake Eyes',
    '\u{1F340} Lucky River',
    '\u{1F30A} The Flop House',
  ],
  mid: [
    '\u{1F981} The Lion\'s Den',
    '\u{1F525} Blaze & Raise',
    '\u26A1 Thunder Pot',
    '\u{1F3AF} Sharpshooter\'s Table',
  ],
  high: [
    '\u{1F480} The Graveyard Shift',
    '\u{1F451} High Roller Throne',
    '\u{1F311} Dark Money Room',
  ],
};

// ─── Types ───────────────────────────────────────────────────────────────────

interface ChatMsg {
  agentId: string;
  name: string;
  message: string;
  timestamp: number;
}

interface ExtendedRoom extends Room {
  categoryId: string;
  tableNumber: number;
  stateVersion: number;
  turnDeadlineMs: number | null;
  chatLog?: ChatMsg[];
}

// ─── Turn timer constant ───────────────────────────────────────────────────────

const TURN_TIMEOUT_MS = 30_000;

// ─── Showdown delay (ms before next hand starts) ────────────────────────────
const SHOWDOWN_DELAY_MS = 3_000;

// ─── Chat (in-memory, ephemeral by design) ─────────────────────────────────

const globalAny = globalThis as any;
if (!globalAny.__casino_chat) globalAny.__casino_chat = new Map<string, ChatMsg[]>();
const chatStore: Map<string, ChatMsg[]> = globalAny.__casino_chat;

const MAX_CHAT = 100;

export function addChatMessage(roomId: string, agentId: string, name: string, message: string): ChatMsg | null {
  // Verify room ID parses correctly
  if (!parseRoomId(roomId)) return null;
  let log = chatStore.get(roomId);
  if (!log) { log = []; chatStore.set(roomId, log); }
  const msg: ChatMsg = { agentId, name, message, timestamp: Date.now() };
  log.push(msg);
  if (log.length > MAX_CHAT) chatStore.set(roomId, log.slice(-MAX_CHAT));
  return msg;
}

export function getChatMessages(roomId: string, limit = 50): ChatMsg[] {
  const log = chatStore.get(roomId);
  if (!log) return [];
  return log.slice(-limit);
}

// ─── Equity cache ──────────────────────────────────────────────────────────

const equityCache = new Map<string, { version: number; equity: Map<string, number> }>();

// ─── Room ID helpers ─────────────────────────────────────────────────────────

function makeRoomId(categoryId: string, tableNumber: number): string {
  return `casino_${categoryId}_${tableNumber}`;
}

/** Parse room ID like "casino_low_3" into { categoryId: "low", tableNumber: 3 } */
export function parseRoomId(id: string): { categoryId: string; tableNumber: number } | null {
  const m = id.match(/^casino_(\w+)_(\d+)$/);
  if (!m) return null;
  const categoryId = m[1];
  if (!STAKE_CATEGORIES.find(c => c.id === categoryId)) return null;
  return { categoryId, tableNumber: parseInt(m[2], 10) };
}

// ─── Build room from constants ────────────────────────────────────────────────

function buildRoomShell(categoryId: string, tableNumber: number): ExtendedRoom {
  const cat = STAKE_CATEGORIES.find(c => c.id === categoryId)!;
  const names = TABLE_NAMES[categoryId] ?? [];
  const name = names[tableNumber - 1] ?? `Table ${tableNumber}`;
  return {
    id: makeRoomId(categoryId, tableNumber),
    name,
    categoryId,
    tableNumber,
    smallBlind: cat.smallBlind,
    bigBlind: cat.bigBlind,
    minBuyIn: cat.minBuyIn,
    maxBuyIn: cat.maxBuyIn,
    maxPlayers: cat.maxPlayers,
    game: null,
    spectators: [],
    createdAt: Date.now(),
    stateVersion: 0,
    turnDeadlineMs: null,
  };
}

// ─── Load room from DB ────────────────────────────────────────────────────────

/**
 * Loads a room by building its shell from constants and overlaying DB state.
 * Returns null only if the room ID is invalid.
 */
async function loadRoom(roomId: string): Promise<ExtendedRoom | null> {
  const parsed = parseRoomId(roomId);
  if (!parsed) return null;

  const room = buildRoomShell(parsed.categoryId, parsed.tableNumber);

  // Load game state from DB
  const saved = await loadRoomState(roomId);
  if (saved?.game) {
    const savedGame = saved.game as any;
    if (savedGame.phase && savedGame.phase !== 'waiting') {
      const { _turnDeadlineMs, _timeoutCounts, _nextHandAt, ...gameState } = savedGame;
      room.game = gameState;
      room.stateVersion = saved.stateVersion;
      if (_turnDeadlineMs && _turnDeadlineMs > Date.now()) {
        room.turnDeadlineMs = _turnDeadlineMs;
      }
    } else if (savedGame.phase === 'waiting') {
      // Restore waiting state with players
      const { _turnDeadlineMs, _timeoutCounts, _nextHandAt, ...gameState } = savedGame;
      room.game = gameState;
      room.stateVersion = saved.stateVersion;
    }
  }

  return room;
}

// ─── Optimistic lock save with retry ─────────────────────────────────────────

async function saveWithRetry(
  roomId: string,
  buildState: (room: ExtendedRoom) => Promise<{ game: GameState | null; error?: string }>,
  maxRetries = 3,
): Promise<{ success: boolean; room?: ExtendedRoom; error?: string }> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const room = await loadRoom(roomId);
    if (!room) return { success: false, error: 'Room not found' };

    const result = await buildState(room);
    if (result.error) return { success: false, error: result.error };

    if (!result.game) {
      // No game to save — delete room state
      await deleteRoomState(roomId);
      return { success: true, room };
    }

    // Build snapshot with metadata
    const snapshot: any = { ...result.game };
    if (room.turnDeadlineMs) snapshot._turnDeadlineMs = room.turnDeadlineMs;

    const saveResult = await saveRoomStateWithVersion(roomId, snapshot, room.stateVersion);
    if (saveResult.success) {
      room.game = result.game;
      room.stateVersion = saveResult.newVersion;
      return { success: true, room };
    }

    // Version conflict — retry
    console.log(`[rooms] version conflict on ${roomId}, attempt ${attempt + 1}/${maxRetries}`);
  }

  return { success: false, error: 'Conflict: too many concurrent updates, please retry' };
}

// ─── Enforce timeout (deadline-based) ─────────────────────────────────────────

/**
 * Check if the current player's turn has expired. If so, auto-fold.
 * Returns true if a timeout was enforced.
 */
async function enforceTimeout(room: ExtendedRoom): Promise<boolean> {
  if (!room.game || room.game.phase === 'waiting' || room.game.phase === 'showdown') return false;

  const gameAny = room.game as any;
  const deadline = gameAny._turnDeadlineMs ?? room.turnDeadlineMs;
  if (!deadline || Date.now() < deadline) return false;

  const currentPlayer = room.game.players[room.game.currentPlayerIndex];
  if (!currentPlayer) return false;

  // Track consecutive timeouts
  const timeoutCounts: Record<string, number> = gameAny._timeoutCounts ?? {};
  const key = currentPlayer.agentId;
  timeoutCounts[key] = (timeoutCounts[key] ?? 0) + 1;

  if (timeoutCounts[key] >= 3) {
    // Kick after 3 consecutive timeouts
    console.log(`[kick] ${currentPlayer.name} kicked from ${room.id} after ${timeoutCounts[key]} consecutive timeouts`);
    delete timeoutCounts[key];

    const player = removePlayer(room.game, currentPlayer.agentId);
    if (player) {
      const totalReturn = player.chips + player.currentBet;
      if (totalReturn > 0) {
        await addChipsAtomic(currentPlayer.agentId, totalReturn);
        room.game.pot = Math.max(0, room.game.pot - player.currentBet);
      }
    }
    await removeRoomPlayer(room.id, currentPlayer.agentId);
  } else {
    // Auto-fold
    console.log(`[auto-fold] ${currentPlayer.name} timed out in ${room.id} (${timeoutCounts[key]}/3)`);
    processAction(room.game, currentPlayer.agentId, 'fold');
  }

  // Update timeout tracking and new deadline in game state
  (room.game as any)._timeoutCounts = timeoutCounts;

  // Set new deadline for next player if game is still active
  const phase = room.game.phase as string;
  if (phase !== 'waiting' && phase !== 'showdown') {
    room.turnDeadlineMs = Date.now() + TURN_TIMEOUT_MS;
    (room.game as any)._turnDeadlineMs = room.turnDeadlineMs;
  } else {
    room.turnDeadlineMs = null;
  }

  return true;
}

/**
 * Public enforceTimeout: loads room from DB, enforces, saves.
 * Called from route.ts before returning game_state or processing play.
 */
export async function enforceTimeoutForRoom(roomId: string): Promise<void> {
  const room = await loadRoom(roomId);
  if (!room || !room.game) return;

  let changed = await enforceTimeout(room);
  // Might need multiple consecutive timeouts if multiple players timed out
  while (changed) {
    // Save intermediate state
    const snapshot: any = { ...room.game };
    if (room.turnDeadlineMs) snapshot._turnDeadlineMs = room.turnDeadlineMs;
    const saveResult = await saveRoomStateWithVersion(roomId, snapshot, room.stateVersion);
    if (saveResult.success) {
      room.stateVersion = saveResult.newVersion;
    }
    changed = await enforceTimeout(room);
  }
}

// ─── Join / Leave ─────────────────────────────────────────────────────────────

export async function joinRoom(roomId: string, agentId: string, agentName: string, buyIn: number): Promise<string | null> {
  const parsed = parseRoomId(roomId);
  if (!parsed) return 'Room not found';

  const cat = STAKE_CATEGORIES.find(c => c.id === parsed.categoryId);
  if (!cat) return 'Room not found';

  if (!Number.isFinite(buyIn) || buyIn < cat.minBuyIn || buyIn > cat.maxBuyIn) {
    return `Buy-in must be between ${cat.minBuyIn.toLocaleString()} and ${cat.maxBuyIn.toLocaleString()}`;
  }

  const agent = await getAgent(agentId);
  if (!agent) return 'Agent not found. Register first.';
  if (agent.chips < buyIn) {
    return `Not enough chips. You have ${agent.chips.toLocaleString()}, need ${buyIn.toLocaleString()}`;
  }

  // Deduct chips atomically FIRST
  const newBalance = await deductChipsAtomic(agentId, buyIn);
  if (newBalance === null) return 'Failed to deduct chips (insufficient balance or conflict)';

  const result = await saveWithRetry(roomId, async (room) => {
    if (!room.game) {
      room.game = createGame(room.smallBlind, room.bigBlind);
    }

    if (room.game.players.length >= room.maxPlayers) {
      return { game: null, error: 'Room is full' };
    }

    if (room.game.players.find(p => p.agentId === agentId)) {
      return { game: null, error: 'Already at this table' };
    }

    const takenSeats = new Set(room.game.players.map(p => p.seatIndex));
    let seatIndex = -1;
    for (let i = 0; i < room.maxPlayers; i++) {
      if (!takenSeats.has(i)) { seatIndex = i; break; }
    }
    if (seatIndex === -1) return { game: null, error: 'No seats available' };

    if (!addPlayer(room.game, agentId, agentName, buyIn, seatIndex)) {
      return { game: null, error: 'Failed to join table' };
    }

    return { game: room.game };
  });

  if (!result.success) {
    // Refund chips on failure
    await addChipsAtomic(agentId, buyIn);
    return result.error || 'Failed to join';
  }

  await saveRoomPlayer(roomId, agentId, agentName, buyIn);

  // Auto-scale check
  await autoScaleUp(parsed.categoryId);

  return null;
}

export async function leaveRoom(roomId: string, agentId: string): Promise<void> {
  const room = await loadRoom(roomId);
  if (!room || !room.game) return;

  const player = removePlayer(room.game, agentId);
  if (player) {
    const totalReturn = player.chips + player.currentBet;
    if (totalReturn > 0) {
      await addChipsAtomic(agentId, totalReturn);
      room.game.pot = Math.max(0, room.game.pot - player.currentBet);
    }
  }

  room.spectators = room.spectators.filter(id => id !== agentId);
  await removeRoomPlayer(roomId, agentId);

  // Save updated state
  if (room.game.players.length === 0) {
    await deleteRoomState(roomId);
  } else {
    const snapshot: any = { ...room.game };
    await saveRoomStateWithVersion(roomId, snapshot, room.stateVersion);
  }
}

// ─── Game actions ─────────────────────────────────────────────────────────────

export async function handleAction(
  roomId: string,
  agentId: string,
  action: string,
  amount?: number,
  isTimeout = false,
): Promise<string | null> {
  const validActions = ['fold', 'check', 'call', 'raise', 'all_in'];
  if (!validActions.includes(action)) return 'Invalid action';

  const result = await saveWithRetry(roomId, async (room) => {
    if (!room.game) return { game: null, error: 'No active game' };

    // Enforce timeout before processing action
    await enforceTimeout(room);

    // Check if game ended due to timeout enforcement
    if (!room.game || room.game.phase === 'waiting' || room.game.phase === 'showdown') {
      // Return current state — the timeout changed things
      return { game: room.game };
    }

    const success = processAction(room.game, agentId, action as any, amount);
    if (!success) return { game: null, error: 'Invalid action for current game state' };

    // Real action resets consecutive timeout count
    if (!isTimeout) {
      const timeoutCounts: Record<string, number> = (room.game as any)._timeoutCounts ?? {};
      delete timeoutCounts[agentId];
      (room.game as any)._timeoutCounts = timeoutCounts;
    }

    // Set turn deadline for next player
    const actionPhase = room.game.phase as string;
    if (actionPhase !== 'waiting' && actionPhase !== 'showdown') {
      room.turnDeadlineMs = Date.now() + TURN_TIMEOUT_MS;
      (room.game as any)._turnDeadlineMs = room.turnDeadlineMs;
    } else {
      room.turnDeadlineMs = null;
      delete (room.game as any)._turnDeadlineMs;
    }

    // If showdown, set _nextHandAt deadline
    if (actionPhase === 'showdown') {
      (room.game as any)._nextHandAt = Date.now() + SHOWDOWN_DELAY_MS;
    }

    return { game: room.game };
  });

  if (!result.success) return result.error || 'Action failed';
  return null;
}

export async function tryStartGame(roomId: string): Promise<boolean> {
  const result = await saveWithRetry(roomId, async (room) => {
    if (!room.game) return { game: null, error: 'no game' };
    if (!canStartGame(room.game)) return { game: null, error: 'cannot start' };

    startNewHand(room.game, roomId, room.name);

    // Set turn deadline
    room.turnDeadlineMs = Date.now() + TURN_TIMEOUT_MS;
    (room.game as any)._turnDeadlineMs = room.turnDeadlineMs;
    (room.game as any)._timeoutCounts = {};

    return { game: room.game };
  });

  return result.success;
}

export async function tryStartNextHand(roomId: string): Promise<boolean> {
  const result = await saveWithRetry(roomId, async (room) => {
    if (!room.game) return { game: null, error: 'no game' };
    if (room.game.phase !== 'showdown') return { game: null, error: 'not showdown' };
    if (room.game.players.length < 2) return { game: null, error: 'not enough players' };

    // Check if showdown delay has passed
    const nextHandAt = (room.game as any)._nextHandAt;
    if (nextHandAt && Date.now() < nextHandAt) {
      return { game: null, error: 'showdown delay not elapsed' };
    }

    // Persist chip counts after each completed hand
    for (const p of room.game.players) {
      if (p.chips > 0) await saveRoomPlayer(roomId, p.agentId, p.name, p.chips);
    }

    // Remove busted players
    const bustedPlayers = room.game.players.filter(p => p.chips <= 0);
    for (const p of bustedPlayers) {
      console.log(`[rooms] busted player ${p.name} (${p.agentId}) removed from ${roomId}`);
      removePlayer(room.game, p.agentId);
      await removeRoomPlayer(roomId, p.agentId);
    }

    if (room.game.players.length < 2) return { game: null, error: 'not enough players after bust' };

    startNewHand(room.game);

    // Set turn deadline
    room.turnDeadlineMs = Date.now() + TURN_TIMEOUT_MS;
    (room.game as any)._turnDeadlineMs = room.turnDeadlineMs;
    (room.game as any)._timeoutCounts = {};
    delete (room.game as any)._nextHandAt;

    return { game: room.game };
  });

  return result.success;
}

// ─── Auto-scaling ──────────────────────────────────────────────────────────────

async function autoScaleUp(categoryId: string): Promise<string | null> {
  // Load all room players to figure out which tables have players
  const allPlayers = await loadAllRoomPlayers();
  const cat = STAKE_CATEGORIES.find(c => c.id === categoryId);
  if (!cat) return null;

  const minCount = MIN_TABLES[categoryId] ?? 1;

  // Find all table numbers in this category (minimum tables + any with players)
  const tableNumbers = new Set<number>();
  for (let i = 1; i <= minCount; i++) tableNumbers.add(i);
  for (const p of allPlayers) {
    const parsed = parseRoomId(p.roomId);
    if (parsed && parsed.categoryId === categoryId) {
      tableNumbers.add(parsed.tableNumber);
    }
  }

  // Check if all existing tables are >= 70% full
  let allBusy = true;
  for (const num of tableNumbers) {
    const rid = makeRoomId(categoryId, num);
    const playersAtTable = allPlayers.filter(p => p.roomId === rid).length;
    if (playersAtTable / cat.maxPlayers < SCALE_UP_THRESHOLD) {
      allBusy = false;
      break;
    }
  }

  if (!allBusy) return null;

  const nextNum = Math.max(...tableNumbers) + 1;
  const newRoomId = makeRoomId(categoryId, nextNum);
  console.log(`[rooms] Auto-scaled: ${newRoomId} (all ${tableNumbers.size} tables were >=${SCALE_UP_THRESHOLD * 100}% full)`);
  return newRoomId;
}

/**
 * Auto-scale down: remove empty tables beyond the minimum.
 * Called by the cleanup cron.
 */
export async function autoScaleDown(): Promise<number> {
  let removed = 0;
  const allPlayers = await loadAllRoomPlayers();

  for (const cat of STAKE_CATEGORIES) {
    const minCount = MIN_TABLES[cat.id] ?? 1;

    // Find all table numbers with players or game state
    const tableNumbers = new Set<number>();
    for (const p of allPlayers) {
      const parsed = parseRoomId(p.roomId);
      if (parsed && parsed.categoryId === cat.id) {
        tableNumbers.add(parsed.tableNumber);
      }
    }
    // Add minimum tables
    for (let i = 1; i <= minCount; i++) tableNumbers.add(i);

    // Remove empty tables beyond minimum (highest numbered first)
    const sorted = [...tableNumbers].sort((a, b) => b - a);
    let currentCount = sorted.length;
    for (const num of sorted) {
      if (currentCount <= minCount) break;
      const rid = makeRoomId(cat.id, num);
      const hasPlayers = allPlayers.some(p => p.roomId === rid);
      if (!hasPlayers) {
        await deleteRoomState(rid);
        currentCount--;
        removed++;
      }
    }
  }

  if (removed > 0) console.log(`[rooms] Auto-scaled down: removed ${removed} empty table(s)`);
  return removed;
}

// ─── Lookup ───────────────────────────────────────────────────────────────────

export async function getRoom(id: string): Promise<ExtendedRoom | null> {
  return loadRoom(id);
}

/** Returns the roomId of the first room where agentId is seated, or null */
export async function getAgentRoom(agentId: string): Promise<string | null> {
  const allPlayers = await loadAllRoomPlayers();
  const found = allPlayers.find(p => p.agentId === agentId);
  return found?.roomId ?? null;
}

// ─── State version ────────────────────────────────────────────────────────────

export async function getRoomStateVersion(roomId: string): Promise<number> {
  const saved = await loadRoomState(roomId);
  return saved?.stateVersion ?? 0;
}

/** Long-poll: wait up to maxWaitMs for stateVersion to exceed sinceVersion. */
export async function waitForStateChange(
  roomId: string,
  sinceVersion: number,
  maxWaitMs = 8_000,
): Promise<number> {
  const interval = 500;
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    const current = await getRoomStateVersion(roomId);
    if (current > sinceVersion) return current;
    await new Promise<void>(r => setTimeout(r, interval));
  }
  return await getRoomStateVersion(roomId);
}

// ─── Listing ──────────────────────────────────────────────────────────────────

function toRoomInfo(room: ExtendedRoom, playerCount: number): RoomInfo {
  const players = room.game?.players ?? [];
  return {
    id: room.id,
    name: room.name,
    playerCount,
    maxPlayers: room.maxPlayers,
    smallBlind: room.smallBlind,
    bigBlind: room.bigBlind,
    minBuyIn: room.minBuyIn,
    maxBuyIn: room.maxBuyIn,
    categoryId: room.categoryId,
    tableNumber: room.tableNumber,
    createdAt: room.createdAt,
    pot: room.game?.pot ?? 0,
    totalChips: players.reduce((s, p) => s + p.chips, 0),
  };
}

export async function listRooms(): Promise<RoomInfo[]> {
  const [allPlayers, allStates] = await Promise.all([
    loadAllRoomPlayers(),
    loadAllRoomStates(),
  ]);
  const playersByRoom = new Map<string, number>();
  for (const p of allPlayers) {
    playersByRoom.set(p.roomId, (playersByRoom.get(p.roomId) ?? 0) + 1);
  }

  const rooms: RoomInfo[] = [];

  for (const cat of STAKE_CATEGORIES) {
    const minCount = MIN_TABLES[cat.id] ?? 1;

    // Collect all table numbers: minimum + any with players or active games
    const tableNumbers = new Set<number>();
    for (let i = 1; i <= minCount; i++) tableNumbers.add(i);
    for (const p of allPlayers) {
      const parsed = parseRoomId(p.roomId);
      if (parsed && parsed.categoryId === cat.id) {
        tableNumbers.add(parsed.tableNumber);
      }
    }
    for (const [rid] of allStates) {
      const parsed = parseRoomId(rid);
      if (parsed && parsed.categoryId === cat.id) {
        tableNumbers.add(parsed.tableNumber);
      }
    }

    for (const num of [...tableNumbers].sort((a, b) => a - b)) {
      const rid = makeRoomId(cat.id, num);
      const shell = buildRoomShell(cat.id, num);
      const count = playersByRoom.get(rid) ?? 0;

      // Load game state for pot info
      const saved = await loadRoomState(rid);
      if (saved?.game) {
        const g = saved.game as any;
        shell.game = g;
        shell.stateVersion = saved.stateVersion;
      }

      // Use game_json player count as fallback if casino_room_players is empty
      const gamePlayerCount = shell.game?.players?.length ?? 0;
      rooms.push(toRoomInfo(shell, Math.max(count, gamePlayerCount)));
    }
  }

  return rooms;
}

export async function listRecommendedRooms(): Promise<RoomInfo[]> {
  const all = await listRooms();
  const active = all.filter(r => r.playerCount > 0);
  const activeIds = new Set(active.map(r => r.id));

  // Add 1 empty table per category as an "open seat" option
  const catsSeen = new Set<string>();
  const openSeats: RoomInfo[] = [];
  for (const cat of STAKE_CATEGORIES) {
    const empty = all
      .filter(r => r.categoryId === cat.id && !activeIds.has(r.id))
      .sort((a, b) => (a.tableNumber ?? 0) - (b.tableNumber ?? 0));
    if (empty.length > 0 && !catsSeen.has(cat.id)) {
      openSeats.push(empty[0]);
      catsSeen.add(cat.id);
    }
  }

  return [...active, ...openSeats].sort((a, b) => b.playerCount - a.playerCount);
}

export async function listCategories(recommended = false): Promise<(Omit<StakeCategory, 'tables'> & { tables: RoomInfo[] })[]> {
  const all = await listRooms();

  return STAKE_CATEGORIES.map(cat => {
    let tables = all
      .filter(r => r.categoryId === cat.id)
      .sort((a, b) => (b.pot ?? 0) - (a.pot ?? 0) || (b.totalChips ?? 0) - (a.totalChips ?? 0) || (a.tableNumber ?? 0) - (b.tableNumber ?? 0));

    if (recommended) {
      const active = tables.filter(t => t.playerCount > 0);
      const firstEmpty = tables.find(t => t.playerCount === 0);
      tables = active.length > 0
        ? (firstEmpty ? [...active, firstEmpty] : active)
        : (firstEmpty ? [firstEmpty] : []);
    }

    return { ...cat, tables };
  });
}

// ─── Client state ─────────────────────────────────────────────────────────────

export async function getClientGameState(roomId: string, viewerAgentId: string): Promise<ClientGameState | null> {
  const room = await loadRoom(roomId);
  if (!room || !room.game) return null;

  // Enforce any expired timeouts
  let changed = await enforceTimeout(room);
  while (changed) {
    const snapshot: any = { ...room.game };
    if (room.turnDeadlineMs) snapshot._turnDeadlineMs = room.turnDeadlineMs;
    const saveResult = await saveRoomStateWithVersion(roomId, snapshot, room.stateVersion);
    if (saveResult.success) room.stateVersion = saveResult.newVersion;
    changed = await enforceTimeout(room);
  }

  const game = room.game;
  if (!game) return null;

  const isShowdown = game.phase === 'showdown';

  // Calculate win probabilities
  const showEquity = game.phase !== 'waiting' && game.phase !== 'showdown' && game.players.some(p => p.holeCards.length === 2);
  let equity: Map<string, number> | null = null;
  if (showEquity) {
    const cached = equityCache.get(roomId);
    if (cached && cached.version === room.stateVersion) {
      equity = cached.equity;
    } else {
      equity = calculateEquity(
        game.players.map(p => ({ agentId: p.agentId, holeCards: p.holeCards, hasFolded: p.hasFolded })),
        game.communityCards,
      );
      equityCache.set(roomId, { version: room.stateVersion, equity });
    }
  }

  const players: ClientPlayer[] = game.players.map(p => ({
    agentId: p.agentId,
    name: p.name,
    seatIndex: p.seatIndex,
    chips: p.chips,
    holeCards: p.holeCards,
    currentBet: p.currentBet,
    hasFolded: p.hasFolded,
    hasActed: p.hasActed,
    isAllIn: p.isAllIn,
    isConnected: p.isConnected,
    winProbability: equity?.get(p.agentId) ?? null,
  }));

  const now = Date.now();
  const deadline = room.turnDeadlineMs ?? null;
  const turnTimeRemaining = deadline !== null ? Math.max(0, Math.round((deadline - now) / 1000)) : null;

  return {
    id: game.id,
    phase: game.phase,
    players,
    communityCards: game.communityCards,
    pot: game.pot,
    sidePots: game.sidePots,
    currentPlayerIndex: game.currentPlayerIndex,
    dealerIndex: game.dealerIndex,
    smallBlind: game.smallBlind,
    bigBlind: game.bigBlind,
    minRaise: game.minRaise,
    winners: game.winners,
    lastAction: game.lastAction,
    stateVersion: room.stateVersion ?? 0,
    turnDeadline: deadline,
    turnTimeRemaining,
  };
}

export async function getValidActionsForRoom(roomId: string): Promise<ReturnType<typeof getValidActions>> {
  const room = await loadRoom(roomId);
  if (!room || !room.game) return [];
  return getValidActions(room.game);
}

// ─── Heartbeat ────────────────────────────────────────────────────────────────

export async function heartbeatPlayer(roomId: string, agentId: string): Promise<boolean> {
  const dbPlayers = await loadRoomPlayers(roomId);
  const player = dbPlayers.find(p => p.agentId === agentId);
  if (!player) return false;
  await saveRoomPlayer(roomId, agentId, player.agentName, player.chips);
  return true;
}
