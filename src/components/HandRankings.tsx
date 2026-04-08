'use client';

import { ClientGameState, WinnerInfo, ShowdownHandInfo, LastHandResult, Card, HandRank } from '@/lib/types';
import { PlayingCard } from './PlayingCard';
import { useState, useEffect, useRef } from 'react';

/** Check if a card is part of the best-5 hand */
function isCardInBest(card: Card, bestCards: Card[] | null): boolean {
  if (!bestCards) return false;
  return bestCards.some(bc => bc.rank === card.rank && bc.suit === card.suit);
}

/**
 * Given a hand rank and the best 5 cards, return a Set of indices
 * for the cards that form the core of the hand type.
 * e.g. pair → 2 cards, three_of_a_kind → 3 cards, straight/flush → all 5
 */
function getHandCoreIndices(rank: HandRank | string, cards: Card[]): Set<number> {
  if (!cards || cards.length === 0) return new Set();

  // These hands use all 5 cards
  if (['straight', 'flush', 'full_house', 'straight_flush', 'royal_flush'].includes(rank)) {
    return new Set(cards.map((_, i) => i));
  }

  // Count ranks to find groups
  const rankCounts = new Map<string, number[]>();
  cards.forEach((c, i) => {
    const indices = rankCounts.get(c.rank) || [];
    indices.push(i);
    rankCounts.set(c.rank, indices);
  });

  const groups = [...rankCounts.values()].sort((a, b) => b.length - a.length);

  switch (rank) {
    case 'four_of_a_kind':
      // The 4 matching cards
      return new Set(groups.find(g => g.length === 4) || []);
    case 'three_of_a_kind':
      // The 3 matching cards
      return new Set(groups.find(g => g.length === 3) || []);
    case 'two_pair':
      // Both pairs (4 cards)
      return new Set(groups.filter(g => g.length === 2).flat());
    case 'pair':
      // The 2 matching cards
      return new Set(groups.find(g => g.length === 2) || []);
    case 'high_card':
      // Just the highest card (index 0, cards are sorted descending)
      return new Set([0]);
    default:
      return new Set();
  }
}

const HIGHLIGHT_DURATION_MS = 5000;

const formatAmount = (n: number) =>
  n >= 1_000_000 ? `${parseFloat((n / 1_000_000).toFixed(2))}M`
  : n >= 1_000 ? `${parseFloat((n / 1_000).toFixed(2))}K`
  : String(n);

type Entry = {
  agentId: string;
  name: string;
  hand: string;
  handRank: string;
  handValue: number;
  bestCards: ClientGameState['players'][0]['holeCards'];
  holeCards: ClientGameState['players'][0]['holeCards'];
  isWinner: boolean;
  hasFolded: boolean;
  amount: number;
};

type MinimalPlayer = { agentId: string; name: string; holeCards: import('@/lib/types').Card[] | null; hasFolded: boolean };

function buildShowdownEntries(
  winners: WinnerInfo[],
  players: MinimalPlayer[],
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

    const handRank = isWinner
      ? (w!.hand?.rank ?? '')
      : (sdHand?.hand?.rank ?? '');

    entries.push({
      agentId: p.agentId,
      name: p.name,
      hand: handDesc,
      handRank,
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
  const initializedRef = useRef(false);

  // On first render, restore from persisted lastHandResult (survives page refresh)
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    if (snapshot.length > 0) return; // already have data from live winners
    const lhr = gameState.lastHandResult;
    if (lhr && lhr.winners.length > 0) {
      setSnapshot(buildShowdownEntries(lhr.winners, lhr.players, lhr.showdownHands));
    }
  }, [gameState.lastHandResult]); // eslint-disable-line react-hooks/exhaustive-deps
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
        border: '1px solid rgba(212,175,55,0.3)',
        boxShadow: '0 4px 24px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.03)',
      }}
    >
      {/* Header */}
      <div className="px-4 py-2.5 flex items-center gap-2 border-b border-white/5">
        <div className="text-amber-500 text-xs">♠</div>
        <h3
          className="text-sm font-bold uppercase tracking-[0.15em]"
          style={{
            background: 'linear-gradient(135deg, #d4af37, #f0c040)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}
        >
          Last Hand Rankings
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

            {/* Hole cards — highlight if card is a core part of the hand */}
            <div className="flex gap-1 shrink-0">
              {entry.holeCards ? (() => {
                const coreIndices = entry.bestCards ? getHandCoreIndices(entry.handRank, entry.bestCards) : new Set<number>();
                const coreCards = entry.bestCards ? [...coreIndices].map(i => entry.bestCards![i]) : [];
                return entry.holeCards!.map((card, ci) => {
                  const isCoreCard = coreCards.some(cc => cc.rank === card.rank && cc.suit === card.suit);
                  return <PlayingCard key={ci} card={card} small dealDelay={0} highlighted={isCoreCard} />;
                });
              })() : (
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
                    className="text-[9px] font-mono font-bold inline-flex items-center justify-center"
                    style={{
                      width: 32, height: 32, borderRadius: '50%',
                      border: '2px solid rgba(220,50,50,0.7)',
                      color: 'rgba(220,50,50,0.8)',
                      transform: 'rotate(-15deg)',
                      letterSpacing: '0.05em',
                      flexShrink: 0,
                    }}
                  >
                    FOLD
                  </span>
                )}
              </div>

              {/* Best 5 cards — core hand cards highlighted */}
              {entry.bestCards && entry.bestCards.length > 0 && (() => {
                const coreIndices = getHandCoreIndices(entry.handRank, entry.bestCards);
                return (
                  <div className="flex gap-0.5 mt-1.5">
                    {entry.bestCards.map((card, ci) => (
                      <PlayingCard key={ci} card={card} size="xs" dealDelay={ci * 60} highlighted={coreIndices.has(ci)} />
                    ))}
                  </div>
                );
              })()}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
