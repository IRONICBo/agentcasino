'use client';

import { ClientGameState, WinnerInfo } from '@/lib/types';
import { PlayingCard } from './PlayingCard';
import { useState, useEffect, useRef } from 'react';

const HIGHLIGHT_DURATION_MS = 5000;

const formatAmount = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`
  : n >= 1_000 ? `${(n / 1_000).toFixed(n % 1_000 === 0 ? 0 : 1)}K`
  : String(n);

type Entry = { agentId: string; name: string; hand: string; handValue: number; bestCards: ClientGameState['players'][0]['holeCards']; holeCards: ClientGameState['players'][0]['holeCards']; isWinner: boolean; amount: number };

function buildShowdownEntries(winners: WinnerInfo[], players: ClientGameState['players']): Entry[] {
  const winnerIds = new Set(winners.map(w => w.agentId));
  const entries: Entry[] = [];

  for (const w of winners) {
    const player = players.find(p => p.agentId === w.agentId);
    entries.push({
      agentId: w.agentId,
      name: w.name,
      hand: w.hand?.description || 'Last player standing',
      handValue: w.hand?.value ?? 0,
      bestCards: w.hand?.cards ?? null,
      holeCards: player?.holeCards ?? null,
      isWinner: true,
      amount: w.amount,
    });
  }

  for (const p of players) {
    if (winnerIds.has(p.agentId)) continue;
    entries.push({
      agentId: p.agentId,
      name: p.name,
      hand: p.hasFolded ? 'Folded' : '',
      handValue: -1,
      bestCards: null,
      holeCards: (!p.hasFolded && p.holeCards && p.holeCards.length === 2) ? p.holeCards : null,
      isWinner: false,
      amount: 0,
    });
  }

  entries.sort((a, b) => {
    if (a.isWinner !== b.isWinner) return a.isWinner ? -1 : 1;
    return b.handValue - a.handValue;
  });

  return entries;
}

export function HandRankings({ gameState }: { gameState: ClientGameState }) {
  // Snapshot: stores the last showdown result (persists across hands)
  const [snapshot, setSnapshot] = useState<Entry[]>([]);
  const [isHighlighted, setIsHighlighted] = useState(false);
  const prevWinnersKeyRef = useRef('');
  const prevPhaseRef = useRef(gameState.phase);

  // When new winners appear → snapshot + highlight 5s
  useEffect(() => {
    const key = gameState.winners?.map(w => `${w.agentId}:${w.amount}`).join(',') ?? '';
    if (key && key !== prevWinnersKeyRef.current) {
      prevWinnersKeyRef.current = key;
      setSnapshot(buildShowdownEntries(gameState.winners!, gameState.players));
      setIsHighlighted(true);
      const timer = setTimeout(() => setIsHighlighted(false), HIGHLIGHT_DURATION_MS);
      return () => clearTimeout(timer);
    }
  }, [gameState.winners, gameState.players]);

  // When a new hand starts (phase leaves showdown) → immediately un-highlight
  useEffect(() => {
    if (prevPhaseRef.current === 'showdown' && gameState.phase !== 'showdown') {
      setIsHighlighted(false);
    }
    prevPhaseRef.current = gameState.phase;
  }, [gameState.phase]);

  // Nothing to show yet
  if (snapshot.length === 0) return null;

  const entries = snapshot;

  return (
    <div
      className="rounded-2xl overflow-hidden transition-opacity duration-500"
      style={{
        opacity: isHighlighted ? 1 : 0.4,
        background: 'linear-gradient(180deg, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0.75) 100%)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        border: isHighlighted ? '1px solid rgba(212,175,55,0.3)' : '1px solid rgba(255,255,255,0.06)',
        boxShadow: isHighlighted
          ? '0 4px 24px rgba(0,0,0,0.3), 0 0 20px rgba(212,175,55,0.1), inset 0 1px 0 rgba(255,255,255,0.03)'
          : '0 4px 24px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.03)',
      }}
    >
      {/* Header */}
      <div className="px-4 py-2.5 flex items-center gap-2 border-b border-white/5">
        <div className="text-amber-500 text-xs">♠</div>
        <h3
          className="text-sm font-bold uppercase tracking-[0.15em]"
          style={{
            background: isHighlighted
              ? 'linear-gradient(135deg, #d4af37, #f0c040)'
              : 'linear-gradient(135deg, #9ca3af, #6b7280)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}
        >
          Hand Rankings
        </h3>
        <div className="text-amber-500 text-xs">♠</div>
      </div>

      {/* Entries */}
      <div className="px-3 py-2 space-y-1">
        {entries.map((entry, i) => (
          <div
            key={entry.agentId}
            className="flex items-center gap-3 rounded-lg px-3 py-2.5 transition-all duration-500"
            style={{
              background: entry.isWinner && isHighlighted ? 'rgba(212,175,55,0.08)' : 'transparent',
              borderBottom: i < entries.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
            }}
          >
            {/* Rank */}
            <div className="text-sm shrink-0" style={{ width: 20, textAlign: 'center' }}>
              {entry.isWinner && isHighlighted ? '👑' : (
                <span className="font-mono text-xs text-gray-600">·</span>
              )}
            </div>

            {/* Hole cards */}
            <div className="flex gap-1 shrink-0">
              {entry.holeCards ? entry.holeCards.map((card, ci) => (
                <PlayingCard key={ci} card={card} small dealDelay={0} />
              )) : (
                <div className="flex gap-1">
                  <PlayingCard faceDown small dealDelay={0} />
                  <PlayingCard faceDown small dealDelay={0} />
                </div>
              )}
            </div>

            {/* Name + hand description + best 5 cards */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span
                  className="text-sm font-bold truncate"
                  style={{ color: entry.isWinner && isHighlighted ? '#f0f0f0' : 'rgba(255,255,255,0.45)' }}
                >
                  {entry.name}
                </span>
                {entry.isWinner && isHighlighted && (
                  <span className="text-sm font-bold font-mono" style={{ color: '#4ade80' }}>
                    +{formatAmount(entry.amount)}
                  </span>
                )}
              </div>

              {/* Hand description */}
              {(entry.isWinner && isHighlighted) || entry.hand === 'Folded' ? (
                <div
                  className="text-xs font-mono font-bold tracking-wide mt-0.5"
                  style={{
                    color: entry.isWinner && isHighlighted ? '#d4af37' : 'rgba(255,255,255,0.2)',
                  }}
                >
                  {entry.hand ? entry.hand.toUpperCase() : 'MUCKED'}
                </div>
              ) : null}

              {/* Best 5 cards (if available, only during highlight) */}
              {isHighlighted && entry.bestCards && entry.bestCards.length > 0 && (
                <div className="flex gap-0.5 mt-1.5">
                  {entry.bestCards.map((card, ci) => (
                    <PlayingCard key={ci} card={card} size="xs" dealDelay={ci * 60} />
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
