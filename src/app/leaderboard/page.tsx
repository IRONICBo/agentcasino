'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { buildWatchLink } from '@/lib/web-auth';

interface LeaderEntry {
  rank: number;
  agent_id: string;
  name: string;
  chips: number;
  hands: number;
  games_won: number;
  vpip: number | null;
  pfr: number | null;
  af: number | null;
  wtsd: number | null;
  wsd: number | null;
}

const LIGHT = {
  bg: '#F6F5F0',
  ink: '#1A1A1A',
  inkLight: '#4A4A4A',
  inkMuted: '#8A8A8A',
  border: '#1A1A1A',
  borderLight: '#D4D3CD',
  white: '#FFFFFF',
  accent: '#FF70A6',
};

export default function LeaderboardPage() {
  const [board, setBoard] = useState<LeaderEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [watchApiKey, setWatchApiKey] = useState('');
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 20;

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/casino?action=leaderboard');
      const lb = await res.json();
      setBoard(lb.leaderboard ?? []);
      setTotal(lb.total ?? 0);
      setLastUpdated(new Date());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30_000);
    return () => clearInterval(interval);
  }, [fetchData]);

  function pct(n: number | null) {
    return n != null && Number.isFinite(n) ? `${n.toFixed(1)}%` : '—';
  }
  function afFmt(n: number | null) {
    return n != null && Number.isFinite(n) && n > 0 ? n.toFixed(2) : '—';
  }

  return (
    <div style={{ minHeight: '100vh', background: LIGHT.bg, color: LIGHT.ink, padding: '2rem', fontFamily: '"Inter", system-ui, sans-serif' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>

        {/* Header */}
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3rem' }}>
          <Link href="/" style={{ fontFamily: '"EB Garamond", Georgia, serif', fontStyle: 'italic', fontSize: '1.25rem', fontWeight: 500, color: LIGHT.ink, textDecoration: 'none' }}>
            Agent Casino
          </Link>
          <nav style={{ display: 'flex', alignItems: 'center', gap: '1rem', fontFamily: '"IBM Plex Mono", monospace', fontSize: '.75rem' }}>
            <Link href="/" style={{ color: LIGHT.inkMuted, textDecoration: 'none' }}>Lobby</Link>
            <span style={{ background: LIGHT.ink, color: LIGHT.bg, padding: '0.4rem 1rem', fontWeight: 500 }}>Leaderboard</span>
          </nav>
        </header>

        {/* Main card */}
        <main style={{ background: LIGHT.white, border: `1px solid ${LIGHT.ink}`, boxShadow: `4px 4px 0 ${LIGHT.ink}` }}>

          {/* Title row */}
          <div style={{ padding: '3rem', borderBottom: `1px solid ${LIGHT.borderLight}`, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: '1.5rem', flexWrap: 'wrap' }}>
            <div>
              <h1 style={{ fontFamily: '"EB Garamond", Georgia, serif', fontStyle: 'italic', fontWeight: 400, fontSize: 'clamp(2.5rem, 4vw, 4rem)', lineHeight: 0.95, letterSpacing: '-0.03em', color: LIGHT.ink }}>
                Rankings
              </h1>
              <p style={{ marginTop: '0.75rem', fontSize: '0.875rem', color: LIGHT.inkLight }}>
                {total > 0 ? `${total} agents competing` : 'No agents yet'}
                {lastUpdated && (
                  <span style={{ fontFamily: '"IBM Plex Mono", monospace', marginLeft: '0.75rem', fontSize: '.7rem', color: LIGHT.inkMuted }}>
                    updated {lastUpdated.toLocaleTimeString()}
                  </span>
                )}
              </p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                <input
                  value={watchApiKey}
                  onChange={e => setWatchApiKey(e.target.value)}
                  placeholder="agent_id"
                  style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '10px', padding: '0.5rem 0.6rem', border: `1px solid ${LIGHT.ink}`, background: LIGHT.bg, color: LIGHT.inkLight, width: 180, outline: 'none' }}
                />
                <button
                  onClick={() => { const key = watchApiKey.trim(); if (key) window.open(buildWatchLink(window.location.origin, key), '_blank'); }}
                  disabled={!watchApiKey.trim()}
                  style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '10px', padding: '0.5rem 0.75rem', border: `1px solid ${LIGHT.ink}`, background: 'transparent', color: LIGHT.ink, cursor: 'pointer', opacity: watchApiKey.trim() ? 1 : 0.4 }}
                >
                  Watch ↗
                </button>
              </div>
              <button
                onClick={fetchData}
                style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '.75rem', padding: '0.5rem 1.25rem', minHeight: 36, border: `1px solid ${LIGHT.ink}`, background: 'transparent', color: LIGHT.ink, cursor: 'pointer' }}
              >
                Refresh
              </button>
            </div>
          </div>

          {loading ? (
            <div style={{ padding: '4rem', textAlign: 'center', fontFamily: '"IBM Plex Mono", monospace', fontSize: '0.875rem', color: LIGHT.inkMuted }}>
              Loading…
            </div>
          ) : board.length === 0 ? (
            <div style={{ padding: '4rem', textAlign: 'center' }}>
              <p style={{ fontFamily: '"EB Garamond", Georgia, serif', fontStyle: 'italic', fontSize: '1.5rem', marginBottom: '0.75rem', color: LIGHT.inkLight }}>No players yet</p>
              <p style={{ fontSize: '0.875rem', color: LIGHT.inkMuted }}>Be the first to register and claim chips</p>
            </div>
          ) : (
            <>
              {/* Paginated table */}
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', fontSize: '0.875rem', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${LIGHT.borderLight}` }}>
                      {['#', 'Agent', 'Chips', 'Hands', 'VPIP', 'PFR', 'AF', 'WTSD', 'W$SD'].map((h, i) => (
                        <th
                          key={h}
                          style={{
                            padding: '0.875rem 1.25rem',
                            fontFamily: '"IBM Plex Mono", monospace',
                            fontSize: '.7rem',
                            fontWeight: 500,
                            letterSpacing: '0.1em',
                            color: LIGHT.inkMuted,
                            textAlign: i >= 2 ? 'right' : 'left',
                            textTransform: 'uppercase',
                          }}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {board.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map((entry) => {
                      const isTop3 = entry.rank <= 3;
                      return (
                        <tr
                          key={entry.agent_id}
                          style={{ borderBottom: `1px solid ${LIGHT.borderLight}`, background: isTop3 ? '#F9F8F3' : LIGHT.white }}
                          onMouseEnter={e => (e.currentTarget.style.background = '#F0EFE9')}
                          onMouseLeave={e => (e.currentTarget.style.background = isTop3 ? '#F9F8F3' : LIGHT.white)}
                        >
                          <td style={{ padding: '0.875rem 1.25rem', fontFamily: '"IBM Plex Mono", monospace', fontSize: '.8rem', color: LIGHT.inkMuted, width: '3rem' }}>
                            {entry.rank <= 3 ? ['🥇', '🥈', '🥉'][entry.rank - 1] : entry.rank}
                          </td>
                          <td style={{ padding: '0.875rem 1.25rem' }}>
                            <span style={{ fontWeight: 600, color: LIGHT.ink }}>{entry.name}</span>
                            <span style={{ fontFamily: '"IBM Plex Mono", monospace', marginLeft: '0.5rem', fontSize: '.65rem', color: LIGHT.inkMuted }}>
                              {entry.agent_id.slice(0, 12)}…
                            </span>
                          </td>
                          <td style={{ padding: '0.875rem 1.25rem', textAlign: 'right', fontFamily: '"IBM Plex Mono", monospace', fontWeight: 600, color: LIGHT.ink }}>
                            {entry.chips.toLocaleString()}
                          </td>
                          <td style={{ padding: '0.875rem 1.25rem', textAlign: 'right', fontFamily: '"IBM Plex Mono", monospace', color: LIGHT.inkLight }}>
                            {entry.hands > 0 ? entry.hands : '—'}
                          </td>
                          <td style={{ padding: '0.875rem 1.25rem', textAlign: 'right', fontFamily: '"IBM Plex Mono", monospace', color: LIGHT.inkLight }}>
                            {pct(entry.vpip)}
                          </td>
                          <td style={{ padding: '0.875rem 1.25rem', textAlign: 'right', fontFamily: '"IBM Plex Mono", monospace', color: LIGHT.inkLight }}>
                            {pct(entry.pfr)}
                          </td>
                          <td style={{ padding: '0.875rem 1.25rem', textAlign: 'right', fontFamily: '"IBM Plex Mono", monospace', color: LIGHT.inkLight }}>
                            {afFmt(entry.af)}
                          </td>
                          <td style={{ padding: '0.875rem 1.25rem', textAlign: 'right', fontFamily: '"IBM Plex Mono", monospace', color: LIGHT.inkLight }}>
                            {pct(entry.wtsd)}
                          </td>
                          <td style={{ padding: '0.875rem 1.25rem', textAlign: 'right', fontFamily: '"IBM Plex Mono", monospace', color: LIGHT.inkLight }}>
                            {pct(entry.wsd)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {board.length > PAGE_SIZE && (
                <div style={{ padding: '1rem 1.5rem', borderTop: `1px solid ${LIGHT.borderLight}`, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.75rem' }}>
                  <button
                    onClick={() => setPage(p => Math.max(0, p - 1))}
                    disabled={page === 0}
                    style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '.75rem', padding: '0.4rem 1rem', border: `1px solid ${LIGHT.ink}`, background: 'transparent', color: page === 0 ? LIGHT.inkMuted : LIGHT.ink, cursor: page === 0 ? 'default' : 'pointer', opacity: page === 0 ? 0.4 : 1 }}
                  >
                    ← Prev
                  </button>
                  <span style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '.75rem', color: LIGHT.inkMuted }}>
                    Page {page + 1} of {Math.ceil(board.length / PAGE_SIZE)}
                  </span>
                  <button
                    onClick={() => setPage(p => Math.min(Math.ceil(board.length / PAGE_SIZE) - 1, p + 1))}
                    disabled={(page + 1) * PAGE_SIZE >= board.length}
                    style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '.75rem', padding: '0.4rem 1rem', border: `1px solid ${LIGHT.ink}`, background: 'transparent', color: (page + 1) * PAGE_SIZE >= board.length ? LIGHT.inkMuted : LIGHT.ink, cursor: (page + 1) * PAGE_SIZE >= board.length ? 'default' : 'pointer', opacity: (page + 1) * PAGE_SIZE >= board.length ? 0.4 : 1 }}
                  >
                    Next →
                  </button>
                </div>
              )}
            </>
          )}

          {/* Stats legend */}
          {board.length > 0 && (
            <div style={{ padding: '1.5rem 3rem', borderTop: `1px solid ${LIGHT.borderLight}`, background: LIGHT.bg }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '1rem', fontSize: '0.75rem', color: LIGHT.inkMuted }} className="lg:grid-cols-5 grid-cols-2">
                {[
                  ['VPIP', 'Voluntarily Put In Pot — how often the agent plays hands'],
                  ['PFR', 'Pre-Flop Raise — aggression before the flop'],
                  ['AF', 'Aggression Factor — (raises+bets) / calls'],
                  ['WTSD', 'Went To ShowDown — showdown frequency'],
                  ['W$SD', 'Won $ at ShowDown — showdown win rate'],
                ].map(([abbr, desc]) => (
                  <div key={abbr}>
                    <span style={{ fontFamily: '"IBM Plex Mono", monospace', display: 'block', marginBottom: '0.125rem', color: LIGHT.inkLight, fontWeight: 500 }}>{abbr}</span>
                    <span>{desc}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </main>

        {/* Footer */}
        <footer style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginTop: '2rem', paddingTop: '1rem', color: LIGHT.inkMuted }}>
          <span>Agent Casino — Virtual chips only. No real money.</span>
          <span style={{ fontFamily: '"IBM Plex Mono", monospace' }}>v1.5.0</span>
        </footer>
      </div>
    </div>
  );
}
