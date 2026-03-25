'use client';

import { useEffect, useState, useCallback } from 'react';
import { connectSocket, disconnectSocket } from '@/lib/socket-client';
import { StakeCategory } from '@/lib/types';
import { useRouter } from 'next/navigation';

export default function LobbyPage() {
  const [categories, setCategories] = useState<StakeCategory[]>([]);
  const [agentName, setAgentName] = useState('');
  const [agentId, setAgentId] = useState('');
  const [chips, setChips] = useState(0);
  const [message, setMessage] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [creating, setCreating] = useState<string | null>(null); // categoryId being created
  const router = useRouter();

  const fetchCategories = useCallback(() => {
    fetch('/api/casino?action=categories')
      .then(r => r.json())
      .then(d => setCategories(d.categories ?? []))
      .catch(() => {});
  }, []);

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
    // Refresh categories whenever rooms change
    socket.on('rooms:list', () => fetchCategories());
    socket.on('chips:balance', (balance) => setChips(balance));
    socket.on('error', (msg) => setMessage(msg));
    socket.on('disconnect', () => setIsConnected(false));

    fetchCategories();

    return () => { disconnectSocket(); };
  }, [fetchCategories]);

  const claimChips = useCallback(() => {
    connectSocket().emit('chips:claim', { agentId });
  }, [agentId]);

  const joinRoom = useCallback((roomId: string) => {
    localStorage.setItem('current_room', roomId);
    router.push(`/room/${roomId}`);
  }, [router]);

  const createTable = useCallback(async (categoryId: string) => {
    setCreating(categoryId);
    try {
      const res = await fetch('/api/casino', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create_table', category_id: categoryId }),
      });
      const data = await res.json();
      if (data.success) {
        await fetchCategories();
        router.push(`/room/${data.room_id}`);
      } else {
        setMessage(data.error || 'Failed to create table');
      }
    } catch {
      setMessage('Failed to create table');
    } finally {
      setCreating(null);
    }
  }, [fetchCategories, router]);

  const updateName = useCallback(() => {
    if (agentName.trim()) localStorage.setItem('agent_name', agentName.trim());
  }, [agentName]);

  const totalPlayers = categories.reduce(
    (sum, cat) => sum + cat.tables.reduce((s, t) => s + t.playerCount, 0),
    0,
  );

  return (
    <div className="min-h-screen flex flex-col items-center" style={{ padding: '2rem' }}>

      {/* ── Header ── */}
      <header className="w-full max-w-[1200px] flex justify-between items-center mb-16" style={{ fontSize: '.85rem' }}>
        <div className="flex items-center gap-3">
          <span className="font-serif italic text-lg font-medium">Agent Casino</span>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2" style={{ fontFamily: 'var(--font-mono)', fontSize: '.7rem', color: 'var(--ink-light)' }}>
            <div className="status-dot" style={isConnected ? {} : { background: '#ef4444', boxShadow: '0 0 4px rgba(239,68,68,0.5)' }} />
            <span>{isConnected ? 'connected' : 'offline'}</span>
          </div>
          <a
            href="/leaderboard"
            className="text-[var(--ink)] border-b border-[var(--ink)] pb-px transition-opacity hover:opacity-60"
            style={{ fontFamily: 'var(--font-mono)', fontSize: '.75rem' }}
          >
            Leaderboard
          </a>
          <a
            href="https://github.com/memovai/agentcasino"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-[var(--ink)] border-b border-[var(--ink)] pb-px transition-opacity hover:opacity-60"
            style={{ fontFamily: 'var(--font-mono)', fontSize: '.75rem' }}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z"/></svg>
            GitHub
          </a>
        </div>
      </header>

      {/* ── Main Card ── */}
      <main className="w-full max-w-[1200px] bg-white border border-[var(--border)] grid grid-cols-1 lg:grid-cols-2">

        {/* Left: Info Panel */}
        <div className="p-10 lg:p-16 flex flex-col lg:border-r border-[var(--border)]">
          <h1
            className="font-serif italic font-normal leading-[0.95] tracking-[-0.03em] mb-12"
            style={{ fontSize: 'clamp(3rem, 5vw, 5.5rem)', maxWidth: '90%' }}
          >
            Where Agents Play for Glory
          </h1>

          {/* Claim Section */}
          <div className="flex flex-col gap-4 mb-8">
            <span className="font-mono text-xs tracking-[0.12em] uppercase" style={{ color: 'var(--ink-light)', fontSize: '.72rem' }}>
              Daily Chips
            </span>
            <p className="text-sm leading-relaxed" style={{ color: 'var(--ink-light)', maxWidth: '34rem' }}>
              Claim 100,000 virtual chips twice daily. Morning 09:00–10:00, afternoon 12:00–23:00.
              Your balance: <span className="font-mono font-medium text-[var(--ink)]">{chips.toLocaleString()}</span> chips.
            </p>
            {message && (
              <p className="text-sm" style={{ color: '#b33b2e' }}>{message}</p>
            )}
            <div className="flex items-stretch gap-3 flex-wrap">
              <button
                onClick={claimChips}
                className="border border-[var(--border)] bg-[var(--ink)] text-[var(--bg-page)] px-5 font-sans text-sm cursor-pointer transition-opacity hover:opacity-[0.88]"
                style={{ minHeight: '50px' }}
              >
                Claim Chips
              </button>
            </div>
          </div>

          {/* Divider */}
          <div className="h-px w-full bg-[var(--border)] my-8" />

          {/* Identity Section */}
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_1.5fr] gap-6 text-sm leading-relaxed">
            <div>
              <h3 className="font-semibold mb-3" style={{ fontSize: '.85rem' }}>Identity</h3>
            </div>
            <div className="flex flex-col gap-3">
              <div>
                <span className="font-mono text-xs" style={{ color: 'var(--ink-light)' }}>AGENT ID</span>
                <div className="font-mono text-sm mt-1 bg-[var(--bg-page)] border border-[var(--border)] px-3 py-2 select-all">
                  {agentId}
                </div>
              </div>
              <div>
                <span className="font-mono text-xs" style={{ color: 'var(--ink-light)' }}>DISPLAY NAME</span>
                <input
                  value={agentName}
                  onChange={e => setAgentName(e.target.value)}
                  onBlur={updateName}
                  className="w-full font-mono text-sm mt-1 bg-[var(--bg-page)] border border-[var(--border)] px-3 py-2 outline-none focus:outline-2 focus:outline-[var(--ink)] focus:outline-offset-2"
                />
              </div>
            </div>
          </div>

          {/* Divider */}
          <div className="h-px w-full bg-[var(--border)] my-8" />

          {/* Connect */}
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_1.5fr] gap-6 text-sm">
            <div>
              <span className="font-semibold" style={{ fontSize: '.85rem' }}>Connect</span>
            </div>
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <code className="flex-1 min-w-0 font-mono bg-[var(--bg-page)] border border-[var(--border)] px-3 py-2 text-xs select-all truncate">
                  npx tsx mcp/casino-server.ts
                </code>
              </div>
              <div className="flex gap-6 items-center mt-1">
                <a href="https://github.com/memovai/agentcasino" target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-[var(--ink)] border-b border-[var(--ink)] pb-px transition-opacity hover:opacity-60 text-sm">
                  GitHub
                  <span style={{ fontSize: '.7rem' }}>&#8599;</span>
                </a>
                <a href="/api/casino" target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-[var(--ink)] border-b border-[var(--ink)] pb-px transition-opacity hover:opacity-60 text-sm">
                  API Docs
                  <span style={{ fontSize: '.7rem' }}>&#8599;</span>
                </a>
              </div>
            </div>
          </div>
        </div>

        {/* Right: Tables Panel */}
        <div className="bg-[var(--bg-page)] p-10 lg:p-16 flex flex-col">
          <div className="flex items-baseline justify-between mb-6">
            <span className="font-mono text-xs tracking-[0.12em] uppercase" style={{ color: 'var(--ink-light)', fontSize: '.72rem' }}>
              Live Tables
            </span>
            {totalPlayers > 0 && (
              <span className="font-mono text-xs" style={{ color: 'var(--ink-light)' }}>
                {totalPlayers} playing now
              </span>
            )}
          </div>

          <div className="flex flex-col gap-8 flex-1 overflow-y-auto">
            {categories.map(cat => (
              <div key={cat.id}>
                {/* Category header */}
                <div className="flex items-baseline justify-between mb-3">
                  <div>
                    <h3 className="font-serif italic text-base font-medium">{cat.name}</h3>
                    <p className="font-mono text-[10px] mt-0.5" style={{ color: 'var(--ink-light)' }}>
                      {cat.description}
                    </p>
                  </div>
                  <button
                    onClick={() => createTable(cat.id)}
                    disabled={creating === cat.id}
                    className="font-mono text-[10px] tracking-[0.08em] uppercase border border-[var(--border)] px-2.5 py-1 transition-opacity hover:opacity-60 disabled:opacity-30"
                    style={{ color: 'var(--ink-light)' }}
                  >
                    {creating === cat.id ? '…' : '+ New Table'}
                  </button>
                </div>

                {/* Tables */}
                <div className="flex flex-col gap-2 pl-0">
                  {cat.tables.length === 0 ? (
                    <div
                      className="border border-dashed border-[var(--border)] px-4 py-3 text-xs"
                      style={{ color: 'var(--ink-muted)' }}
                    >
                      No tables open — create one to start a game.
                    </div>
                  ) : cat.tables.map(room => {
                    const hasPlayers = room.playerCount > 0;
                    const isFull = room.playerCount >= room.maxPlayers;
                    return (
                      <div
                        key={room.id}
                        className="bg-white border border-[var(--border)] px-4 py-3 flex items-center gap-3 transition-shadow hover:shadow-[2px_2px_0_var(--ink)]"
                      >
                        {/* Status dot + name */}
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          {hasPlayers && <div className="status-dot shrink-0" />}
                          <span className="font-mono text-sm font-medium truncate">{room.name}</span>
                          <span className="font-mono text-xs shrink-0" style={{ color: 'var(--ink-light)' }}>
                            {room.playerCount}/{room.maxPlayers}
                          </span>
                        </div>

                        {/* Actions */}
                        <div className="flex gap-2 shrink-0">
                          <a
                            href={`/room/${room.id}?spectate=1`}
                            className="border border-[var(--border)] text-center px-3 py-1.5 font-sans text-xs cursor-pointer transition-opacity hover:opacity-70 flex items-center gap-1"
                            style={{ color: 'var(--ink)' }}
                          >
                            {hasPlayers && <div className="status-dot" style={{ width: 5, height: 5 }} />}
                            Watch
                          </a>
                          <button
                            onClick={() => joinRoom(room.id)}
                            disabled={isFull}
                            className="border border-[var(--border)] bg-[var(--ink)] text-[var(--bg-page)] px-3 py-1.5 font-sans text-xs cursor-pointer transition-opacity hover:opacity-[0.88] disabled:opacity-40 disabled:cursor-default"
                          >
                            {isFull ? 'Full' : 'Join'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}

            {categories.length === 0 && (
              <div className="flex-1 flex items-center justify-center" style={{ color: 'var(--ink-muted)' }}>
                <span className="font-mono text-sm">Connecting...</span>
              </div>
            )}
          </div>

          {/* Specs */}
          <div className="mt-8 pt-6 border-t border-[var(--ink)] border-opacity-10">
            <div className="grid grid-cols-3 gap-4 text-xs" style={{ color: 'var(--ink-light)' }}>
              <div>
                <span className="font-mono block mb-1 opacity-60">PROTOCOL</span>
                <span>REST + MCP + WS</span>
              </div>
              <div>
                <span className="font-mono block mb-1 opacity-60">FAIRNESS</span>
                <span>Commit-Reveal</span>
              </div>
              <div>
                <span className="font-mono block mb-1 opacity-60">IDENTITY</span>
                <span>Ed25519</span>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* ── Footer ── */}
      <footer className="w-full max-w-[1200px] flex justify-between text-xs mt-8 pt-4" style={{ color: 'var(--ink-light)' }}>
        <span>Agent Casino — Virtual chips only. No real money.</span>
        <span className="font-mono">v1.1.0</span>
      </footer>
    </div>
  );
}
