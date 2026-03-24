'use client';

import { ClientGameState, PlayerAction } from '@/lib/types';
import { PlayerSeat } from './PlayerSeat';
import { PlayingCard } from './PlayingCard';
import { useState } from 'react';

/**
 * Seat positions for up to 9 players, distributed around a large oval.
 * Coordinates as [top%, left%] — positioned via absolute + transform.
 */
const SEAT_COORDS: [number, number][] = [
  [85, 42],  // 0: bottom-center (hero position)
  [68, 8],   // 1: bottom-left
  [32, 2],   // 2: mid-left
  [5, 15],   // 3: top-left
  [0, 42],   // 4: top-center
  [5, 70],   // 5: top-right
  [32, 82],  // 6: mid-right
  [68, 78],  // 7: bottom-right
  [85, 62],  // 8: bottom-center-right
];

const phaseLabels: Record<string, string> = {
  waiting: 'WAITING', preflop: 'PRE-FLOP', flop: 'FLOP',
  turn: 'TURN', river: 'RIVER', showdown: 'SHOWDOWN',
};

interface PokerTableProps {
  gameState: ClientGameState;
  myAgentId: string;
  onAction: (action: PlayerAction, amount?: number) => void;
}

export function PokerTable({ gameState, myAgentId, onAction }: PokerTableProps) {
  const [raiseAmount, setRaiseAmount] = useState(gameState.bigBlind * 2);

  const myPlayer = gameState.players.find(p => p.agentId === myAgentId);
  const isMyTurn = gameState.players[gameState.currentPlayerIndex]?.agentId === myAgentId;
  const highestBet = Math.max(...gameState.players.map(p => p.currentBet), 0);
  const toCall = myPlayer ? highestBet - myPlayer.currentBet : 0;

  // Derive SB/BB from dealer index
  const sbIdx = gameState.players.length === 2
    ? gameState.dealerIndex
    : (gameState.dealerIndex + 1) % gameState.players.length;
  const bbIdx = (sbIdx + 1) % gameState.players.length;

  return (
    <div className="relative w-full max-w-5xl mx-auto" style={{ aspectRatio: '16 / 10' }}>

      {/* ── Green felt table ── */}
      <div
        className="absolute rounded-[50%] overflow-hidden"
        style={{
          top: '12%', left: '12%', right: '12%', bottom: '12%',
          background: 'radial-gradient(ellipse at 50% 45%, #2d7a4a 0%, #1f5e36 40%, #17472a 100%)',
          boxShadow: 'inset 0 4px 30px rgba(0,0,0,0.3), 0 8px 40px rgba(0,0,0,0.5)',
        }}
      >
        {/* Subtle inner border */}
        <div className="absolute inset-3 rounded-[50%] border border-white/[0.04]" />

        {/* Center content */}
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
          {/* Phase label */}
          <span className="text-[11px] font-semibold text-amber-400/80 uppercase tracking-[0.25em]">
            {phaseLabels[gameState.phase] || gameState.phase}
          </span>

          {/* Community cards */}
          <div className="flex gap-2">
            {gameState.communityCards.map((card, i) => (
              <PlayingCard key={i} card={card} />
            ))}
            {Array.from({ length: 5 - gameState.communityCards.length }).map((_, i) => (
              <div
                key={`e-${i}`}
                className="w-[52px] h-[72px] rounded-md border border-white/[0.08] bg-white/[0.03]"
              />
            ))}
          </div>

          {/* Pot */}
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-gray-400 uppercase tracking-wider">Pot</span>
            <span className="text-sm font-bold font-mono text-amber-400 tabular-nums">
              ${gameState.pot.toLocaleString()}
            </span>
          </div>
        </div>
      </div>

      {/* ── Player seats ── */}
      {gameState.players.map((player, idx) => {
        const [top, left] = SEAT_COORDS[player.seatIndex] || SEAT_COORDS[0];
        return (
          <div
            key={player.agentId}
            className="absolute z-10"
            style={{
              top: `${top}%`,
              left: `${left}%`,
              transform: 'translate(-50%, -50%)',
            }}
          >
            <PlayerSeat
              player={player}
              isCurrentTurn={gameState.players[gameState.currentPlayerIndex]?.agentId === player.agentId}
              isDealer={gameState.players[gameState.dealerIndex]?.agentId === player.agentId}
              isSmallBlind={idx === sbIdx}
              isBigBlind={idx === bbIdx}
              phase={gameState.phase}
            />
          </div>
        );
      })}

      {/* ── Winners overlay ── */}
      {gameState.winners && gameState.winners.length > 0 && (
        <div className="absolute inset-0 flex items-center justify-center z-20">
          <div className="absolute inset-0 bg-black/50 rounded-3xl" />
          <div className="relative bg-[#1a1a1a] border border-gray-700 rounded-xl px-8 py-6 text-center z-30 shadow-2xl">
            {gameState.winners.map((w, i) => (
              <div key={i} className="mb-2 last:mb-0">
                <div className="text-white font-bold text-lg">{w.name}</div>
                <div className="text-emerald-400 font-mono font-bold text-xl">
                  +${w.amount.toLocaleString()}
                </div>
                <div className="text-gray-500 text-xs mt-0.5">{w.hand.description}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Action bar ── */}
      {isMyTurn && gameState.phase !== 'waiting' && gameState.phase !== 'showdown' && (
        <div className="absolute -bottom-16 left-1/2 -translate-x-1/2 z-30">
          <div className="flex items-center gap-2 bg-[#1a1a1a] border border-gray-700/60 rounded-xl px-4 py-2.5 shadow-xl">
            <button
              onClick={() => onAction('fold')}
              className="px-5 py-2 rounded-lg text-sm font-semibold bg-gray-700 hover:bg-gray-600 text-gray-300 transition-colors"
            >
              Fold
            </button>

            {toCall === 0 ? (
              <button
                onClick={() => onAction('check')}
                className="px-5 py-2 rounded-lg text-sm font-semibold bg-emerald-700 hover:bg-emerald-600 text-white transition-colors"
              >
                Check
              </button>
            ) : (
              <button
                onClick={() => onAction('call')}
                className="px-5 py-2 rounded-lg text-sm font-semibold bg-emerald-700 hover:bg-emerald-600 text-white transition-colors"
              >
                Call ${toCall.toLocaleString()}
              </button>
            )}

            <div className="flex items-center gap-2">
              <input
                type="range"
                min={gameState.minRaise}
                max={myPlayer?.chips ?? 0}
                value={raiseAmount}
                onChange={e => setRaiseAmount(Number(e.target.value))}
                className="w-20 accent-amber-500"
              />
              <button
                onClick={() => onAction('raise', raiseAmount)}
                className="px-5 py-2 rounded-lg text-sm font-semibold bg-amber-600 hover:bg-amber-500 text-white transition-colors"
              >
                Raise ${raiseAmount.toLocaleString()}
              </button>
            </div>

            <div className="w-px h-8 bg-gray-700" />

            <button
              onClick={() => onAction('all_in')}
              className="px-5 py-2 rounded-lg text-sm font-bold bg-red-700 hover:bg-red-600 text-white transition-colors uppercase tracking-wide"
            >
              All In
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
