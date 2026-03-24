'use client';

import { Card } from '@/lib/types';

const suitSymbols: Record<string, string> = {
  hearts: '♥', diamonds: '♦', clubs: '♣', spades: '♠',
};

const suitColors: Record<string, string> = {
  hearts: 'text-red-500', diamonds: 'text-red-500',
  clubs: 'text-gray-800', spades: 'text-gray-800',
};

export function PlayingCard({
  card, faceDown, small, className = '',
}: {
  card?: Card | null; faceDown?: boolean; small?: boolean; className?: string;
}) {
  const w = small ? 'w-9' : 'w-[52px]';
  const h = small ? 'h-13' : 'h-[72px]';

  // Face-down: dark navy card back
  if (!card || faceDown) {
    return (
      <div className={`${w} ${h} rounded-md bg-[#2a3a5c] border border-[#3d506e]/60 shadow-md ${className}`} />
    );
  }

  // Face-up: white card
  return (
    <div className={`${w} ${h} rounded-md bg-white border border-gray-300 shadow-md relative overflow-hidden ${className}`}>
      <div className={`absolute top-0.5 left-1 flex flex-col items-center leading-none ${suitColors[card.suit]}`}>
        <span className={`${small ? 'text-[9px]' : 'text-[11px]'} font-bold`}>{card.rank}</span>
        <span className={`${small ? 'text-[7px]' : 'text-[9px]'} -mt-px`}>{suitSymbols[card.suit]}</span>
      </div>
      <div className={`absolute inset-0 flex items-center justify-center ${suitColors[card.suit]}`}>
        <span className={`${small ? 'text-base' : 'text-xl'} opacity-80`}>{suitSymbols[card.suit]}</span>
      </div>
      <div className={`absolute bottom-0.5 right-1 flex flex-col items-center leading-none rotate-180 ${suitColors[card.suit]}`}>
        <span className={`${small ? 'text-[9px]' : 'text-[11px]'} font-bold`}>{card.rank}</span>
        <span className={`${small ? 'text-[7px]' : 'text-[9px]'} -mt-px`}>{suitSymbols[card.suit]}</span>
      </div>
    </div>
  );
}
