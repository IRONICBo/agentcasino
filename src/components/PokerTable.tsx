'use client';

import { ClientGameState, PlayerAction } from '@/lib/types';
import { PlayerSeat } from './PlayerSeat';
import { PlayingCard } from './PlayingCard';
import { useState, useRef, useEffect } from 'react';

// Seat positions for up to 9 players around an oval
const SEAT_COORDS: [number, number][] = [
  [88, 42],  // 0: bottom-center (hero)
  [72, 8],   // 1: bottom-left
  [35, 2],   // 2: mid-left
  [5, 14],   // 3: top-left
  [0, 42],   // 4: top-center
  [5, 70],   // 5: top-right
  [35, 82],  // 6: mid-right
  [72, 77],  // 7: bottom-right
  [88, 60],  // 8: bottom-center-right
];

const phaseLabels: Record<string, string> = {
  waiting: 'WAITING', preflop: 'PRE-FLOP', flop: 'FLOP',
  turn: 'TURN', river: 'RIVER', showdown: 'SHOWDOWN',
};

// Confetti piece
function ConfettiPiece({ i }: { i: number }) {
  const colors = ['#d4af37','#f0c040','#e74c3c','#3498db','#2ecc71','#9b59b6','#f39c12','#fff'];
  const shapes = [6, 8, 10, 4, 6, 5, 7, 9];
  const s = shapes[i % shapes.length];
  return (
    <div style={{
      position: 'absolute', top: '50%', left: '50%',
      width: s, height: s,
      background: colors[i % colors.length],
      borderRadius: i % 3 === 0 ? '50%' : i % 3 === 1 ? 2 : 0,
      animation: `confetti-fall-${(i % 8) + 1} ${0.8 + (i % 4) * 0.15}s ease-out ${i * 60}ms both`,
      boxShadow: `0 0 4px ${colors[i % colors.length]}66`,
    }} />
  );
}

interface PokerTableProps {
  gameState: ClientGameState;
  myAgentId: string;
  onAction: (action: PlayerAction, amount?: number) => void;
}

