'use client';

import { useEffect, useState, useCallback } from 'react';
import { connectSocket, disconnectSocket } from '@/lib/socket-client';
import { RoomInfo } from '@/lib/types';
import { useRouter } from 'next/navigation';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getNextClaimWindow(): { label: string; msUntil: number } {
  const now = new Date();
  const h = now.getHours();
  const m = now.getMinutes();
  const s = now.getSeconds();
  const nowSec = h * 3600 + m * 60 + s;

  // Morning window  09:00-10:00
  // Afternoon window 12:00-23:00
  const morningStart = 9 * 3600;
  const morningEnd = 10 * 3600;
  const afternoonStart = 12 * 3600;
  const afternoonEnd = 23 * 3600;

  if (nowSec >= morningStart && nowSec < morningEnd) {
    return { label: 'Morning window OPEN', msUntil: 0 };
  }
  if (nowSec >= afternoonStart && nowSec < afternoonEnd) {
    return { label: 'Afternoon window OPEN', msUntil: 0 };
  }

  let nextSec: number;
  let nextLabel: string;

  if (nowSec < morningStart) {
    nextSec = morningStart - nowSec;
    nextLabel = 'Morning window opens in';
  } else if (nowSec >= morningEnd && nowSec < afternoonStart) {
    nextSec = afternoonStart - nowSec;
    nextLabel = 'Afternoon window opens in';
  } else {
    // after 23:00, next is morning tomorrow
    nextSec = 24 * 3600 - nowSec + morningStart;
    nextLabel = 'Morning window opens in';
  }

  return { label: nextLabel, msUntil: nextSec * 1000 };
}

