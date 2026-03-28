'use client';

import { useEffect, useState } from 'react';

interface GameRecord {
  game_id:      string;
  room_name:    string;
  big_blind:    number;
  pot:          number;
  winning_hand: string | null;
  is_winner:    boolean;
  profit:       number;
  chips_end:    number;
  ended_at:     string;
}

interface AgentPanelProps {
  agentId:   string;
  agentName: string;
  secretKey:    string;
  chips:     number;
}

function ProfitBadge({ profit }: { profit: number }) {
  const pos = profit > 0;
  return (
    <span className={`font-mono text-[10px] ${pos ? 'text-emerald-400' : 'text-red-400'}`}>
      {pos ? '+' : ''}{profit.toLocaleString()}
    </span>
  );
}

export function AgentPanel({ agentId, agentName, secretKey, chips }: AgentPanelProps) {
  const [history, setHistory] = useState<GameRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!agentId) return;
    const headers: HeadersInit = secretKey
      ? { 'Authorization': `Bearer ${secretKey}` }
      : {};
    fetch(`/api/casino?action=history&agent_id=${agentId}&limit=20`, { headers })
      .then(r => r.json())
      .then(d => { setHistory(d.history ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [agentId, secretKey]);

  const wins    = history.filter(h => h.is_winner).length;
  const winRate = history.length > 0 ? Math.round(wins / history.length * 100) : 0;
  const totalProfit = history.reduce((s, h) => s + h.profit, 0);

  return (
    <div
      className="flex flex-col h-full rounded-2xl overflow-hidden text-xs"
      style={{
        background: 'linear-gradient(180deg, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0.75) 100%)',
        backdropFilter: 'blur(16px)',
        border: '1px solid rgba(255,255,255,0.06)',
      }}
    >
      {/* Header */}
      <div className="px-4 py-3 border-b border-white/5">
        <div className="flex items-center justify-between mb-1">
          <span className="font-bold text-white truncate max-w-[140px]">{agentName}</span>
          <span className="font-mono text-emerald-400 text-[11px]">{chips.toLocaleString()} chips</span>
        </div>
        <div className="font-mono text-[9px] text-gray-500 truncate">{agentId}</div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 border-b border-white/5">
        {[
          { label: 'GAMES',    value: history.length },
          { label: 'WIN RATE', value: `${winRate}%` },
          { label: 'PROFIT',   value: totalProfit > 0 ? `+${(totalProfit/1000).toFixed(0)}k` : `${(totalProfit/1000).toFixed(0)}k`, color: totalProfit >= 0 ? 'text-emerald-400' : 'text-red-400' },
        ].map(s => (
          <div key={s.label} className="flex flex-col items-center py-2.5 gap-0.5">
            <span className={`font-mono font-bold text-sm ${s.color ?? 'text-white'}`}>{s.value}</span>
            <span className="font-mono text-[8px] text-gray-500 tracking-wider">{s.label}</span>
          </div>
        ))}
      </div>

      {/* History list */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-3 py-2 text-[9px] font-mono text-gray-500 tracking-wider uppercase">
          Recent Games
        </div>
        {loading && (
          <div className="px-3 py-4 text-center text-gray-600 text-[10px]">Loading…</div>
        )}
        {!loading && history.length === 0 && (
          <div className="px-3 py-4 text-center text-gray-600 text-[10px] italic">No games yet</div>
        )}
        {history.map((g, i) => (
          <div key={g.game_id ?? i} className="px-3 py-2 border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors">
            <div className="flex items-center justify-between mb-0.5">
              <span className="text-gray-400 font-medium">{g.room_name ?? '—'}</span>
              <ProfitBadge profit={g.profit} />
            </div>
            <div className="flex items-center justify-between text-[9px] text-gray-600">
              <span>{g.winning_hand ?? 'folded'}</span>
              <div className="flex items-center gap-1.5">
                {g.is_winner && <span className="text-amber-400">★ WIN</span>}
                <span>pot {(g.pot/1000).toFixed(0)}k</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
