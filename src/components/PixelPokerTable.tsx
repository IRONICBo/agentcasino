'use client';

/**
 * Pixel-art poker table for the lobby — pink pop-art style.
 * Shows live game state when active, empty table when idle.
 */

import { ClientGameState } from '@/lib/types';

interface PixelPokerTableProps {
  gameState: ClientGameState | null;
  roomName?: string;
  roomId?: string;
}

/** Seat positions — bottom half + sides only (top reserved for dealer) */
function seatPositions(count: number): [number, number][] {
  const positions: [number, number][] = [];
  for (let i = 0; i < count; i++) {
    const angle = Math.PI * (i / (count - 1));
    const x = 50 - 42 * Math.cos(angle);
    const y = 50 + 38 * Math.sin(angle);
    positions.push([y, x]);
  }
  return positions;
}

const fmt = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M`
  : n >= 1_000 ? `${(n / 1_000).toFixed(0)}K`
  : String(n);

// Pink palette
const P = {
  bg: '#FFF0F5',
  surface: '#FFE0EB',
  border: '#FF70A6',
  borderLight: '#FFB0CC',
  text: '#CC2070',
  textLight: '#E880A8',
  card: '#FF70A6',
  cardInner: '#FFB0CC',
  white: '#fff',
};

export function PixelPokerTable({ gameState, roomName, roomId }: PixelPokerTableProps) {
  const isActive = gameState && gameState.phase !== 'waiting' && gameState.players.length > 0;
  const maxSeats = 6;
  const emptySeats = seatPositions(maxSeats);

  return (
    <a
      href={isActive && roomId ? `/room/${roomId}?spectate=1` : undefined}
      className="block transition-shadow"
      style={{
        textDecoration: 'none', color: 'inherit',
        border: `2px solid ${P.border}`,
        borderRadius: 16,
        background: P.white,
        boxShadow: `3px 3px 0 ${P.border}`,
        cursor: isActive ? 'pointer' : 'default',
        overflow: 'hidden',
      }}
    >
      {/* Header bar */}
      <div className="flex items-center justify-between px-3 py-1.5" style={{ background: P.surface, borderBottom: `2px solid ${P.border}` }}>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full" style={{ background: isActive ? '#22c55e' : P.borderLight }} />
          <span className="font-mono text-[9px] tracking-widest uppercase font-bold" style={{ color: P.text }}>
            {isActive ? 'LIVE' : 'NO ACTIVE GAMES'}
          </span>
        </div>
        {isActive && roomName && (
          <span className="font-mono text-[9px] uppercase" style={{ color: P.textLight }}>{roomName}</span>
        )}
      </div>

      {/* Table area */}
      <div style={{ position: 'relative', padding: '12px', background: P.bg }}>
        {/* Pixel grid bg */}
        <div style={{
          position: 'absolute', inset: 0,
          backgroundImage: `linear-gradient(${P.borderLight}22 1px, transparent 1px), linear-gradient(90deg, ${P.borderLight}22 1px, transparent 1px)`,
          backgroundSize: '8px 8px',
        }} />

        <div style={{ position: 'relative', width: '100%', aspectRatio: '16 / 9' }}>
          {/* Table surface */}
          <div style={{
            position: 'absolute',
            top: '18%', left: '12%', right: '12%', bottom: '18%',
            border: `2px solid ${P.border}`,
            borderRadius: '50%',
            background: P.surface,
            boxShadow: `4px 4px 0 ${P.borderLight}`,
          }}>
            {/* Inner border */}
            <div style={{
              position: 'absolute', inset: 6,
              border: `1px dashed ${P.borderLight}`,
              borderRadius: '50%',
            }} />

            {/* Center content */}
            <div style={{
              position: 'absolute', inset: 0,
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              gap: 6,
            }}>
              {isActive ? (
                <>
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-[10px] font-bold uppercase px-2 py-0.5 rounded-full" style={{ background: P.card, color: P.white }}>
                      {gameState.phase === 'preflop' ? 'PRE-FLOP' : gameState.phase.toUpperCase()}
                    </span>
                    {gameState.pot > 0 && (
                      <span className="font-mono text-sm font-black" style={{ color: P.text }}>
                        POT {fmt(gameState.pot)}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center justify-center gap-1">
                    {gameState.communityCards.map((card, i) => {
                      const isRed = card.suit === 'hearts' || card.suit === 'diamonds';
                      const sym = card.suit === 'hearts' ? '♥' : card.suit === 'diamonds' ? '♦' : card.suit === 'clubs' ? '♣' : '♠';
                      return (
                        <div key={i} style={{
                          width: 32, height: 44,
                          border: `2px solid ${P.border}`,
                          borderRadius: 6,
                          background: '#fff',
                          boxShadow: `2px 2px 0 ${P.borderLight}`,
                          display: 'flex', flexDirection: 'column',
                          alignItems: 'center', justifyContent: 'center',
                          fontFamily: 'monospace', gap: 0,
                        }}>
                          <span style={{ fontSize: 10, fontWeight: 900, color: isRed ? '#FF70A6' : P.text, lineHeight: 1 }}>{card.rank}</span>
                          <span style={{ fontSize: 9, color: isRed ? '#FF70A6' : P.text, lineHeight: 1 }}>{sym}</span>
                        </div>
                      );
                    })}
                    {Array.from({ length: 5 - gameState.communityCards.length }).map((_, i) => (
                      <div key={`e${i}`} style={{
                        width: 32, height: 44,
                        border: `2px solid ${P.border}`,
                        borderRadius: 6,
                        background: P.card,
                        boxShadow: `2px 2px 0 ${P.borderLight}`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        <div style={{
                          width: 20, height: 30,
                          border: `1px solid ${P.borderLight}`,
                          borderRadius: 4,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontFamily: 'monospace', fontSize: 10, color: P.borderLight,
                          userSelect: 'none',
                        }}>♠</div>
                      </div>
                    ))}
                  </div>

                  {gameState.lastAction && (() => {
                    const a = gameState.lastAction;
                    const p = gameState.players.find(pl => pl.agentId === a.agentId);
                    const name = p?.name ?? a.agentId.slice(0, 8);
                    const label = a.action.toUpperCase().replace('_', ' ');
                    const text = a.amount ? `${name} ${label} ${fmt(a.amount)}` : `${name} ${label}`;
                    return (
                      <span className="font-mono text-[9px] font-bold px-2 py-0.5 rounded-full" style={{ background: P.white, color: P.text, border: `1px solid ${P.border}` }}>
                        {text}
                      </span>
                    );
                  })()}
                </>
              ) : (
                <>
                  <div style={{
                    fontFamily: 'monospace', fontSize: 24,
                    color: P.borderLight, letterSpacing: '0.3em', userSelect: 'none',
                  }}>
                    ♠ ♥ ♦ ♣
                  </div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {Array.from({ length: 5 }).map((_, i) => (
                      <div key={i} style={{
                        width: 28, height: 38,
                        border: `2px solid ${P.border}`,
                        borderRadius: 6,
                        background: P.card,
                        boxShadow: `2px 2px 0 ${P.borderLight}`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        <div style={{
                          width: 18, height: 26,
                          border: `1px solid ${P.borderLight}`,
                          borderRadius: 4,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontFamily: 'monospace', fontSize: 8, color: P.borderLight,
                          userSelect: 'none',
                        }}>♠</div>
                      </div>
                    ))}
                  </div>
                  <div style={{
                    fontFamily: 'var(--font-mono)', fontSize: 9,
                    letterSpacing: '0.15em', textTransform: 'uppercase',
                    color: P.textLight,
                  }}>
                    Waiting for agents...
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Seats */}
          {isActive ? (
            gameState.players.map((player) => {
              const seats = seatPositions(Math.max(gameState.players.length, maxSeats));
              const [top, left] = seats[player.seatIndex] ?? seats[0];
              const isCurrent = gameState.players[gameState.currentPlayerIndex]?.agentId === player.agentId;
              return (
                <div key={player.agentId} style={{
                  position: 'absolute',
                  top: `${top}%`, left: `${left}%`,
                  transform: 'translate(-50%, -50%)',
                  zIndex: 2,
                }}>
                  <div style={{
                    border: `2px solid ${P.border}`,
                    borderRadius: 10,
                    background: isCurrent ? P.card : P.white,
                    color: isCurrent ? P.white : P.text,
                    boxShadow: `2px 2px 0 ${P.borderLight}`,
                    padding: '2px 6px',
                    opacity: player.hasFolded ? 0.35 : 1,
                    fontFamily: 'monospace',
                    minWidth: 48,
                    textAlign: 'center',
                  }}>
                    <div style={{ fontSize: 9, fontWeight: 700, textDecoration: player.hasFolded ? 'line-through' : 'none', whiteSpace: 'nowrap' }}>
                      {player.name.length > 8 ? player.name.slice(0, 7) + '…' : player.name}
                    </div>
                    <div style={{ fontSize: 8, whiteSpace: 'nowrap' }}>
                      {fmt(player.chips)}
                      {player.currentBet > 0 && !player.hasFolded && <span> | {fmt(player.currentBet)}</span>}
                      {player.hasFolded && ' ✗'}
                      {player.isAllIn && ' ALL IN'}
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            emptySeats.map(([top, left], i) => (
              <div key={i} style={{
                position: 'absolute',
                top: `${top}%`, left: `${left}%`,
                transform: 'translate(-50%, -50%)',
                zIndex: 2,
              }}>
                <div style={{
                  width: 32, height: 32,
                  border: `2px solid ${P.border}`,
                  borderRadius: 10,
                  background: P.surface,
                  boxShadow: `2px 2px 0 ${P.borderLight}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <span style={{ fontFamily: 'monospace', fontSize: 14, color: P.borderLight, userSelect: 'none' }}>?</span>
                </div>
              </div>
            ))
          )}

          {/* Winners overlay */}
          {isActive && gameState.winners && gameState.winners.length > 0 && (
            <div style={{
              position: 'absolute', inset: 0, zIndex: 10,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <div style={{
                border: `2px solid ${P.border}`,
                borderRadius: 16,
                background: '#fff',
                boxShadow: `3px 3px 0 ${P.borderLight}`,
                padding: '8px 16px',
                textAlign: 'center',
                fontFamily: 'monospace',
              }}>
                <div style={{ fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', color: P.textLight, marginBottom: 4 }}>
                  Winner
                </div>
                {gameState.winners.map((w, i) => (
                  <div key={i}>
                    <div style={{ fontSize: 12, fontWeight: 900, color: P.text }}>{w.name}</div>
                    <div style={{ fontSize: 14, fontWeight: 900, color: P.card }}>+{fmt(w.amount)}</div>
                    <div style={{ fontSize: 8, color: P.textLight }}>{w.hand.description.toUpperCase()}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </a>
  );
}
