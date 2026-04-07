'use client';

import { ClientGameState } from '@/lib/types';
import { PlayingCard } from './PlayingCard';

const formatAmount = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M`
  : n >= 1_000 ? `${(n / 1_000).toFixed(0)}K`
  : String(n);

export function HandRankings({ gameState }: { gameState: ClientGameState }) {
  const hasWinners = !!(gameState.winners && gameState.winners.length > 0);
  if (!hasWinners || gameState.phase !== 'showdown') return null;

  const winnerIds = new Set(gameState.winners!.map(w => w.agentId));
  const entries: { agentId: string; name: string; hand: string; bestCards: typeof gameState.players[0]['holeCards']; holeCards: typeof gameState.players[0]['holeCards']; isWinner: boolean; amount: number }[] = [];

  for (const w of gameState.winners!) {
    const player = gameState.players.find(p => p.agentId === w.agentId);
    entries.push({
      agentId: w.agentId,
      name: w.name,
      hand: w.hand?.description || 'Last player standing',
      bestCards: w.hand?.cards ?? null,
      holeCards: player?.holeCards ?? null,
      isWinner: true,
      amount: w.amount,
    });
  }

  for (const p of gameState.players) {
    if (!winnerIds.has(p.agentId) && !p.hasFolded && p.holeCards && p.holeCards.length === 2) {
      entries.push({
        agentId: p.agentId,
        name: p.name,
        hand: '',
        bestCards: null,
        holeCards: p.holeCards,
        isWinner: false,
        amount: 0,
      });
    }
  }

  // Add folded players
  for (const p of gameState.players) {
    if (!winnerIds.has(p.agentId) && p.hasFolded) {
      entries.push({
        agentId: p.agentId,
        name: p.name,
        hand: 'Folded',
        bestCards: null,
        holeCards: null,
        isWinner: false,
        amount: 0,
      });
    }
  }

  return (
    <div
      className="animate-winner-pop rounded-2xl overflow-hidden"
      style={{
        background: 'linear-gradient(180deg, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0.75) 100%)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        border: '1px solid rgba(255,255,255,0.06)',
        boxShadow: '0 4px 24px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.03)',
      }}
    >
      {/* Header — matches ChatBox style */}
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
          Hand Rankings
        </h3>
        <div className="text-amber-500 text-xs">♠</div>
      </div>

      {/* Entries */}
      <div className="px-3 py-2 space-y-1">
        {entries.map((entry, i) => (
          <div
            key={entry.agentId}
            className="flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors"
            style={{
              background: entry.isWinner ? 'rgba(212,175,55,0.08)' : 'transparent',
              borderBottom: i < entries.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
            }}
          >
            {/* Rank */}
            <div className="text-sm shrink-0" style={{ width: 20, textAlign: 'center' }}>
              {entry.isWinner ? '👑' : (
                <span className="font-mono text-xs text-gray-600">#{i + 1}</span>
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
                  style={{ color: entry.isWinner ? '#f0f0f0' : 'rgba(255,255,255,0.45)' }}
                >
                  {entry.name}
                </span>
                {entry.isWinner && (
                  <span className="text-sm font-bold font-mono" style={{ color: '#4ade80' }}>
                    +{formatAmount(entry.amount)}
                  </span>
                )}
              </div>

              {/* Hand description */}
              <div
                className="text-xs font-mono font-bold tracking-wide mt-0.5"
                style={{
                  color: entry.isWinner ? '#d4af37' : entry.hand === 'Folded' ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.35)',
                }}
              >
                {entry.hand ? entry.hand.toUpperCase() : 'MUCKED'}
              </div>

              {/* Best 5 cards (if available) */}
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