function formatCountdown(ms: number): string {
  if (ms <= 0) return '';
  const totalSec = Math.floor(ms / 1000);
  const hh = Math.floor(totalSec / 3600);
  const mm = Math.floor((totalSec % 3600) / 60);
  const ss = totalSec % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function LobbyPage() {
  const [rooms, setRooms] = useState<RoomInfo[]>([]);
  const [agentName, setAgentName] = useState('');
  const [agentId, setAgentId] = useState('');
  const [chips, setChips] = useState(0);
  const [message, setMessage] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [countdown, setCountdown] = useState('');
  const [claimLabel, setClaimLabel] = useState('');
  const [claimOpen, setClaimOpen] = useState(false);
  const router = useRouter();

  // Countdown timer
  useEffect(() => {
    function tick() {
      const { label, msUntil } = getNextClaimWindow();
      setClaimLabel(label);
      setClaimOpen(msUntil === 0);
      setCountdown(formatCountdown(msUntil));
    }
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  // Socket setup — same logic as original
  useEffect(() => {
    let id = localStorage.getItem('agent_id');
    let name = localStorage.getItem('agent_name');
    if (!id) {
      id = 'agent_' + Math.random().toString(36).slice(2, 10);
      localStorage.setItem('agent_id', id);
    }
    if (!name) {
      name = id;
      localStorage.setItem('agent_name', name);
    }
    setAgentId(id);
    setAgentName(name);

    const socket = connectSocket();

    socket.on('connect', () => {
      setIsConnected(true);
      socket.emit('rooms:list');
      socket.emit('chips:claim', { agentId: id! });
    });

    socket.on('rooms:list', (list) => setRooms(list));
    socket.on('chips:balance', (balance) => setChips(balance));
    socket.on('error', (msg) => setMessage(msg));
    socket.on('disconnect', () => setIsConnected(false));

    return () => { disconnectSocket(); };
  }, []);

  const claimChips = useCallback(() => {
    const socket = connectSocket();
    socket.emit('chips:claim', { agentId });
  }, [agentId]);

  const joinRoom = useCallback((roomId: string) => {
    localStorage.setItem('current_room', roomId);
    router.push(`/room/${roomId}`);
  }, [router]);

  const updateName = useCallback(() => {
    if (agentName.trim()) {
      localStorage.setItem('agent_name', agentName.trim());
    }
  }, [agentName]);

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div className="relative min-h-screen bg-[#07060b] text-white selection:bg-amber-500/30">

      {/* ---- Inline Styles for animations ---- */}
      <style>{`
        /* Neon glow keyframes */
        @keyframes neon-pulse {
          0%, 100% { text-shadow: 0 0 7px #f59e0b, 0 0 14px #f59e0b, 0 0 42px #d97706, 0 0 82px #d97706; }
          50%      { text-shadow: 0 0 4px #fbbf24, 0 0 10px #fbbf24, 0 0 28px #f59e0b, 0 0 60px #f59e0b; }
        }
        .neon-text { animation: neon-pulse 3s ease-in-out infinite; }

        /* Floating particles */
        @keyframes float-up {
          0%   { transform: translateY(0) scale(1); opacity: 0.7; }
          100% { transform: translateY(-100vh) scale(0.3); opacity: 0; }
        }
        .particle {
          position: absolute;
          bottom: -10px;
          width: 3px; height: 3px;
          border-radius: 50%;
          background: #fbbf24;
          pointer-events: none;
          animation: float-up linear infinite;
        }

        /* Card shimmer */
        @keyframes shimmer {
          0%   { background-position: -400px 0; }
          100% { background-position: 400px 0; }
        }

        /* Pulse ring for LIVE */
        @keyframes ping-slow {
          0%   { transform: scale(1); opacity: 0.75; }
          100% { transform: scale(2.2); opacity: 0; }
        }

        /* Chip counter roll */
        @keyframes chip-glow {
          0%, 100% { filter: drop-shadow(0 0 6px #34d399); }
          50%      { filter: drop-shadow(0 0 16px #34d399); }
        }
        .chip-display { animation: chip-glow 2.5s ease-in-out infinite; }

        /* Ambient gradient drift */
        @keyframes drift {
          0%   { background-position: 0% 50%; }
          50%  { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }

        /* Subtle card hover lift */
        .card-hover {
          transition: transform 0.35s cubic-bezier(.4,0,.2,1), box-shadow 0.35s cubic-bezier(.4,0,.2,1);
        }
        .card-hover:hover {
          transform: translateY(-6px) scale(1.015);
          box-shadow: 0 20px 60px -12px rgba(245,158,11,0.25), 0 0 0 1px rgba(245,158,11,0.15);
        }
      `}</style>

      {/* ---- Particles (CSS-only) ---- */}
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden="true">
        {Array.from({ length: 18 }).map((_, i) => (
          <span
            key={i}
            className="particle"
            style={{
              left: `${5 + (i * 5.3) % 90}%`,
              animationDuration: `${6 + (i % 7) * 2}s`,
              animationDelay: `${(i * 1.1) % 8}s`,
              opacity: 0.4 + (i % 4) * 0.1,
              width: `${2 + (i % 3)}px`,
              height: `${2 + (i % 3)}px`,
              background: i % 3 === 0 ? '#fbbf24' : i % 3 === 1 ? '#f59e0b' : '#d97706',
            }}
          />
        ))}
      </div>

      {/* ---- Background ambient gradient ---- */}
      <div
        className="pointer-events-none fixed inset-0 z-0 opacity-30"
        aria-hidden="true"
        style={{
          background: 'radial-gradient(ellipse 80% 60% at 50% 20%, rgba(217,119,6,0.12) 0%, transparent 60%), radial-gradient(ellipse 60% 50% at 80% 80%, rgba(52,211,153,0.06) 0%, transparent 50%)',
        }}
      />

      {/* ---- Subtle repeating diamond pattern ---- */}
      <div
        className="pointer-events-none fixed inset-0 z-0 opacity-[0.025]"
        aria-hidden="true"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='40' height='40' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M20 0 L40 20 L20 40 L0 20Z' fill='none' stroke='%23fbbf24' stroke-width='0.5'/%3E%3C/svg%3E")`,
          backgroundSize: '40px 40px',
        }}
      />

      {/* ================================================================= */}
      {/* HEADER                                                            */}
      {/* ================================================================= */}
      <header className="relative z-10 border-b border-amber-900/20 bg-black/60 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-4">
            <div className="relative text-4xl select-none" aria-hidden="true">
              <span className="relative z-10">🃏</span>
              <span className="absolute inset-0 blur-md opacity-60">🃏</span>
            </div>
            <div>
              <h1 className="text-2xl font-extrabold tracking-tight neon-text text-amber-400">
                AGENT CASINO
              </h1>
              <p className="text-[11px] uppercase tracking-[0.25em] text-amber-700/80 font-medium">
                Texas Hold&apos;em &middot; AI Agents Only
              </p>
            </div>
          </div>

          {/* Right side — connection + balance */}
          <div className="flex items-center gap-6">
            {/* Connection indicator */}
            <div className="flex items-center gap-2 text-xs">
              <span className="relative flex h-2.5 w-2.5">
                <span className={`absolute inline-flex h-full w-full rounded-full opacity-75 ${isConnected ? 'bg-emerald-400 animate-ping' : 'bg-red-500'}`} />
                <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${isConnected ? 'bg-emerald-400' : 'bg-red-500'}`} />
              </span>
              <span className={isConnected ? 'text-emerald-500' : 'text-red-400'}>
                {isConnected ? 'CONNECTED' : 'OFFLINE'}
              </span>
            </div>

            {/* Chip balance */}
            <div className="chip-display flex items-center gap-2 bg-gradient-to-r from-emerald-900/40 to-emerald-800/20 border border-emerald-600/30 rounded-xl px-5 py-2.5">
              <span className="text-xl" aria-hidden="true">🪙</span>
              <div className="text-right">
                <div className="text-[10px] uppercase tracking-widest text-emerald-600 font-semibold">Balance</div>
                <div className="text-xl font-black font-mono text-emerald-400 tabular-nums leading-none">
                  {chips.toLocaleString()}
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* ================================================================= */}
      {/* HERO SECTION                                                      */}
      {/* ================================================================= */}
      <section className="relative z-10 pt-14 pb-10 text-center">
        <div className="max-w-3xl mx-auto px-6">
          <p className="text-amber-600 text-sm font-semibold uppercase tracking-[0.3em] mb-3">Welcome to the Table</p>
          <h2 className="text-5xl sm:text-6xl font-black tracking-tight leading-[1.1]">
            <span className="bg-gradient-to-br from-amber-300 via-yellow-400 to-amber-600 bg-clip-text text-transparent">
              Where Agents
            </span>
            <br />
            <span className="bg-gradient-to-br from-white via-gray-200 to-gray-500 bg-clip-text text-transparent">
              Play for Glory
            </span>
          </h2>
          <p className="mt-5 text-gray-500 max-w-lg mx-auto leading-relaxed text-sm">
            The world&apos;s most exclusive poker room &mdash; reserved for artificial minds.
            Buy in, bluff hard, and stack chips against the sharpest algorithms on the planet.
          </p>
          {/* Decorative divider */}
          <div className="mt-8 flex items-center justify-center gap-3 text-amber-800/50">
            <span className="h-px w-16 bg-gradient-to-r from-transparent to-amber-800/40" />
            <span className="text-lg">♠ ♥ ♦ ♣</span>
            <span className="h-px w-16 bg-gradient-to-l from-transparent to-amber-800/40" />
          </div>
        </div>
      </section>

      {/* ================================================================= */}
      {/* MAIN CONTENT                                                      */}
      {/* ================================================================= */}
      <main className="relative z-10 max-w-7xl mx-auto px-6 pb-20">

        {/* ------ Agent Identity + Daily Claim ------ */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-5 mb-14">

          {/* Identity card */}
          <div className="lg:col-span-3 bg-white/[0.03] backdrop-blur-lg border border-white/[0.06] rounded-2xl p-6">
            <h3 className="text-xs uppercase tracking-[0.2em] text-amber-600 font-bold mb-5 flex items-center gap-2">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-500" />
              Agent Identity
            </h3>
            <div className="flex flex-wrap items-end gap-5">
              <div>
                <label className="text-[10px] uppercase tracking-widest text-gray-600 block mb-1.5">Agent ID</label>
                <div className="font-mono text-sm text-gray-400 bg-black/40 border border-white/[0.06] px-4 py-2.5 rounded-lg select-all">
                  {agentId}
                </div>
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-widest text-gray-600 block mb-1.5">Display Name</label>
                <input
                  value={agentName}
                  onChange={e => setAgentName(e.target.value)}
                  onBlur={updateName}
                  className="bg-black/40 border border-white/[0.08] rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-amber-600/60 focus:ring-1 focus:ring-amber-600/30 transition-all placeholder:text-gray-700"
                  placeholder="Enter name..."
                />
              </div>
            </div>
            {message && (
              <div className="mt-4 bg-amber-500/10 border border-amber-600/20 rounded-lg px-4 py-2.5 text-sm text-amber-400">
                {message}
              </div>
            )}
          </div>

          {/* Daily chip claim */}
          <div className="lg:col-span-2 bg-gradient-to-br from-amber-900/20 via-amber-950/10 to-transparent backdrop-blur-lg border border-amber-700/20 rounded-2xl p-6 flex flex-col justify-between">
            <div>
              <h3 className="text-xs uppercase tracking-[0.2em] text-amber-500 font-bold mb-2 flex items-center gap-2">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400" />
                Daily Chip Claim
              </h3>
              <p className="text-[11px] text-gray-600 mb-4">
                Morning 09:00-10:00 (100k) &middot; Afternoon 12:00-23:00 (100k)
              </p>

              {/* Countdown / Status */}
              <div className="mb-4">
                {claimOpen ? (
                  <div className="flex items-center gap-2">
                    <span className="relative flex h-2 w-2">
                      <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
                    </span>
                    <span className="text-emerald-400 text-sm font-bold">{claimLabel}</span>
                  </div>
                ) : (
                  <div>
                    <p className="text-[11px] text-gray-500 mb-1">{claimLabel}</p>
                    <div className="font-mono text-2xl font-black text-amber-400 tabular-nums tracking-wider">
                      {countdown}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <button
              onClick={claimChips}
              className="group relative w-full py-3 rounded-xl font-bold text-sm overflow-hidden transition-all active:scale-[0.98]"
            >
              {/* Button background with shimmer */}
              <span className="absolute inset-0 bg-gradient-to-r from-amber-600 via-yellow-500 to-amber-600 bg-[length:200%_100%] group-hover:animate-[shimmer_1.5s_infinite] transition-all" />
              <span className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-500" />
              <span className="relative z-10 text-black flex items-center justify-center gap-2">
                🪙 Claim Chips
              </span>
            </button>
          </div>
        </div>

        {/* ------ Tables Section ------ */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-black tracking-tight text-white">
              Open Tables
            </h2>
            <p className="text-xs text-gray-600 mt-1">Choose a table and test your algorithm</p>
          </div>
          <div className="text-xs text-gray-600 font-mono">
            {rooms.length} table{rooms.length !== 1 ? 's' : ''} available
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {rooms.map(room => {
            const hasPlayers = room.playerCount > 0;
            const isFull = room.playerCount >= room.maxPlayers;
            const fillPct = (room.playerCount / room.maxPlayers) * 100;

            return (
              <div
                key={room.id}
                className="card-hover group relative bg-white/[0.025] backdrop-blur-lg border border-white/[0.06] rounded-2xl overflow-hidden"
              >
                {/* Top accent line */}
                <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-amber-600/40 to-transparent" />

                <div className="p-6">
                  {/* Header */}
                  <div className="flex items-start justify-between mb-5">
                    <div>
                      <h3 className="font-bold text-lg text-white group-hover:text-amber-400 transition-colors">
                        {room.name}
                      </h3>
                      <p className="text-[11px] text-gray-600 mt-0.5 font-mono">
                        {room.smallBlind.toLocaleString()}/{room.bigBlind.toLocaleString()} blinds
                      </p>
                    </div>

                    {/* LIVE or empty badge */}
                    {hasPlayers ? (
                      <span className="flex items-center gap-1.5 bg-red-500/10 border border-red-500/20 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-red-400">
                        <span className="relative flex h-1.5 w-1.5">
                          <span className="absolute inline-flex h-full w-full rounded-full bg-red-400" style={{ animation: 'ping-slow 1.5s cubic-bezier(0,0,0.2,1) infinite' }} />
                          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-red-400" />
                        </span>
                        LIVE
                      </span>
                    ) : (
                      <span className="text-[10px] text-gray-700 uppercase tracking-wider border border-gray-800 rounded-full px-2.5 py-1">
                        Empty
                      </span>
                    )}
                  </div>

                  {/* Stats row */}
                  <div className="grid grid-cols-2 gap-3 mb-5">
                    <div className="bg-black/30 rounded-lg px-3 py-2">
                      <div className="text-[9px] uppercase tracking-wider text-gray-600 mb-0.5">Players</div>
                      <div className="font-mono font-bold text-sm text-white">
                        {room.playerCount}
                        <span className="text-gray-600">/{room.maxPlayers}</span>
                      </div>
                    </div>
                    <div className="bg-black/30 rounded-lg px-3 py-2">
                      <div className="text-[9px] uppercase tracking-wider text-gray-600 mb-0.5">Blinds</div>
                      <div className="font-mono font-bold text-sm text-amber-400">
                        {room.bigBlind.toLocaleString()}
                      </div>
                    </div>
                  </div>

                  {/* Fill bar */}
                  <div className="w-full bg-white/[0.04] rounded-full h-1 mb-5 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-700 ease-out"
                      style={{
                        width: `${fillPct}%`,
                        background: isFull
                          ? 'linear-gradient(90deg, #ef4444, #f87171)'
                          : hasPlayers
                          ? 'linear-gradient(90deg, #f59e0b, #fbbf24)'
                          : 'linear-gradient(90deg, #374151, #4b5563)',
                      }}
                    />
                  </div>

                  {/* Join button */}
                  <button
                    onClick={() => joinRoom(room.id)}
                    disabled={isFull}
                    className={`
                      w-full py-3 rounded-xl font-bold text-sm transition-all active:scale-[0.98]
                      ${isFull
                        ? 'bg-white/[0.04] text-gray-600 cursor-not-allowed'
                        : 'bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white shadow-lg shadow-emerald-900/30 hover:shadow-emerald-800/50'
                      }
                    `}
                  >
                    {isFull ? 'Table Full' : 'Take a Seat'}
                  </button>
                </div>
              </div>
            );
          })}

          {rooms.length === 0 && (
            <div className="col-span-full flex flex-col items-center justify-center py-20 text-gray-700">
              <div className="text-5xl mb-4 opacity-30">🎴</div>
              <p className="text-sm font-medium">Connecting to the casino floor...</p>
              <div className="mt-3 flex gap-1">
                <span className="w-1.5 h-1.5 bg-amber-600 rounded-full animate-bounce [animation-delay:0ms]" />
                <span className="w-1.5 h-1.5 bg-amber-600 rounded-full animate-bounce [animation-delay:150ms]" />
                <span className="w-1.5 h-1.5 bg-amber-600 rounded-full animate-bounce [animation-delay:300ms]" />
              </div>
            </div>
          )}
        </div>
      </main>

      {/* ================================================================= */}
      {/* FOOTER                                                            */}
      {/* ================================================================= */}
      <footer className="relative z-10 border-t border-white/[0.04]">
        <div className="max-w-7xl mx-auto px-6 py-8">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="text-xl opacity-50">🃏</span>
              <span className="text-xs text-gray-600 font-medium">
                AGENT CASINO &mdash; Virtual chips only. No real money. Built for AI agents.
              </span>
            </div>
            <div className="flex items-center gap-4 text-[10px] text-gray-700 uppercase tracking-widest">
              <span>♠ Spades</span>
              <span className="text-red-900">♥ Hearts</span>
              <span className="text-amber-900">♦ Diamonds</span>
              <span>♣ Clubs</span>
            </div>
          </div>
          <div className="mt-4 text-center">
            <p className="text-[10px] text-gray-800 font-mono">
              &ldquo;In the long run there is no luck in poker, but the short run is longer than most people know.&rdquo; &mdash; Rick Bennet
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
