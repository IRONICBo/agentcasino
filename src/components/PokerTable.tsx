'use client';

import { ClientGameState, PlayerAction, WinnerInfo } from '@/lib/types';
import { PlayerSeat } from './PlayerSeat';
import { PlayingCard } from './PlayingCard';
import { useState, useRef, useEffect } from 'react';

// Seat positions for up to 9 players around an oval
/** Calculate evenly-spaced seat positions — wider arc for more players */
function seatCoords(totalPlayers: number): [number, number][] {
  const coords: [number, number][] = [];
  // For 9 players, use a 240° arc; for fewer, use 180°
  const arcDeg = totalPlayers > 6 ? 240 : 180;
  const arcRad = (arcDeg / 180) * Math.PI;
  const startAngle = (Math.PI - arcRad) / 2; // center the arc at bottom
  for (let i = 0; i < totalPlayers; i++) {
    const t = totalPlayers > 1 ? i / (totalPlayers - 1) : 0.5;
    const angle = startAngle + t * arcRad;
    const left = 50 - 44 * Math.cos(angle);
    const top = 38 + 52 * Math.sin(angle);
    coords.push([top, left]);
  }
  return coords;
}

// Consistent color per agent name (shared with PlayerSeat)
const AVATAR_COLORS = [
  '#c0392b','#e74c3c','#9b59b6','#8e44ad',
  '#2471a3','#1a5276','#148f77','#117a65',
  '#d35400','#ca6f1e','#1e8449','#922b21',
];
function avatarColor(name: string): string {
  const idx = name.split('').reduce((a, c) => a + c.charCodeAt(0), 0) % AVATAR_COLORS.length;
  return AVATAR_COLORS[idx];
}

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

function WinnerBanner({ gameState, formatAmount }: { gameState: ClientGameState; formatAmount: (n: number) => string }) {
  const [highlighted, setHighlighted] = useState<WinnerInfo[]>([]);
  const prevKeyRef = useRef('');

  useEffect(() => {
    const key = gameState.winners?.map(w => `${w.agentId}:${w.amount}`).join(',') ?? '';
    if (key && key !== prevKeyRef.current) {
      prevKeyRef.current = key;
      setHighlighted(gameState.winners!);
      const timer = setTimeout(() => setHighlighted([]), 5000);
      return () => clearTimeout(timer);
    }
  }, [gameState.winners]);

  const isActive = highlighted.length > 0;
  if (gameState.players.length === 0) return null;

  return (
    <div
      style={{
        position: 'absolute', top: '-18%', left: '68%',
        zIndex: 30, display: 'flex', alignItems: 'center', gap: 12,
        background: 'linear-gradient(135deg, rgba(20,18,12,0.95) 0%, rgba(15,13,8,0.95) 100%)',
        border: isActive ? '1px solid rgba(212,175,55,0.5)' : '1px solid rgba(255,255,255,0.08)',
        borderRadius: 12, padding: '8px 20px',
        boxShadow: isActive
          ? '0 4px 24px rgba(0,0,0,0.6), 0 0 20px rgba(212,175,55,0.1)'
          : '0 4px 24px rgba(0,0,0,0.4)',
        backdropFilter: 'blur(8px)',
        opacity: isActive ? 1 : 0.2,
        transition: 'opacity 0.5s, border-color 0.5s, box-shadow 0.5s',
      }}
    >
      {isActive && (
        <div style={{ position: 'absolute', top: '50%', left: '50%', pointerEvents: 'none' }}>
          {Array.from({ length: 16 }).map((_, i) => <ConfettiPiece key={i} i={i} />)}
        </div>
      )}

      {isActive ? highlighted.map((w, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, position: 'relative', zIndex: 1 }}>
          {i > 0 && <div style={{ width: 1, height: 24, background: 'rgba(212,175,55,0.3)' }} />}
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#f0f0f0', fontFamily: 'monospace' }}>
              {w.name}
            </div>
            <div
              className="text-gold-shine"
              style={{ fontSize: 18, fontWeight: 900, fontFamily: 'monospace', letterSpacing: '-0.02em' }}
            >
              +{formatAmount(w.amount)}
            </div>
          </div>
        </div>
      )) : (
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.4)', fontFamily: 'monospace', letterSpacing: '0.08em' }}>
            ♠ WINNER ♠
          </div>
        </div>
      )}
    </div>
  );
}

interface PokerTableProps {
  gameState: ClientGameState;
  myAgentId: string;
  onAction: (action: PlayerAction, amount?: number) => void;
}

// ── Sound effects ──
function isMuted(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem('poker-muted') === 'true';
}

function playSound(name: string, volume = 0.5) {
  if (typeof window === 'undefined' || isMuted()) return;
  try {
    const audio = new Audio(`/sounds/${name}`);
    audio.volume = volume;
    audio.play().catch(() => {});
  } catch {}
}

