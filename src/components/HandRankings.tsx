'use client';

import { ClientGameState, WinnerInfo, ShowdownHandInfo } from '@/lib/types';
import { PlayingCard } from './PlayingCard';
import { useState, useEffect, useRef } from 'react';

const HIGHLIGHT_DURATION_MS = 5000;

const formatAmount = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`
  : n >= 1_000 ? `${(n / 1_000).toFixed(n % 1_000 === 0 ? 0 : 1)}K`
  : String(n);

type Entry = {
  agentId: string;
  name: string;
  hand: string;
  handValue: number;
  bestCards: ClientGameState['players'][0]['holeCards'];
  holeCards: ClientGameState['players'][0]['holeCards'];
  isWinner: boolean;
  hasFolded: boolean;
  amount: number;
};

function buildShowdownEntries(
  winners: WinnerInfo[],
  players: ClientGameState['players'],
  showdownHands: ShowdownHandInfo[] | null,
): Entry[] {
  const winnerIds = new Set(winners.map(w => w.agentId));
  const winnerMap = new Map(winners.map(w => [w.agentId, w]));
  const handMap = new Map((showdownHands ?? []).map(h => [h.agentId, h]));
  const entries: Entry[] = [];

  for (const p of players) {
    const w = winnerMap.get(p.agentId);
    const sdHand = handMap.get(p.agentId);
    const isWinner = winnerIds.has(p.agentId);

    // Hand description — pure hand name, fold status tracked separately
    const handDesc = isWinner
      ? (w!.hand?.description || 'Last player standing')
      : (sdHand?.hand?.description ?? '');

    const handValue = isWinner
      ? (w!.hand?.value ?? 0)
      : (sdHand?.hand?.value ?? -1);

    const bestCards = isWinner
      ? (w!.hand?.cards ?? null)
      : (sdHand?.hand?.cards ?? null);

    entries.push({
      agentId: p.agentId,
      name: p.name,
      hand: handDesc,
      handValue,
      bestCards,
      holeCards: p.holeCards,
      isWinner,
      hasFolded: p.hasFolded,
      amount: isWinner ? w!.amount : 0,
    });
  }

  // Sort ALL players by hand value descending (winners first on tie)
  entries.sort((a, b) => {
    if (b.handValue !== a.handValue) return b.handValue - a.handValue;
    if (a.isWinner !== b.isWinner) return a.isWinner ? -1 : 1;
    return 0;
  });

  return entries;
}

export function HandRankings({ gameState }: { gameState: ClientGameState }) {
  const [snapshot, setSnapshot] = useState<Entry[]>([]);
  const [isHighlighted, setIsHighlighted] = useState(false);
  const prevWinnersKeyRef = useRef('');
  const prevPhaseRef = useRef(gameState.phase);

  useEffect(() => {
    const key = gameState.winners?.map(w => `${w.agentId}:${w.amount}`).join(',') ?? '';
    if (key && key !== prevWinnersKeyRef.current) {
      prevWinnersKeyRef.current = key;
      setSnapshot(buildShowdownEntries(gameState.winners!, gameState.players, gameState.showdownHands));
      setIsHighlighted(true);
      const timer = setTimeout(() => setIsHighlighted(false), HIGHLIGHT_DURATION_MS);
      return () => clearTimeout(timer);
    }
  }, [gameState.winners, gameState.players, gameState.showdownHands]);

  useEffect(() => {
    if (prevPhaseRef.current === 'showdown' && gameState.phase !== 'showdown') {
      setIsHighlighted(false);
    }
    prevPhaseRef.current = gameState.phase;
  }, [gameState.phase]);

  if (snapshot.length === 0) return null;

  return (
    <div
      className="rounded-2xl overflow-hidden transition-opacity duration-500"
      style={{
        opacity: 1,
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
        {snapshot.map((entry, i) => (
          <div
            key={entry.agentId}
            className="flex items-center gap-3 rounded-lg px-3 py-2.5 transition-all duration-500"
            style={{
              // Winner: gold border highlight; others: transparent
              background: entry.isWinner && isHighlighted ? 'rgba(212,175,55,0.08)' : 'transparent',
              border: entry.isWinner && isHighlighted ? '1px solid rgba(212,175,55,0.5)' : '1px solid transparent',
              borderBottom: !entry.isWinner && i < snapshot.length - 1 ? '1px solid rgba(255,255,255,0.04)' : undefined,
              // Folded players: semi-transparent
              opacity: entry.hasFolded ? 0.45 : 1,
            }}
          >
            {/* Rank indicator */}
            <div className="text-sm shrink-0" style={{ width: 20, textAlign: 'center' }}>
              {entry.isWinner ? '👑' : (
                <span className="font-mono text-xs" style={{ color: entry.hasFolded ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.4)' }}>
                  {i + 1}
                </span>
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

              {/* Hand description + fold tag */}
              <div className="flex items-center gap-1.5 mt-0.5">
                {entry.hand ? (
                  <span
                    className="text-xs font-mono font-bold tracking-wide"
                    style={{
                      color: entry.isWinner && isHighlighted ? '#d4af37'
                        : entry.hasFolded ? 'rgba(255,255,255,0.3)'
                        : 'rgba(255,255,255,0.4)',
                    }}
                  >
                    {entry.hand.toUpperCase()}
                  </span>
                ) : null}
                {entry.hasFolded && (
                  <span
                    className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded"
                    style={{ background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.3)' }}
                  >
                    FOLD
                  </span>
                )}
              </div>

              {/* Best 5 cards — show for ALL players during highlight */}
              {entry.bestCards && entry.bestCards.length > 0 && (
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
