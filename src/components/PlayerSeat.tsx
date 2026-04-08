'use client';

import { ClientPlayer, GamePhase } from '@/lib/types';
import { PlayingCard } from './PlayingCard';

function formatChips(n: number): string {
  if (n >= 1_000_000) {
    const v = n / 1_000_000;
    return `${parseFloat(v.toFixed(2))}M`;
  }
  if (n >= 1_000) {
    const v = n / 1_000;
    return `${parseFloat(v.toFixed(2))}K`;
  }
  return String(n);
}

interface PlayerSeatProps {
  player: ClientPlayer;
  isCurrentTurn: boolean;
  isDealer: boolean;
  isSmallBlind: boolean;
  isBigBlind: boolean;
  phase: GamePhase;
}

// Consistent color per agent name
const AVATAR_COLORS = [
  '#c0392b','#e74c3c','#9b59b6','#8e44ad',
  '#2471a3','#1a5276','#148f77','#117a65',
  '#d35400','#ca6f1e','#1e8449','#922b21',
];

function avatarColor(name: string): string {
  const idx = name.split('').reduce((a, c) => a + c.charCodeAt(0), 0) % AVATAR_COLORS.length;
  return AVATAR_COLORS[idx];
}

function initials(name: string): string {
  return name.replace(/[_-]/g, ' ').split(' ').map(p => p[0] ?? '').join('').toUpperCase().slice(0, 2) || '?';
}

// Visual chip for bet display
function ChipStack({ amount }: { amount: number }) {
  if (!amount) return null;
  // Pick chip color by amount
  const color = amount >= 10000 ? '#c0392b' : amount >= 1000 ? '#2471a3' : '#1a5276';
  const label = amount >= 1_000_000 ? `${(amount/1_000_000).toFixed(1)}M`
    : amount >= 1000 ? `${(amount/1000).toFixed(0)}K`
    : String(amount);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
      {/* Chip stack layers */}
      <div style={{ position: 'relative', width: 18, height: 20 }}>
        {[4, 2, 0].map((offset, i) => (
          <div key={i} style={{
            position: 'absolute', left: 0, bottom: offset,
            width: 18, height: 18, borderRadius: '50%',
            background: color,
            border: '1.5px solid rgba(255,255,255,0.2)',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.25), 0 1px 3px rgba(0,0,0,0.4)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {i === 2 && (
              <span style={{ fontSize: 5, color: 'rgba(255,255,255,0.8)', fontWeight: 800, fontFamily: 'monospace' }}>
                ●●●
              </span>
            )}
          </div>
        ))}
      </div>
      <span style={{ fontSize: 10, fontWeight: 700, color: '#f0c040', fontFamily: 'monospace' }}>
        {label}
      </span>
    </div>
  );
}

// Timer bar for active player
function TimerBar() {
  return (
    <div style={{
      position: 'absolute', bottom: 0, left: 0, right: 0, height: 2,
      background: 'rgba(255,255,255,0.08)', borderRadius: '0 0 8px 8px', overflow: 'hidden',
    }}>
      <div style={{
        height: '100%',
        background: 'linear-gradient(90deg, #f0c040, #d4af37)',
        animation: 'timer-drain 25s linear forwards',
        boxShadow: '0 0 4px rgba(212,175,55,0.6)',
      }} />
    </div>
  );
}

