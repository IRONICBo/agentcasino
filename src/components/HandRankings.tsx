'use client';

import { ClientGameState, WinnerInfo } from '@/lib/types';
import { PlayingCard } from './PlayingCard';
import { useState, useEffect, useRef } from 'react';

const HIGHLIGHT_DURATION_MS = 5000;

const formatAmount = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M`
  : n >= 1_000 ? `${(n / 1_000).toFixed(0)}K`
  : String(n);

export function HandRankings({ gameState }: { gameState: ClientGameState }) {
  // Track highlighted winners with a timer (independent of game state changes)
  const [highlightedWinners, setHighlightedWinners] = useState<WinnerInfo[]>([]);
  const prevWinnersRef = useRef<string>('');

  useEffect(() => {
    const key = gameState.winners?.map(w => `${w.agentId}:${w.amount}`).join(',') ?? '';
    if (key && key !== prevWinnersRef.current) {
      prevWinnersRef.current = key;
      setHighlightedWinners(gameState.winners!);
      // Clear highlight after 5 seconds
      const timer = setTimeout(() => setHighlightedWinners([]), HIGHLIGHT_DURATION_MS);
      return () => clearTimeout(timer);
    }
    if (!key && prevWinnersRef.current) {
      // Winners cleared by server — keep highlighting until timer expires (already set above)
    }
  }, [gameState.winners]);

  const isHighlighted = highlightedWinners.length > 0;
  const highlightIds = new Set(highlightedWinners.map(w => w.agentId));

  // No players = nothing to show
  if (!gameState.players || gameState.players.length === 0) return null;

  // Build entries from current players
  type Entry = { agentId: string; name: string; hand: string; handValue: number; bestCards: typeof gameState.players[0]['holeCards']; holeCards: typeof gameState.players[0]['holeCards']; isWinner: boolean; amount: number };
  const entries: Entry[] = [];

  // If we have highlighted winners, add them
  if (isHighlighted) {
    for (const w of highlightedWinners) {
      const player = gameState.players.find(p => p.agentId === w.agentId);
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
  }

  // Add remaining players
  for (const p of gameState.players) {
    if (highlightIds.has(p.agentId)) continue;
    entries.push({
      agentId: p.agentId,
      name: p.name,
      hand: p.hasFolded ? 'Folded' : '',
      handValue: -1, // folded/unknown = lowest
      bestCards: null,
      holeCards: (!p.hasFolded && p.holeCards && p.holeCards.length === 2) ? p.holeCards : null,
      isWinner: false,
      amount: 0,
    });
  }

  // Sort by hand value descending (winners/best hands first, folded last)
  entries.sort((a, b) => {
    if (a.isWinner !== b.isWinner) return a.isWinner ? -1 : 1;
    return b.handValue - a.handValue;
  });

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
