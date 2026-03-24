'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { connectSocket, disconnectSocket } from '@/lib/socket-client';
import { ClientGameState, ChatMessage, PlayerAction, RoomInfo } from '@/lib/types';
import { PokerTable } from '@/components/PokerTable';
import { ChatBox } from '@/components/ChatBox';

export default function RoomPage() {
  const params = useParams();
  const router = useRouter();
  const roomId = params.id as string;

  const [gameState, setGameState] = useState<ClientGameState | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [agentId, setAgentId] = useState('');
  const [agentName, setAgentName] = useState('');
  const [chips, setChips] = useState(0);
  const [joined, setJoined] = useState(false);
  const [buyIn, setBuyIn] = useState(50000);
  const [error, setError] = useState('');
  const [errorVisible, setErrorVisible] = useState(false);

  useEffect(() => {
    const id = localStorage.getItem('agent_id') || 'agent_' + Math.random().toString(36).slice(2, 10);
    const name = localStorage.getItem('agent_name') || id;
    localStorage.setItem('agent_id', id);
    setAgentId(id);
    setAgentName(name);

    const socket = connectSocket();

    socket.on('connect', () => {
      socket.emit('chips:claim', { agentId: id });
    });

    socket.on('game:state', (state) => {
      setGameState(state);
    });

    socket.on('chat:message', (msg) => {
      setMessages(prev => [...prev.slice(-100), msg]);
    });

    socket.on('chips:balance', (balance) => {
      setChips(balance);
    });

    socket.on('game:winners', (winners) => {
      // Winners are shown via game state
    });

    socket.on('error', (msg) => {
      setError(msg);
      setErrorVisible(true);
      setTimeout(() => {
        setErrorVisible(false);
        setTimeout(() => setError(''), 350);
      }, 4500);
    });

    return () => {
      if (joined) {
        socket.emit('room:leave', { roomId });
      }
      disconnectSocket();
    };
  }, [roomId]);

  const handleJoin = useCallback(() => {
    const socket = connectSocket();
    socket.emit('room:join', { roomId, agentId, buyIn });
    setJoined(true);
  }, [roomId, agentId, buyIn]);

  const handleAction = useCallback((action: PlayerAction, amount?: number) => {
    const socket = connectSocket();
    socket.emit('game:action', { roomId, action, amount });
  }, [roomId]);

  const handleChat = useCallback((message: string) => {
    const socket = connectSocket();
    socket.emit('chat:message', { roomId, message });
  }, [roomId]);

  const handleLeave = useCallback(() => {
    const socket = connectSocket();
    socket.emit('room:leave', { roomId });
    router.push('/');
  }, [roomId, router]);

  return (
    <div className="min-h-screen">
      {/* ── Top Bar: clean minimal header like reference ── */}
      <header className="sticky top-0 z-50 border-b border-gray-800/60 bg-[#111]/90 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-3 text-sm">
            <button
              onClick={handleLeave}
              className="text-emerald-500 hover:text-emerald-400 transition-colors font-medium"
            >
              &larr; Lobby
            </button>
            <span className="text-gray-600">|</span>
            <span className="text-gray-400 font-mono text-xs">
              Hand: {gameState?.id?.slice(0, 8) || '...'}...
            </span>
          </div>

          <div className="flex items-center gap-4">
            <span className="text-xs text-gray-500">{agentName}</span>
            <span className="font-mono text-xs text-emerald-400">${chips.toLocaleString()}</span>
            {gameState && (
              <span className="text-[10px] font-bold text-emerald-400 border border-emerald-600/40 rounded px-2 py-0.5 uppercase tracking-wider">
                {gameState.phase === 'preflop' ? 'PRE-FLOP' : gameState.phase.toUpperCase()}
              </span>
            )}
          </div>
        </div>
      </header>

      {/* ── Error Toast ── */}
      {error && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[100]">
          <div
            className={`
              glass px-5 py-3 rounded-xl border border-red-500/20 shadow-lg shadow-red-500/10
              flex items-center gap-3 max-w-md
              ${errorVisible ? 'animate-toast-in' : 'opacity-0 translate-y-[-16px] scale-95 transition-all duration-300'}
            `}
          >
            <div className="w-2 h-2 rounded-full bg-red-400 shrink-0" />
            <span className="text-sm text-red-300">{error}</span>
          </div>
        </div>
      )}

      <main className="max-w-7xl mx-auto px-4 py-6">
        {!joined ? (
          /* ── Buy-In Screen: VIP room entrance ── */
          <div className="flex items-center justify-center min-h-[75vh]">
            <div className="w-full max-w-lg animate-scale-in">
              {/* Ambient glow behind card */}
              <div className="relative">
                <div className="absolute -inset-4 bg-gradient-to-b from-amber-500/10 via-transparent to-emerald-500/5 rounded-3xl blur-2xl pointer-events-none" />

                <div className="relative glass-gold rounded-2xl overflow-hidden animate-neon-border">
                  {/* Top accent line */}
                  <div className="h-px bg-gradient-to-r from-transparent via-amber-400/40 to-transparent" />

                  <div className="p-10 text-center">
                    {/* Icon */}
                    <div className="animate-float mb-6">
                      <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-500/20 to-amber-600/5 border border-amber-500/10">
                        <span className="text-3xl">🃏</span>
                      </div>
                    </div>

                    {/* Title */}
                    <h2 className="text-3xl font-bold text-shimmer mb-2 tracking-tight">
                      Take Your Seat
                    </h2>
                    <p className="text-gray-500 text-sm mb-10">
                      Choose your buy-in and enter the game
                    </p>

                    {/* Buy-in slider */}
                    <div className="mb-10">
                      <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-[0.15em] block mb-4">
                        Buy-in Amount
                      </label>
                      <input
                        type="range"
                        min={20000}
                        max={Math.min(200000, chips)}
                        step={10000}
                        value={buyIn}
                        onChange={e => setBuyIn(Number(e.target.value))}
                        className="w-full mb-5"
                      />

                      {/* Amount display */}
                      <div className="relative inline-block">
                        <div className="text-4xl font-mono font-bold text-emerald-400 tracking-tight animate-glow-pulse rounded-xl px-6 py-2">
                          {buyIn.toLocaleString()}
                        </div>
                      </div>

                      <div className="text-xs text-gray-600 mt-3 flex items-center justify-center gap-1.5">
                        <span className="inline-block w-1 h-1 rounded-full bg-gray-600" />
                        Balance: {chips.toLocaleString()} chips
                      </div>
                    </div>

                    {/* CTA Button */}
                    <button
                      onClick={handleJoin}
                      disabled={chips < buyIn}
                      className={`
                        w-full py-4 rounded-xl font-bold text-lg tracking-wide transition-all duration-300
                        ${chips < buyIn
                          ? 'bg-gray-800/60 text-gray-600 border border-gray-700/50 cursor-not-allowed'
                          : 'bg-gradient-to-r from-emerald-600 via-emerald-500 to-teal-500 hover:from-emerald-500 hover:via-emerald-400 hover:to-teal-400 text-white shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/30 hover:scale-[1.02] active:scale-[0.98]'
                        }
                      `}
                    >
                      {chips < buyIn ? 'Insufficient Chips' : 'Enter the Game'}
                    </button>

                    {/* Decorative bottom */}
                    <div className="mt-8 flex items-center justify-center gap-3 text-gray-700">
                      <div className="w-8 h-px bg-gradient-to-r from-transparent to-gray-700" />
                      <span className="text-[10px] uppercase tracking-[0.2em]">Texas Hold&apos;em</span>
                      <div className="w-8 h-px bg-gradient-to-l from-transparent to-gray-700" />
                    </div>
                  </div>

                  {/* Bottom accent line */}
                  <div className="h-px bg-gradient-to-r from-transparent via-emerald-400/20 to-transparent" />
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* ── Game Room: Poker stream layout ── */
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6 animate-fade-in-up">
            {/* Table area */}
            <div className="pt-6 pb-24">
              {gameState ? (
                <PokerTable
                  gameState={gameState}
                  myAgentId={agentId}
                  onAction={handleAction}
                />
              ) : (
                <div className="flex items-center justify-center h-96">
                  <div className="text-center animate-fade-in-up">
                    <div className="animate-float mb-6">
                      <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl glass-gold">
                        <span className="text-4xl">🃏</span>
                      </div>
                    </div>
                    <p className="text-gray-400 font-medium mb-2">Waiting for players...</p>
                    <p className="text-xs text-gray-600">
                      Need at least 2 players to start dealing
                    </p>
                    <div className="mt-6 flex justify-center gap-1">
                      {[0, 1, 2].map(i => (
                        <div
                          key={i}
                          className="w-1.5 h-1.5 rounded-full bg-amber-400/40"
                          style={{
                            animation: `float 1.5s ease-in-out ${i * 0.3}s infinite`,
                          }}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Chat sidebar */}
            <div className="h-[600px] lg:h-[calc(100vh-8rem)]">
              <ChatBox messages={messages} onSend={handleChat} />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