export function PokerTable({ gameState, myAgentId, onAction }: PokerTableProps) {
  const [raiseAmount, setRaiseAmount] = useState(gameState.bigBlind * 2);

  // Re-animate phase label on change
  const prevPhaseRef = useRef(gameState.phase);
  const [phaseKey, setPhaseKey] = useState(0);
  useEffect(() => {
    if (gameState.phase !== prevPhaseRef.current) {
      prevPhaseRef.current = gameState.phase;
      setPhaseKey(k => k + 1);
    }
  }, [gameState.phase]);

  // Pulse pot on change
  const prevPotRef = useRef(gameState.pot);
  const [potKey, setPotKey] = useState(0);
  useEffect(() => {
    if (gameState.pot !== prevPotRef.current) {
      prevPotRef.current = gameState.pot;
      setPotKey(k => k + 1);
    }
  }, [gameState.pot]);

  const myPlayer = gameState.players.find(p => p.agentId === myAgentId);
  const isMyTurn = gameState.players[gameState.currentPlayerIndex]?.agentId === myAgentId;
  const highestBet = Math.max(...gameState.players.map(p => p.currentBet), 0);
  const toCall = myPlayer ? Math.max(0, highestBet - myPlayer.currentBet) : 0;

  const sbIdx = gameState.players.length === 2
    ? gameState.dealerIndex
    : (gameState.dealerIndex + 1) % gameState.players.length;
  const bbIdx = (sbIdx + 1) % gameState.players.length;

  const hasWinners = !!(gameState.winners && gameState.winners.length > 0);

  // Format pot with K/M suffix
  const formatAmount = (n: number) =>
    n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M`
    : n >= 1_000 ? `${(n / 1_000).toFixed(0)}K`
    : String(n);

  return (
    <div style={{ position: 'relative', width: '100%', maxWidth: 900, margin: '0 auto', aspectRatio: '16 / 10' }}>

      {/* ── Wood rail (outer oval) ── */}
      <div
        className="poker-rail"
        style={{
          position: 'absolute',
          top: '8%', left: '8%', right: '8%', bottom: '8%',
          borderRadius: '50%',
        }}
      />

      {/* ── Felt (inner oval) ── */}
      <div
        className="poker-felt"
        style={{
          position: 'absolute',
          top: '13%', left: '13%', right: '13%', bottom: '13%',
          borderRadius: '50%', overflow: 'hidden',
        }}
      >
        {/* Gold inner trim ring */}
        <div className="poker-rail-trim" style={{
          position: 'absolute', inset: 6, borderRadius: '50%', pointerEvents: 'none',
        }} />

        {/* Watermark */}
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 90, color: 'rgba(255,255,255,0.025)',
          fontFamily: 'serif', userSelect: 'none', pointerEvents: 'none',
          letterSpacing: '-0.1em',
        }}>
          ♠♥
        </div>

        {/* ── Center content ── */}
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          gap: 10, zIndex: 5,
        }}>
          {/* Phase */}
          <div
            key={phaseKey}
            className="animate-phase"
            style={{
              fontSize: 10, fontWeight: 700,
              letterSpacing: '0.25em', textTransform: 'uppercase',
              color: 'rgba(212,175,55,0.75)',
              fontFamily: 'monospace',
              textShadow: '0 0 12px rgba(212,175,55,0.3)',
            }}
          >
            {phaseLabels[gameState.phase] || gameState.phase}
          </div>

          {/* Community cards */}
          <div style={{ display: 'flex', gap: 6 }}>
            {gameState.communityCards.map((card, i) => (
              <PlayingCard key={`${phaseKey}-${i}`} card={card} dealDelay={i * 130} />
            ))}
            {Array.from({ length: 5 - gameState.communityCards.length }).map((_, i) => (
              <div key={`e-${i}`} style={{
                width: 54, height: 76, borderRadius: 6,
                border: '1px dashed rgba(255,255,255,0.1)',
                background: 'rgba(255,255,255,0.025)',
              }} />
            ))}
          </div>

          {/* Pot */}
          {gameState.pot > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {/* Stack of chips icon */}
              <div style={{ position: 'relative', width: 18, height: 18 }}>
                {[3, 1.5, 0].map((off, j) => (
                  <div key={j} style={{
                    position: 'absolute', left: 0, bottom: off,
                    width: 18, height: 18, borderRadius: '50%',
                    background: j === 0 ? '#d4af37' : j === 1 ? '#c9a227' : '#b8960a',
                    border: '1px solid rgba(0,0,0,0.3)',
                    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.25)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {j === 0 && <span style={{ fontSize: 5, color: 'rgba(0,0,0,0.5)', fontWeight: 900 }}>●●●</span>}
                  </div>
                ))}
              </div>
              <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.45)', fontFamily: 'monospace', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
                POT
              </span>
              <span
                key={potKey}
                className="animate-chip-pulse"
                style={{
                  fontSize: 16, fontWeight: 800, color: '#f0c040',
                  fontFamily: 'monospace', letterSpacing: '-0.02em',
                  textShadow: '0 0 16px rgba(212,175,55,0.4)',
                }}
              >
                {formatAmount(gameState.pot)}
              </span>
            </div>
          )}

          {/* Last action ticker */}
          {gameState.lastAction && (
            <div
              key={`${gameState.lastAction.agentId}-${gameState.lastAction.action}-${gameState.lastAction.amount}`}
              className="animate-action-in"
              style={{
                background: 'rgba(0,0,0,0.55)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 20, padding: '2px 10px',
                fontSize: 9, color: 'rgba(200,200,200,0.75)',
                fontFamily: 'monospace', letterSpacing: '0.06em',
                backdropFilter: 'blur(4px)',
              }}
            >
              {(() => {
                const a = gameState.lastAction;
                const p = gameState.players.find(p => p.agentId === a.agentId);
                const name = p?.name ?? a.agentId.slice(0, 8);
                const label = a.action.toUpperCase().replace('_', ' ');
                return a.amount ? `${name} ${label} ${formatAmount(a.amount)}` : `${name} ${label}`;
              })()}
            </div>
          )}
        </div>
      </div>

      {/* ── Player seats ── */}
      {gameState.players.map((player, idx) => {
        const [top, left] = SEAT_COORDS[player.seatIndex] ?? SEAT_COORDS[0];
        return (
          <div
            key={player.agentId}
            style={{
              position: 'absolute', zIndex: 10,
              top: `${top}%`, left: `${left}%`,
              transform: 'translate(-50%, -50%)',
            }}
          >
            <PlayerSeat
              player={player}
              isCurrentTurn={gameState.players[gameState.currentPlayerIndex]?.agentId === player.agentId}
              isDealer={gameState.players[gameState.dealerIndex]?.agentId === player.agentId}
              isSmallBlind={idx === sbIdx}
              isBigBlind={idx === bbIdx}
              phase={gameState.phase}
            />
          </div>
        );
      })}

      {/* ── Winners overlay ── */}
      {hasWinners && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 30,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {/* Backdrop */}
          <div style={{
            position: 'absolute', inset: 0,
            background: 'radial-gradient(ellipse at center, rgba(0,0,0,0.3) 0%, rgba(0,0,0,0.7) 100%)',
            borderRadius: '50% 50% 0 0',
            animation: 'fade-up 0.3s ease both',
          }} />

          {/* Gold rays */}
          <div style={{
            position: 'absolute', top: '50%', left: '50%',
            width: 300, height: 300, marginLeft: -150, marginTop: -150,
            animation: 'rays-spin 8s linear infinite',
            background: `conic-gradient(
              from 0deg,
              transparent 0deg, rgba(212,175,55,0.06) 10deg, transparent 20deg,
              transparent 45deg, rgba(212,175,55,0.04) 55deg, transparent 65deg,
              transparent 90deg, rgba(212,175,55,0.06) 100deg, transparent 110deg,
              transparent 135deg, rgba(212,175,55,0.04) 145deg, transparent 155deg,
              transparent 180deg, rgba(212,175,55,0.06) 190deg, transparent 200deg,
              transparent 225deg, rgba(212,175,55,0.04) 235deg, transparent 245deg,
              transparent 270deg, rgba(212,175,55,0.06) 280deg, transparent 290deg,
              transparent 315deg, rgba(212,175,55,0.04) 325deg, transparent 335deg
            )`,
            borderRadius: '50%',
          }} />

          {/* Confetti */}
          <div style={{ position: 'absolute', top: '50%', left: '50%' }}>
            {Array.from({ length: 24 }).map((_, i) => <ConfettiPiece key={i} i={i} />)}
          </div>

          {/* Winner card */}
          <div
            className="animate-winner-pop"
            style={{
              position: 'relative', zIndex: 40,
              background: 'linear-gradient(160deg, #1a1a1a 0%, #111 100%)',
              border: '1px solid rgba(212,175,55,0.5)',
              borderRadius: 16, padding: '20px 36px 24px',
              textAlign: 'center',
              boxShadow: '0 0 0 1px rgba(212,175,55,0.1), 0 20px 60px rgba(0,0,0,0.8), 0 0 40px rgba(212,175,55,0.1)',
            }}
          >
            {/* Gold top line */}
            <div style={{ height: 2, background: 'linear-gradient(90deg, transparent, #d4af37, transparent)', borderRadius: 1, marginBottom: 14 }} />

            <div style={{
              fontSize: 9, letterSpacing: '0.25em', textTransform: 'uppercase',
              color: 'rgba(212,175,55,0.6)', fontFamily: 'monospace', marginBottom: 10,
            }}>
              ✦ Winner ✦
            </div>

            {gameState.winners!.map((w, i) => (
              <div key={i} style={{ marginBottom: i < gameState.winners!.length - 1 ? 12 : 0 }}>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#f0f0f0', marginBottom: 4 }}>
                  {w.name}
                </div>
                <div
                  className="text-gold-shine"
                  style={{ fontSize: 28, fontWeight: 900, fontFamily: 'monospace', letterSpacing: '-0.02em' }}
                >
                  +{formatAmount(w.amount)}
                </div>
                <div style={{ fontSize: 10, color: 'rgba(180,180,180,0.6)', marginTop: 4, fontFamily: 'monospace', letterSpacing: '0.06em' }}>
                  {w.hand.description.toUpperCase()}
                </div>
              </div>
            ))}

            <div style={{ height: 2, background: 'linear-gradient(90deg, transparent, #d4af37, transparent)', borderRadius: 1, marginTop: 14 }} />
          </div>
        </div>
      )}

      {/* ── Action bar ── */}
      {isMyTurn && gameState.phase !== 'waiting' && gameState.phase !== 'showdown' && (
        <div style={{
          position: 'absolute', bottom: -72, left: '50%', transform: 'translateX(-50%)',
          zIndex: 30,
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            background: 'linear-gradient(135deg, rgba(15,15,15,0.98) 0%, rgba(25,25,25,0.96) 100%)',
            border: '1px solid rgba(212,175,55,0.25)',
            borderRadius: 14, padding: '10px 16px',
            boxShadow: '0 8px 40px rgba(0,0,0,0.7), 0 0 0 1px rgba(212,175,55,0.08), inset 0 1px 0 rgba(255,255,255,0.04)',
          }}>
            {/* Fold */}
            <button
              onClick={() => onAction('fold')}
              style={{
                padding: '8px 18px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                background: 'linear-gradient(135deg, #3a1a1a, #2a1010)',
                border: '1px solid rgba(200,0,30,0.35)',
                color: '#e88', cursor: 'pointer',
                fontFamily: 'monospace', letterSpacing: '0.06em', textTransform: 'uppercase',
                transition: 'all 0.15s',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'linear-gradient(135deg, #5a2020, #3a1515)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'linear-gradient(135deg, #3a1a1a, #2a1010)')}
            >
              Fold
            </button>

            {/* Check / Call */}
            {toCall === 0 ? (
              <button
                onClick={() => onAction('check')}
                style={{
                  padding: '8px 18px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                  background: 'linear-gradient(135deg, #1a3a28, #0f2a1a)',
                  border: '1px solid rgba(46,204,113,0.4)',
                  color: '#5ddb8a', cursor: 'pointer',
                  fontFamily: 'monospace', letterSpacing: '0.06em', textTransform: 'uppercase',
                  transition: 'all 0.15s',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'linear-gradient(135deg, #1e5535, #143d27)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'linear-gradient(135deg, #1a3a28, #0f2a1a)')}
              >
                Check
              </button>
            ) : (
              <button
                onClick={() => onAction('call')}
                style={{
                  padding: '8px 18px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                  background: 'linear-gradient(135deg, #1a3a28, #0f2a1a)',
                  border: '1px solid rgba(46,204,113,0.4)',
                  color: '#5ddb8a', cursor: 'pointer',
                  fontFamily: 'monospace', letterSpacing: '0.06em', textTransform: 'uppercase',
                  transition: 'all 0.15s',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'linear-gradient(135deg, #1e5535, #143d27)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'linear-gradient(135deg, #1a3a28, #0f2a1a)')}
              >
                Call {formatAmount(toCall)}
              </button>
            )}

            {/* Divider */}
            <div style={{ width: 1, height: 28, background: 'rgba(255,255,255,0.1)' }} />

            {/* Raise slider + button */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <input
                  type="range"
                  min={gameState.minRaise}
                  max={myPlayer?.chips ?? gameState.minRaise}
                  value={Math.min(raiseAmount, myPlayer?.chips ?? raiseAmount)}
                  onChange={e => setRaiseAmount(Number(e.target.value))}
                  style={{ width: 72, accentColor: '#d4af37', cursor: 'pointer' }}
                />
                <span style={{ fontSize: 8, color: 'rgba(212,175,55,0.5)', textAlign: 'center', fontFamily: 'monospace' }}>
                  {formatAmount(raiseAmount)}
                </span>
              </div>
              <button
                onClick={() => onAction('raise', raiseAmount)}
                style={{
                  padding: '8px 16px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                  background: 'linear-gradient(135deg, #3a2800, #2a1c00)',
                  border: '1px solid rgba(212,175,55,0.4)',
                  color: '#d4af37', cursor: 'pointer',
                  fontFamily: 'monospace', letterSpacing: '0.04em', textTransform: 'uppercase',
                  transition: 'all 0.15s',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'linear-gradient(135deg, #5a3f00, #3a2800)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'linear-gradient(135deg, #3a2800, #2a1c00)')}
              >
                Raise
              </button>
            </div>

            {/* Divider */}
            <div style={{ width: 1, height: 28, background: 'rgba(255,255,255,0.1)' }} />

            {/* All-in */}
            <button
              onClick={() => onAction('all_in')}
              style={{
                padding: '8px 14px', borderRadius: 8, fontSize: 11, fontWeight: 900,
                background: 'linear-gradient(135deg, #5a0a0a, #3a0505)',
                border: '1px solid rgba(231,76,60,0.5)',
                color: '#ff6b6b', cursor: 'pointer',
                fontFamily: 'monospace', letterSpacing: '0.08em', textTransform: 'uppercase',
                boxShadow: '0 0 12px rgba(231,76,60,0.15)',
                transition: 'all 0.15s',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = 'linear-gradient(135deg, #7a1010, #5a0808)';
                e.currentTarget.style.boxShadow = '0 0 20px rgba(231,76,60,0.3)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'linear-gradient(135deg, #5a0a0a, #3a0505)';
                e.currentTarget.style.boxShadow = '0 0 12px rgba(231,76,60,0.15)';
              }}
            >
              ALL IN
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
