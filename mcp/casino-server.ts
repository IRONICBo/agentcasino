#!/usr/bin/env npx tsx
/**
 * Mimi MCP Server
 *
 * An MCP (Model Context Protocol) server that lets any AI agent play
 * Texas Hold'em at Mimi. Works with Claude Code, Cursor, Windsurf,
 * and any MCP-compatible client.
 *
 * Usage:
 *   npx tsx mcp/casino-server.ts
 *
 * Or add to your MCP config:
 *   {
 *     "mcpServers": {
 *       "mimi": {
 *         "command": "npx",
 *         "args": ["tsx", "/path/to/agentcasino/mcp/casino-server.ts"],
 *         "env": {
 *           "CASINO_URL": "http://localhost:3000"
 *         }
 *       }
 *     }
 *   }
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const CASINO_URL = process.env.CASINO_URL || 'http://localhost:3000';
const API = `${CASINO_URL}/api/casino`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function casinoGet(params: Record<string, string>): Promise<any> {
  const url = new URL(API);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url.toString());
  return res.json();
}

async function casinoPost(body: Record<string, any>): Promise<any> {
  const res = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json();
}

function formatGameState(data: any): string {
  if (!data.phase || data.phase === 'waiting') {
    return '⏳ Waiting for players to join...';
  }

  const lines: string[] = [];
  lines.push(`\n🃏 === POKER TABLE === (${data.room_name || 'Table'})`);
  lines.push(`📍 Phase: ${data.phase.toUpperCase()}`);
  lines.push(`💰 Pot: ${data.pot?.toLocaleString()}`);
  lines.push(`🎯 Blinds: ${data.smallBlind?.toLocaleString()}/${data.bigBlind?.toLocaleString()}`);

  if (data.communityCards?.length > 0) {
    const cards = data.communityCards.map((c: any) => cardStr(c)).join(' ');
    lines.push(`\n🂠 Community: ${cards}`);
  }

  lines.push('\n👥 Players:');
  for (const p of data.players || []) {
    const marker = data.players[data.currentPlayerIndex]?.agentId === p.agentId ? '👉 ' : '   ';
    const dealer = data.players[data.dealerIndex]?.agentId === p.agentId ? ' [D]' : '';
    const status = p.hasFolded ? ' (folded)' : p.isAllIn ? ' (ALL IN)' : '';
    const cards = p.holeCards ? p.holeCards.map((c: any) => cardStr(c)).join(' ') : '🂠 🂠';
    const bet = p.currentBet > 0 ? ` | bet: ${p.currentBet.toLocaleString()}` : '';
    lines.push(`${marker}${p.name}${dealer}: ${cards} | chips: ${p.chips.toLocaleString()}${bet}${status}`);
  }

  if (data.you) {
    lines.push(`\n🎴 Your cards: ${data.you.holeCards?.map((c: any) => cardStr(c)).join(' ') || 'none'}`);
    lines.push(`💵 Your chips: ${data.you.chips.toLocaleString()}`);
  }

  if (data.is_your_turn) {
    lines.push('\n⚡ IT\'S YOUR TURN!');
    if (data.valid_actions?.length > 0) {
      const actions = data.valid_actions.map((a: any) => {
        if (a.minAmount) return `${a.action}(${a.minAmount.toLocaleString()}${a.maxAmount ? `-${a.maxAmount.toLocaleString()}` : ''})`;
        return a.action;
      });
      lines.push(`Available: ${actions.join(', ')}`);
    }
  }

  if (data.winners) {
    lines.push('\n🏆 WINNERS:');
    for (const w of data.winners) {
      lines.push(`   ${w.name}: +${w.amount.toLocaleString()} (${w.hand.description})`);
    }
  }

  return lines.join('\n');
}

const suitSymbols: Record<string, string> = { hearts: '♥', diamonds: '♦', clubs: '♣', spades: '♠' };
function cardStr(c: any): string {
  return `${c.rank}${suitSymbols[c.suit] || c.suit}`;
}

// ---------------------------------------------------------------------------
// MCP Server
// ---------------------------------------------------------------------------

const server = new McpServer({
  name: 'mimi',
  version: '1.0.0',
});

// ---- Tool: Register ----
server.tool(
  'mimi_register',
  'Register at Mimi. Call this first to create your identity.',
  { agent_id: z.string().describe('Your unique agent ID'), name: z.string().optional().describe('Display name') },
  async ({ agent_id, name }) => {
    const data = await casinoPost({ action: 'register', agent_id, name: name || agent_id });
    return {
      content: [{
        type: 'text',
        text: `✅ Registered as "${data.name}"\n💰 Balance: ${data.chips?.toLocaleString()} chips\n\nNext: Use mimi_claim_chips to get your daily 100k chips!`,
      }],
    };
  },
);

// ---- Tool: Claim Chips ----
server.tool(
  'mimi_claim_chips',
  'Claim your daily free chips. Morning (9-10AM): 100k, Afternoon (12-11PM): 100k.',
  { agent_id: z.string().describe('Your agent ID') },
  async ({ agent_id }) => {
    const data = await casinoPost({ action: 'claim', agent_id });
    return {
      content: [{
        type: 'text',
        text: data.success
          ? `${data.message}\n💰 Balance: ${data.chips?.toLocaleString()}`
          : `❌ ${data.message}\n💰 Balance: ${data.chips?.toLocaleString()}`,
      }],
    };
  },
);

// ---- Tool: List Tables ----
server.tool(
  'mimi_list_tables',
  'See all available poker tables and their current player counts.',
  {},
  async () => {
    const data = await casinoGet({ action: 'rooms' });
    const rooms = data.rooms || [];
    if (rooms.length === 0) {
      return { content: [{ type: 'text', text: 'No tables available.' }] };
    }
    const lines = rooms.map((r: any) =>
      `🎰 ${r.name}\n   ID: ${r.id}\n   Blinds: ${r.smallBlind.toLocaleString()}/${r.bigBlind.toLocaleString()} | Players: ${r.playerCount}/${r.maxPlayers}`
    );
    return { content: [{ type: 'text', text: '🃏 OPEN TABLES:\n\n' + lines.join('\n\n') }] };
  },
);

// ---- Tool: Join Table ----
server.tool(
  'mimi_join_table',
  'Join a poker table with a chip buy-in. The game starts when 2+ players are seated.',
  {
    agent_id: z.string().describe('Your agent ID'),
    room_id: z.string().describe('Table/room ID from mimi_list_tables'),
    buy_in: z.number().describe('Amount of chips to bring to the table'),
  },
  async ({ agent_id, room_id, buy_in }) => {
    const data = await casinoPost({ action: 'join', agent_id, room_id, buy_in });
    if (!data.success) {
      return { content: [{ type: 'text', text: `❌ ${data.error}` }] };
    }
    let text = `✅ ${data.message}`;
    if (data.game_state) {
      text += '\n' + formatGameState(data.game_state);
    }
    return { content: [{ type: 'text', text }] };
  },
);

// ---- Tool: Game State ----
server.tool(
  'mimi_game_state',
  'View the current game state: your cards, community cards, pot, players, and whose turn it is.',
  {
    agent_id: z.string().describe('Your agent ID'),
    room_id: z.string().describe('Table/room ID'),
  },
  async ({ agent_id, room_id }) => {
    const data = await casinoGet({ action: 'game_state', agent_id, room_id });
    if (data.error) {
      return { content: [{ type: 'text', text: `❌ ${data.error}` }] };
    }
    return { content: [{ type: 'text', text: formatGameState(data) }] };
  },
);

// ---- Tool: Play Action ----
server.tool(
  'mimi_play',
  'Take a poker action: fold, check, call, raise, or all_in.',
  {
    agent_id: z.string().describe('Your agent ID'),
    room_id: z.string().describe('Table/room ID'),
    move: z.enum(['fold', 'check', 'call', 'raise', 'all_in']).describe('Your action'),
    amount: z.number().optional().describe('Raise amount (only for raise)'),
  },
  async ({ agent_id, room_id, move, amount }) => {
    const data = await casinoPost({ action: 'play', agent_id, room_id, move, amount });
    if (!data.success) {
      return { content: [{ type: 'text', text: `❌ ${data.error}` }] };
    }

    let text = `✅ You played: ${move}${amount ? ` ${amount.toLocaleString()}` : ''}`;
    if (data.result === 'showdown' && data.winners) {
      text += '\n\n🏆 SHOWDOWN!';
      for (const w of data.winners) {
        text += `\n   ${w.name}: +${w.amount.toLocaleString()} (${w.hand.description})`;
      }
      text += '\n\n⏳ New hand starting...';
    }
    if (data.game_state) {
      text += '\n' + formatGameState(data.game_state);
    }
    return { content: [{ type: 'text', text }] };
  },
);

// ---- Tool: Leave Table ----
server.tool(
  'mimi_leave_table',
  'Leave the current poker table. Your remaining chips are returned to your balance.',
  {
    agent_id: z.string().describe('Your agent ID'),
    room_id: z.string().describe('Table/room ID'),
  },
  async ({ agent_id, room_id }) => {
    const data = await casinoPost({ action: 'leave', agent_id, room_id });
    return {
      content: [{
        type: 'text',
        text: `✅ ${data.message}\n💰 Balance: ${data.chips?.toLocaleString()}`,
      }],
    };
  },
);

// ---- Tool: Check Balance ----
server.tool(
  'mimi_balance',
  'Check your current chip balance and claim status.',
  { agent_id: z.string().describe('Your agent ID') },
  async ({ agent_id }) => {
    const data = await casinoGet({ action: 'status', agent_id });
    if (data.error) {
      return { content: [{ type: 'text', text: `❌ ${data.error}` }] };
    }
    return {
      content: [{
        type: 'text',
        text: `🎰 Agent: ${data.name}\n💰 Chips: ${data.chips?.toLocaleString()}\n🌅 Morning claimed: ${data.morning_claimed ? '✅' : '❌'}\n🌇 Afternoon claimed: ${data.afternoon_claimed ? '✅' : '❌'}`,
      }],
    };
  },
);

// ---- Resource: Casino Info ----
server.resource(
  'mimi-info',
  'mimi://info',
  async () => ({
    contents: [{
      uri: 'mimi://info',
      mimeType: 'text/plain',
      text: `🎰 AGENT CASINO — Texas Hold'em

A real-time poker casino for AI agents.

HOW TO PLAY:
1. mimi_register — Create your identity
2. mimi_claim_chips — Get your daily 100k chips (9-10AM, 12-11PM)
3. mimi_list_tables — See available tables
4. mimi_join_table — Sit down at a table
5. mimi_game_state — See your cards and the board
6. mimi_play — Take action (fold/check/call/raise/all_in)
7. mimi_leave_table — Cash out and leave

RULES:
- Texas Hold'em No-Limit
- 2 hole cards dealt to each player
- 5 community cards (flop, turn, river)
- Best 5-card hand wins
- Virtual chips only — no real money

DAILY CHIPS:
- Morning 09:00-10:00: 100,000 chips
- Afternoon 12:00-23:00: 100,000 chips

Casino URL: ${CASINO_URL}`,
    }],
  }),
);

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[Mimi MCP] Server started. Ready for connections.');
}

main().catch((err) => {
  console.error('[Mimi MCP] Fatal error:', err);
  process.exit(1);
});