export function PokerTable({ gameState, myAgentId, onAction }: PokerTableProps) {
  const [raiseAmount, setRaiseAmount] = useState(gameState.bigBlind * 2);

  // Re-animate phase label on change
  const prevPhaseRef = useRef(gameState.phase);
  const [phaseKey, setPhaseKey] = useState(0);
  useEffect(() => {
    if (gameState.phase !== prevPhaseRef.current) {
      const prev = prevPhaseRef.current;
      const next = gameState.phase;
      prevPhaseRef.current = next;
      setPhaseKey(k => k + 1);

      // Sound: shuffle on new hand (waiting/showdown → preflop)
      if (next === 'preflop' && (prev === 'waiting' || prev === 'showdown')) {
        playSound('shuffle.mp3', 0.4);
      }
    }
  }, [gameState.phase]);

  // Sound: chips on bet actions (raise, call, check, all_in)
  const prevActionRef = useRef<string | null>(null);
  useEffect(() => {
    if (!gameState.lastAction) return;
    const key = `${gameState.lastAction.agentId}-${gameState.lastAction.action}-${gameState.lastAction.amount}`;
    if (key !== prevActionRef.current) {
      prevActionRef.current = key;
      const action = gameState.lastAction.action;
      if (action === 'raise' || action === 'all_in' || action === 'call' || action === 'check') {
        playSound('chips.mp3', 0.5);
      }
    }
  }, [gameState.lastAction]);

  // Sound: win on showdown
  const prevWinnersRef = useRef(false);
  useEffect(() => {
    const hasWinnersNow = !!(gameState.winners && gameState.winners.length > 0);
    if (hasWinnersNow && !prevWinnersRef.current) {
      playSound('win.mp3', 0.6);
    }
    prevWinnersRef.current = hasWinnersNow;
  }, [gameState.winners]);

  // Pulse pot on change
  const prevPotRef = useRef(gameState.pot);
  const [potKey, setPotKey] = useState(0);
  useEffect(() => {
    if (gameState.pot !== prevPotRef.current) {
      prevPotRef.current = gameState.pot;
      setPotKey(k => k + 1);
    }
  }, [gameState.pot]);

  const activePlayers = gameState.players.filter(p => !p.isWaiting);
  const waitingPlayers = gameState.players.filter(p => p.isWaiting);

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
    n >= 1_000_000 ? `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`
    : n >= 1_000 ? `${(n / 1_000).toFixed(n % 1_000 === 0 ? 0 : 1)}K`
    : String(n);

  return (
    <div style={{ position: 'relative', width: '100%', maxWidth: 900, margin: '0 auto', aspectRatio: '16 / 10' }}>

      {/* ── Dealer avatar ── */}
      <div style={{
        position: 'absolute',
        top: '-22%', left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 20,
        pointerEvents: 'none',
      }}>
        <img src="/dealer.png" alt="Dealer" width={120} style={{ filter: 'drop-shadow(0 8px 24px rgba(0,0,0,0.6))' }} />
      </div>

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
              <PlayingCard key={`e-${i}`} faceDown dealDelay={0} />
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
                background: 'rgba(0,0,0,0.7)',
                border: '1px solid rgba(255,255,255,0.15)',
                borderRadius: 24, padding: '6px 18px',
                fontSize: 14, fontWeight: 600, color: 'rgba(255,255,255,0.9)',
                fontFamily: 'monospace', letterSpacing: '0.08em',
                backdropFilter: 'blur(8px)',
                boxShadow: '0 2px 12px rgba(0,0,0,0.4)',
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

      {/* ── Player seats (active only) ── */}
      {activePlayers.map((player, idx) => {
        const seats = seatCoords(activePlayers.length);
        const [top, left] = seats[idx] ?? seats[0];
        // Map back to original index for dealer/blind detection
        const origIdx = gameState.players.indexOf(player);
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
              isSmallBlind={origIdx === sbIdx}
              isBigBlind={origIdx === bbIdx}
              phase={gameState.phase}
            />
          </div>
        );
      })}

      {/* ── Winner banner (top, always visible, highlights on win for 5s) ── */}
      <WinnerBanner gameState={gameState} formatAmount={formatAmount} />



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

      {/* ── Waiting area ── */}
      {waitingPlayers.length > 0 && (
        <div style={{
          position: 'absolute', bottom: -110, left: '50%', transform: 'translateX(-50%)',
          zIndex: 5, display: 'flex', alignItems: 'center', gap: 16,
        }}>
          <span style={{
            fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.3)',
            fontFamily: 'monospace', letterSpacing: '0.12em', textTransform: 'uppercase',
            whiteSpace: 'nowrap',
          }}>
            WAITING
          </span>
          {waitingPlayers.map(player => (
            <div key={player.agentId} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 10, padding: '6px 12px',
            }}>
              <div style={{
                width: 24, height: 24, borderRadius: '50%',
                background: `radial-gradient(circle at 35% 35%, ${avatarColor(player.name)}dd, ${avatarColor(player.name)}88)`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 9, color: '#fff', fontWeight: 700,
              }}>
                {player.name.replace(/[_-]/g, ' ').split(' ').map(p => p[0] ?? '').join('').toUpperCase().slice(0, 2) || '?'}
              </div>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.5)', fontFamily: 'monospace' }}>
                {player.name}
              </div>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#2ecc71', fontFamily: 'monospace' }}>
                {formatAmount(player.chips)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
