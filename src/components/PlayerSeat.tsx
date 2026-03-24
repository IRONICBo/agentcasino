'use client';

import { ClientPlayer, GamePhase } from '@/lib/types';
import { PlayingCard } from './PlayingCard';

interface PlayerSeatProps {
  player: ClientPlayer;
  isCurrentTurn: boolean;
  isDealer: boolean;
  isSmallBlind: boolean;
  isBigBlind: boolean;
  phase: GamePhase;
}

export function PlayerSeat({ player, isCurrentTurn, isDealer, isSmallBlind, isBigBlind, phase }: PlayerSeatProps) {
  // Position badge text
  const badge = isDealer ? 'D' : isSmallBlind ? 'SB' : isBigBlind ? 'BB' : null;

  // Status text on the right
  const statusText = player.hasFolded ? 'FOLD'
    : player.isAllIn ? 'ALL IN'
    : player.currentBet > 0 ? `$${player.currentBet.toLocaleString()}`
    : null;

  return (
    <div className="flex flex-col items-start gap-1">
      {/* Cards — positioned above/beside the info card */}
      {phase !== 'waiting' && (
        <div className="flex gap-0.5 ml-1">
          {player.holeCards ? (
            player.holeCards.map((c, i) => <PlayingCard key={i} card={c} small />)
          ) : (
            <>
              <PlayingCard faceDown small />
              <PlayingCard faceDown small className="-ml-2" />
            </>
          )}
        </div>
      )}

      {/* Player info card */}
      <div
        className={`rounded-lg px-3 py-2 min-w-[140px] transition-all duration-300 ${
          isCurrentTurn
            ? 'bg-[#2a2a2a] ring-1 ring-yellow-500/60'
            : 'bg-[#1e1e1e]/90'
        } ${player.hasFolded ? 'opacity-50' : ''}`}
      >
        {/* Top row: name + badge */}
        <div className="flex items-center justify-between gap-2 mb-1">
          <span className={`text-sm font-medium truncate max-w-[90px] ${
            player.isConnected ? 'text-gray-200' : 'text-gray-600'
          }`}>
            {player.name.length > 12 ? player.name.slice(0, 11) + '...' : player.name}
          </span>
          {badge && (
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
              isDealer ? 'bg-emerald-600 text-white' : 'bg-gray-600 text-gray-300'
            }`}>
              {badge}
            </span>
          )}
        </div>

        {/* Bottom row: chips + status */}
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-mono font-semibold text-emerald-400 tabular-nums">
            ${player.chips.toLocaleString()}
          </span>
          {statusText && (
            <span className={`text-[11px] font-medium tabular-nums ${
              player.hasFolded ? 'text-gray-500' : 'text-amber-400'
            }`}>
              {statusText}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
