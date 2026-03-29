'use client';

/**
 * Pixel-art poker table for the lobby — editorial black & white style.
 * Shows live game state when active, empty table when idle.
 */

import { ClientGameState } from '@/lib/types';

interface PixelPokerTableProps {
  gameState: ClientGameState | null;
  roomName?: string;
  roomId?: string;
}

/** Seat positions around an ellipse (percentage-based, [top, left]) */
function seatPositions(count: number): [number, number][] {
  const positions: [number, number][] = [];
  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 * i) / count - Math.PI / 2;
    const x = 50 + 42 * Math.cos(angle);
    const y = 50 + 40 * Math.sin(angle);
    positions.push([y, x]);
  }
  return positions;
}

const fmt = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M`
  : n >= 1_000 ? `${(n / 1_000).toFixed(0)}K`
  : String(n);

export function PixelPokerTable({ gameState, roomName, roomId }: PixelPokerTableProps) {
  const isActive = gameState && gameState.phase !== 'waiting' && gameState.players.length > 0;
  const maxSeats = 6;
  const emptySeats = seatPositions(maxSeats);

  return (
    <a
      href={isActive && roomId ? `/room/${roomId}?spectate=1` : undefined}
      className="block border-2 border-[var(--ink)] bg-white transition-shadow hover:shadow-[4px_4px_0_var(--ink)]"
      style={{ textDecoration: 'none', color: 'inherit', boxShadow: '3px 3px 0 var(--ink)', cursor: isActive ? 'pointer' : 'default' }}
    >
      {/* Header bar */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b-2 border-[var(--ink)]" style={{ background: 'var(--bg-page)' }}>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2" style={{ background: isActive ? '#10b981' : 'var(--ink-light)' }} />
          <span className="font-mono text-[9px] tracking-widest uppercase font-bold">
            {isActive ? 'LIVE' : 'NO ACTIVE GAMES'}
          </span>
        </div>
        {isActive && roomName && (
          <span className="font-mono text-[9px] uppercase" style={{ color: 'var(--ink-light)' }}>{roomName}</span>
        )}
      </div>

      {/* Table area */}
      <div style={{ position: 'relative', padding: '12px' }}>
        {/* Pixel grid bg */}
        <div style={{
          position: 'absolute', inset: 0,
          backgroundImage: 'linear-gradient(rgba(0,0,0,0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.02) 1px, transparent 1px)',
          backgroundSize: '8px 8px',
        }} />

        <div style={{ position: 'relative', width: '100%', aspectRatio: '16 / 9' }}>
          {/* Table surface */}
          <div style={{
            position: 'absolute',
            top: '18%', left: '12%', right: '12%', bottom: '18%',
            border: '2px solid var(--ink)',
            borderRadius: '50%',
            background: 'var(--bg-page)',
            boxShadow: '4px 4px 0 var(--ink)',
          }}>
            {/* Inner border */}
            <div style={{
              position: 'absolute', inset: 6,
              border: '1px dashed var(--border)',
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
                  {/* Phase + Pot */}
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-[10px] font-bold uppercase border border-[var(--ink)] px-2 py-0.5" style={{ boxShadow: '1px 1px 0 var(--ink)' }}>
                      {gameState.phase === 'preflop' ? 'PRE-FLOP' : gameState.phase.toUpperCase()}
                    </span>
                    {gameState.pot > 0 && (
                      <span className="font-mono text-sm font-black">
                        POT {fmt(gameState.pot)}
                      </span>
                    )}
                  </div>

                  {/* Community cards — pixel style */}
                  <div className="flex items-center justify-center gap-1">
                    {gameState.communityCards.map((card, i) => {
                      const isRed = card.suit === 'hearts' || card.suit === 'diamonds';
                      const sym = card.suit === 'hearts' ? '♥' : card.suit === 'diamonds' ? '♦' : card.suit === 'clubs' ? '♣' : '♠';
                      return (
                        <div key={i} style={{
                          width: 32, height: 44,
                          border: '2px solid var(--ink)',
                          background: '#fff',
                          boxShadow: '2px 2px 0 var(--ink)',
                          display: 'flex', flexDirection: 'column',
                          alignItems: 'center', justifyContent: 'center',
                          fontFamily: 'monospace', gap: 0,
                        }}>
                          <span style={{ fontSize: 10, fontWeight: 900, color: isRed ? '#c0392b' : 'var(--ink)', lineHeight: 1 }}>{card.rank}</span>
                          <span style={{ fontSize: 9, color: isRed ? '#c0392b' : 'var(--ink)', lineHeight: 1 }}>{sym}</span>
                        </div>
                      );
                    })}
                    {Array.from({ length: 5 - gameState.communityCards.length }).map((_, i) => (
                      <div key={`e${i}`} style={{
                        width: 32, height: 44,
                        border: '1px dashed var(--border)',
                      }} />
                    ))}
                  </div>

                  {/* Last action ticker */}
                  {gameState.lastAction && (() => {
                    const a = gameState.lastAction;
                    const p = gameState.players.find(pl => pl.agentId === a.agentId);
                    const name = p?.name ?? a.agentId.slice(0, 8);
                    const label = a.action.toUpperCase().replace('_', ' ');
                    const text = a.amount ? `${name} ${label} ${fmt(a.amount)}` : `${name} ${label}`;
                    return (
                      <span className="font-mono text-[9px] font-bold border border-[var(--ink)] px-2 py-0.5 bg-[var(--bg-page)]">
                        {text}
                      </span>
                    );
                  })()}
                </>
              ) : (
                <>
                  {/* Suits watermark */}
                  <div style={{
                    fontFamily: 'monospace', fontSize: 24,
                    color: 'var(--border)', letterSpacing: '0.3em', userSelect: 'none',
                  }}>
                    ♠ ♥ ♦ ♣
                  </div>
                  {/* 5 empty card slots */}
                  <div style={{ display: 'flex', gap: 4 }}>
                    {Array.from({ length: 5 }).map((_, i) => (
                      <div key={i} style={{
                        width: 28, height: 38,
                        border: '1px dashed var(--border)',
                      }} />
                    ))}
                  </div>
                  <div style={{
                    fontFamily: 'var(--font-mono)', fontSize: 9,
                    letterSpacing: '0.15em', textTransform: 'uppercase',
                    color: 'var(--ink-light)',
                  }}>
                    Waiting for agents...
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Seats */}
          {isActive ? (
            /* Player seats from game state */
            gameState.players.map((player) => {
              // Map seat index to ellipse positions
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
                    border: isCurrent ? '2px solid var(--ink)' : '2px solid var(--ink)',
                    background: isCurrent ? 'var(--ink)' : 'var(--bg-page)',
                    color: isCurrent ? 'var(--bg-page)' : 'var(--ink)',
                    boxShadow: '2px 2px 0 var(--ink)',
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
            /* Empty seats — pixel-art chairs */
            emptySeats.map(([top, left], i) => (
              <div key={i} style={{
                position: 'absolute',
                top: `${top}%`, left: `${left}%`,
                transform: 'translate(-50%, -50%)',
                zIndex: 2,
              }}>
                <div style={{
                  width: 32, height: 32,
                  border: '2px solid var(--ink)',
                  background: 'var(--bg-page)',
                  boxShadow: '2px 2px 0 var(--ink)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <span style={{ fontFamily: 'monospace', fontSize: 14, color: 'var(--border)', userSelect: 'none' }}>?</span>
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
                border: '2px solid var(--ink)',
                background: '#fff',
                boxShadow: '3px 3px 0 var(--ink)',
                padding: '8px 16px',
                textAlign: 'center',
                fontFamily: 'monospace',
              }}>
                <div style={{ fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--ink-light)', marginBottom: 4 }}>
                  Winner
                </div>
                {gameState.winners.map((w, i) => (
                  <div key={i}>
                    <div style={{ fontSize: 12, fontWeight: 900 }}>{w.name}</div>
                    <div style={{ fontSize: 14, fontWeight: 900 }}>+{fmt(w.amount)}</div>
                    <div style={{ fontSize: 8, color: 'var(--ink-light)' }}>{w.hand.description.toUpperCase()}</div>
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
