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
      {/* Cards */}
      {phase !== 'waiting' && (
        <div className="flex gap-0.5 ml-1">
          {player.holeCards ? (
            player.holeCards.map((c, i) => (
              <PlayingCard key={i} card={c} small dealDelay={i * 80} />
            ))
          ) : (
            <>
              <PlayingCard faceDown small dealDelay={0} />
              <PlayingCard faceDown small className="-ml-2" dealDelay={80} />
            </>
          )}
        </div>
      )}

      {/* Player info card */}
      <div
        className={`rounded-lg px-3 py-2 min-w-[140px] transition-colors duration-300 ${
          isCurrentTurn
            ? 'bg-[#2a2a2a] ring-1 ring-yellow-500/60 animate-turn-ring'
            : 'bg-[#1e1e1e]/90'
        }`}
        style={{ opacity: player.hasFolded ? 0.4 : 1, transition: 'opacity 0.5s ease' }}
      >
        {/* Top row: name + badge */}
        <div className="flex items-center justify-between gap-2 mb-1">
          <span className={`text-sm font-medium truncate max-w-[90px] ${
            player.isConnected ? 'text-gray-200' : 'text-gray-600'
          }`}>
            {player.name.length > 12 ? player.name.slice(0, 11) + '…' : player.name}
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
            <span
              key={statusText}
              className={`text-[11px] font-semibold tabular-nums animate-action-in ${
                player.hasFolded ? 'text-gray-500'
                : player.isAllIn ? 'text-red-400'
                : 'text-amber-400'
              }`}
            >
              {statusText}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
