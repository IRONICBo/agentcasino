import { v4 as uuid } from 'uuid';
import { Room, RoomInfo, ClientGameState, ClientPlayer } from './types';
import { createGame, addPlayer, removePlayer, canStartGame, startNewHand, processAction, getValidActions } from './poker-engine';
import { getOrCreateAgent, deductChips, addChips, getAgent } from './chips';

// Global singleton to share state between API routes and Socket.IO
const globalAny = globalThis as any;
if (!globalAny.__casino_rooms) {
  globalAny.__casino_rooms = new Map<string, Room>();
}
const rooms: Map<string, Room> = globalAny.__casino_rooms;

// Create default rooms on startup
export function initDefaultRooms(): void {
  if (rooms.size > 0) return; // already initialized
  createRoom('Low Stakes Lounge', 500, 1000, 20_000, 100_000, 9);
  createRoom('Mid Stakes Arena', 2500, 5000, 100_000, 500_000, 6);
  createRoom('High Roller Suite', 10_000, 20_000, 400_000, 2_000_000, 6);
}

export function createRoom(
  name: string,
  smallBlind: number,
  bigBlind: number,
  minBuyIn: number,
  maxBuyIn: number,
  maxPlayers: number,
): Room {
  const room: Room = {
    id: uuid(),
    name,
    smallBlind,
    bigBlind,
    minBuyIn,
    maxBuyIn,
    maxPlayers,
    game: null,
    spectators: [],
    createdAt: Date.now(),
  };
  rooms.set(room.id, room);
  return room;
}

export function getRoom(id: string): Room | undefined {
  return rooms.get(id);
}

export function listRooms(): RoomInfo[] {
  return Array.from(rooms.values()).map(r => ({
    id: r.id,
    name: r.name,
    playerCount: r.game?.players.length ?? 0,
    maxPlayers: r.maxPlayers,
    smallBlind: r.smallBlind,
    bigBlind: r.bigBlind,
  }));
}

export function joinRoom(roomId: string, agentId: string, agentName: string, buyIn: number): string | null {
  const room = rooms.get(roomId);
  if (!room) return 'Room not found';

  if (buyIn < room.minBuyIn || buyIn > room.maxBuyIn) {
    return `Buy-in must be between ${room.minBuyIn.toLocaleString()} and ${room.maxBuyIn.toLocaleString()}`;
  }

  const agent = getOrCreateAgent(agentId, agentName);
  if (agent.chips < buyIn) {
    return `Not enough chips. You have ${agent.chips.toLocaleString()}, need ${buyIn.toLocaleString()}`;
  }

  if (!room.game) {
    room.game = createGame(room.smallBlind, room.bigBlind);
  }

  if (room.game.players.length >= room.maxPlayers) {
    return 'Room is full';
  }

  if (room.game.players.find(p => p.agentId === agentId)) {
    return 'Already at this table';
  }

  // Find open seat
  const takenSeats = new Set(room.game.players.map(p => p.seatIndex));
  let seatIndex = -1;
  for (let i = 0; i < room.maxPlayers; i++) {
    if (!takenSeats.has(i)) { seatIndex = i; break; }
  }
  if (seatIndex === -1) return 'No seats available';

  // Deduct chips from agent's bank
  if (!deductChips(agentId, buyIn)) return 'Failed to deduct chips';

  if (!addPlayer(room.game, agentId, agentName, buyIn, seatIndex)) {
    addChips(agentId, buyIn); // refund
    return 'Failed to join table';
  }

  return null; // success
}

export function leaveRoom(roomId: string, agentId: string): void {
  const room = rooms.get(roomId);
  if (!room || !room.game) return;

  const player = removePlayer(room.game, agentId);
  if (player) {
    // Return remaining chips to agent's bank
    addChips(agentId, player.chips);
  }

  // Remove from spectators too
  room.spectators = room.spectators.filter(id => id !== agentId);
}

export function handleAction(roomId: string, agentId: string, action: string, amount?: number): string | null {
  const room = rooms.get(roomId);
  if (!room || !room.game) return 'No active game';

  const validActions = ['fold', 'check', 'call', 'raise', 'all_in'];
  if (!validActions.includes(action)) return 'Invalid action';

  const success = processAction(room.game, agentId, action as any, amount);
  if (!success) return 'Invalid action for current game state';

  return null;
}

export function tryStartGame(roomId: string): boolean {
  const room = rooms.get(roomId);
  if (!room || !room.game) return false;

  if (canStartGame(room.game)) {
    startNewHand(room.game, roomId, room.name);
    return true;
  }
  return false;
}

export function tryStartNextHand(roomId: string): boolean {
  const room = rooms.get(roomId);
  if (!room || !room.game) return false;

  if (room.game.phase !== 'showdown') return false;
  if (room.game.players.length < 2) return false;

  // Remove players with 0 chips
  const bustedPlayers = room.game.players.filter(p => p.chips === 0);
  for (const p of bustedPlayers) {
    removePlayer(room.game, p.agentId);
  }

  if (room.game.players.length < 2) return false;

  startNewHand(room.game);
  return true;
}

export function getClientGameState(roomId: string, viewerAgentId: string): ClientGameState | null {
  const room = rooms.get(roomId);
  if (!room || !room.game) return null;

  const game = room.game;
  const isShowdown = game.phase === 'showdown';

  const players: ClientPlayer[] = game.players.map(p => ({
    agentId: p.agentId,
    name: p.name,
    seatIndex: p.seatIndex,
    chips: p.chips,
    holeCards: (p.agentId === viewerAgentId || isShowdown) ? p.holeCards : null,
    currentBet: p.currentBet,
    hasFolded: p.hasFolded,
    hasActed: p.hasActed,
    isAllIn: p.isAllIn,
    isConnected: p.isConnected,
  }));

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
  };
}

export function getValidActionsForRoom(roomId: string): ReturnType<typeof getValidActions> {
  const room = rooms.get(roomId);
  if (!room || !room.game) return [];
  return getValidActions(room.game);
}
