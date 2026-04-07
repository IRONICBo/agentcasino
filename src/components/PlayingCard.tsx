'use client';

import { Card } from '@/lib/types';

const suitSymbols: Record<string, string> = {
  hearts: '♥', diamonds: '♦', clubs: '♣', spades: '♠',
};
const suitColor: Record<string, string> = {
  hearts: '#c8001e', diamonds: '#c8001e', clubs: '#111827', spades: '#111827',
};

export function PlayingCard({
  card, faceDown, small, size, className = '', dealDelay = 0,
}: {
  card?: Card | null; faceDown?: boolean; small?: boolean;
  size?: 'xs' | 'sm' | 'md';
  className?: string; dealDelay?: number;
}) {
  const isXs = size === 'xs';
  const isSm = size === 'sm' || small;
  const W = isXs ? 22 : isSm ? 34 : 54;
  const H = isXs ? 30 : isSm ? 48 : 76;
  const R = isXs ? 3 : isSm ? 4 : 6;

  // ── Card back ──
  if (!card || faceDown) {
    return (
      <div
        className={`card-back animate-deal ${className}`}
        style={{
          width: W, height: H, borderRadius: R, flexShrink: 0, position: 'relative',
          animationDelay: `${dealDelay}ms`,
        }}
      >
        {/* Gold inset border */}
        <div style={{
          position: 'absolute', inset: 3,
          border: '1px solid rgba(212,175,55,0.28)',
          borderRadius: R - 2,
        }} />
        {/* Center pip */}
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: isXs ? 6 : isSm ? 8 : 11, color: 'rgba(212,175,55,0.3)',
          fontFamily: 'serif',
        }}>♦</div>
      </div>
    );
  }

  const color = suitColor[card.suit];
  const sym = suitSymbols[card.suit];
  const rankSize = isXs ? 7 : isSm ? 9 : 13;
  const suitSize = isXs ? 5 : isSm ? 7 : 10;
  const centerSize = isXs ? 10 : isSm ? 16 : 26;

  // ── Face-up card ──
  return (
    <div
      className={`animate-flip ${className}`}
      style={{
        width: W, height: H, borderRadius: R, flexShrink: 0,
        background: '#fff',
        border: '1px solid #d0d0d0',
        boxShadow: '1px 3px 10px rgba(0,0,0,0.45), 0 1px 2px rgba(0,0,0,0.15)',
        position: 'relative', overflow: 'hidden',
        userSelect: 'none',
        animationDelay: `${dealDelay}ms`,
      }}
    >
      {/* Subtle inner light */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'linear-gradient(135deg, rgba(255,255,255,0.4) 0%, transparent 60%)',
        pointerEvents: 'none', borderRadius: R,
      }} />

      {/* Top-left rank + suit */}
      <div style={{
        position: 'absolute', top: isXs ? 1 : isSm ? 1 : 2, left: isXs ? 1 : isSm ? 2 : 3,
        color, lineHeight: 1.1, textAlign: 'center',
      }}>
        <div style={{ fontSize: rankSize, fontWeight: 900, fontFamily: 'Georgia, serif', letterSpacing: '-0.03em' }}>
          {card.rank}
        </div>
        <div style={{ fontSize: suitSize, marginTop: -1 }}>{sym}</div>
      </div>

      {/* Center suit */}
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color, fontSize: centerSize, opacity: 0.82,
        textShadow: `0 1px 3px ${color}33`,
      }}>
        {sym}
      </div>

      {/* Bottom-right (rotated) */}
      <div style={{
        position: 'absolute', bottom: isXs ? 1 : isSm ? 1 : 2, right: isXs ? 1 : isSm ? 2 : 3,
        color, lineHeight: 1.1, textAlign: 'center',
        transform: 'rotate(180deg)',
      }}>
        <div style={{ fontSize: rankSize, fontWeight: 900, fontFamily: 'Georgia, serif', letterSpacing: '-0.03em' }}>
          {card.rank}
        </div>
        <div style={{ fontSize: suitSize, marginTop: -1 }}>{sym}</div>
      </div>
    </div>
  );
}