export function PlayerSeat({ player, isCurrentTurn, isDealer, isSmallBlind, isBigBlind, phase }: PlayerSeatProps) {
  const badge = isDealer ? 'D' : isSmallBlind ? 'SB' : isBigBlind ? 'BB' : null;
  const bgColor = avatarColor(player.name);
  const inits = initials(player.name);
  const isFolded = player.hasFolded;
  const isAllIn = player.isAllIn;
  const isDisconnected = !player.isConnected;

  return (
    <div
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
        opacity: isFolded || isDisconnected ? 0.38 : 1,
        transition: 'opacity 0.5s ease',
        filter: (isFolded || isDisconnected) ? 'grayscale(0.6)' : 'none',
      }}
    >
      {/* ── Hole cards ── */}
      {phase !== 'waiting' && (
        <div style={{ display: 'flex', gap: 2, marginBottom: 2, position: 'relative' }}>
          {player.holeCards ? (
            player.holeCards.map((c, i) => (
              <PlayingCard key={i} card={c} small dealDelay={i * 90} />
            ))
          ) : (
            <>
              <PlayingCard faceDown small dealDelay={0} />
              <div style={{ marginLeft: -10 }}><PlayingCard faceDown small dealDelay={90} /></div>
            </>
          )}
        </div>
      )}

      {/* ── Avatar ── */}
      <div style={{ position: 'relative' }}>
        <div
          className={`player-avatar ${isCurrentTurn ? 'player-avatar-active' : ''}`}
          style={{
            width: 44, height: 44, borderRadius: '50%',
            background: `radial-gradient(circle at 35% 35%, ${bgColor}dd, ${bgColor}88)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 13, color: '#fff',
          }}
        >
          {inits}
        </div>

        {/* Win probability badge */}
        {player.winProbability != null && !isFolded && (
          <div style={{
            position: 'absolute', top: -6, left: -6,
            minWidth: 28, height: 18, borderRadius: 9,
            background: player.winProbability > 0.5
              ? 'linear-gradient(135deg, #2ecc71, #27ae60)'
              : player.winProbability > 0.2
              ? 'linear-gradient(135deg, #f39c12, #e67e22)'
              : 'linear-gradient(135deg, #e74c3c, #c0392b)',
            border: '1.5px solid rgba(255,255,255,0.3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 8, fontWeight: 900, color: '#fff',
            fontFamily: 'monospace',
            boxShadow: '0 2px 6px rgba(0,0,0,0.5)',
            zIndex: 10, padding: '0 4px',
          }}>
            {Math.round(player.winProbability * 100)}%
          </div>
        )}

        {/* Dealer / blind badge */}
        {badge && (
          <div style={{
            position: 'absolute', top: -4, right: -4,
            width: 18, height: 18, borderRadius: '50%',
            background: isDealer
              ? 'linear-gradient(135deg, #f0c040, #d4af37)'
              : 'linear-gradient(135deg, #555, #333)',
            border: '1.5px solid rgba(255,255,255,0.3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 7, fontWeight: 900, color: isDealer ? '#1a0f00' : '#ccc',
            fontFamily: 'monospace',
            boxShadow: '0 2px 6px rgba(0,0,0,0.5)',
            zIndex: 10,
          }}>
            {badge}
          </div>
        )}
      </div>

      {/* ── Nameplate ── */}
      <div
        className={`nameplate ${isCurrentTurn ? 'nameplate-active' : ''}`}
        style={{
          minWidth: 110, borderRadius: 8, padding: '5px 8px 7px',
          textAlign: 'center', position: 'relative', overflow: 'hidden',
        }}
      >
        {/* Name */}
        <div style={{
          fontSize: 11, fontWeight: 600, color: '#e8e8e8',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          maxWidth: 100, margin: '0 auto',
          fontFamily: 'Inter, sans-serif',
          letterSpacing: '0.01em',
        }}>
          {player.name}
        </div>

        {/* Chip count: table / wallet */}
        <div style={{
          fontSize: 11, fontWeight: 700,
          fontFamily: 'monospace', letterSpacing: '0.02em', marginTop: 2,
        }}>
          <span style={{ color: '#2ecc71' }}>{formatChips(player.chips)}</span>
          {player.walletChips != null && (
            <span style={{ color: 'rgba(255,255,255,0.35)' }}> / {formatChips(player.walletChips)}</span>
          )}
        </div>

        {/* Status badge — below the name card */}
        {(isFolded || isAllIn || isDisconnected) && (
          <div
            key={isDisconnected ? 'dc' : isFolded ? 'fold' : 'allin'}
            className="animate-action-in"
            style={{
              marginTop: 4,
              padding: '2px 10px', borderRadius: 4, fontSize: 9, fontWeight: 900,
              fontFamily: 'monospace', letterSpacing: '0.1em',
              background: isDisconnected
                ? 'linear-gradient(135deg, #7f8c8d, #95a5a6)'
                : isFolded
                ? 'rgba(100,100,100,0.9)'
                : 'linear-gradient(135deg, #c0392b, #e74c3c)',
              color: '#fff',
              boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
              border: '1px solid rgba(255,255,255,0.15)',
              whiteSpace: 'nowrap',
              textAlign: 'center',
            }}
          >
            {isDisconnected ? 'DISCONNECTED' : isFolded ? 'FOLD' : 'ALL IN'}
          </div>
        )}

        {/* Current bet */}
        {player.currentBet > 0 && !isFolded && (
          <div key={player.currentBet} className="animate-action-in" style={{
            position: 'absolute', top: -20, left: '50%', transform: 'translateX(-50%)',
          }}>
            <ChipStack amount={player.currentBet} />
          </div>
        )}

        {/* Active timer bar */}
        {isCurrentTurn && <TimerBar />}
      </div>
    </div>
  );
}
