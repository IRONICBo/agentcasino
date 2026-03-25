#!/usr/bin/env npx tsx
/**
 * Two-agent poker simulation — runs continuously until one agent goes bust.
 * Usage: npx tsx scripts/simulate-game.ts
 */

const BASE = process.env.CASINO_URL || 'http://localhost:3333';
const API = `${BASE}/api/casino`;

const DELAY_MS = parseInt(process.env.DELAY_MS || '600', 10); // ms between actions

// ─── helpers ────────────────────────────────────────────────────────────────

function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

async function post(body: Record<string, any>, apiKey?: string) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;
  const r = await fetch(API, { method: 'POST', headers, body: JSON.stringify(body) });
  return r.json();
}

async function get(params: Record<string, string>, apiKey?: string) {
  const url = new URL(API);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const headers: Record<string, string> = {};
  if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;
  const r = await fetch(url.toString(), { headers });
  return r.json();
}

const suits: Record<string, string> = { hearts: '♥', diamonds: '♦', clubs: '♣', spades: '♠' };
function card(c: any) { return `${c.rank}${suits[c.suit] ?? c.suit}`; }
function cards(cs: any[]) { return cs?.length ? cs.map(card).join(' ') : '—'; }

function colorize(text: string, color: string) {
  const codes: Record<string, string> = {
    red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m',
    blue: '\x1b[34m', magenta: '\x1b[35m', cyan: '\x1b[36m',
    bold: '\x1b[1m', reset: '\x1b[0m', dim: '\x1b[2m',
  };
  return `${codes[color] ?? ''}${text}${codes.reset}`;
}

function log(msg: string) {
  const ts = new Date().toLocaleTimeString('en-US', { hour12: false });
  console.log(`${colorize(ts, 'dim')} ${msg}`);
}

function sep(char = '─', len = 60) {
  console.log(colorize(char.repeat(len), 'dim'));
}

// ─── simple strategy ─────────────────────────────────────────────────────────

function pickAction(validActions: any[]): { move: string; amount?: number } {
  if (!validActions?.length) return { move: 'fold' };

  const names = validActions.map((a: any) => a.action);

  // Very simple strategy: call/check most of the time, raise occasionally
  const rand = Math.random();

  if (names.includes('check') && rand < 0.7) return { move: 'check' };
  if (names.includes('call') && rand < 0.75) return { move: 'call' };

  const raiseAction = validActions.find((a: any) => a.action === 'raise');
  if (raiseAction && rand < 0.88) {
    const min = raiseAction.minAmount ?? 0;
    const max = raiseAction.maxAmount ?? min * 3;
    const amount = min + Math.floor(Math.random() * (max - min) * 0.3);
    return { move: 'raise', amount };
  }

  if (names.includes('call')) return { move: 'call' };
  if (names.includes('check')) return { move: 'check' };
  if (names.includes('fold')) return { move: 'fold' };
  return { move: validActions[0].action };
}

// ─── main ────────────────────────────────────────────────────────────────────

async function main() {
  console.clear();
  console.log(colorize('  🎰  AGENT CASINO — Live Simulation', 'bold'));
  console.log(colorize(`  Two agents fighting for chips at ${BASE}`, 'dim'));
  sep('═');

  // 1. Register agents
  const agents = [
    { agentId: 'sim-alice', name: 'Alice 🤖' },
    { agentId: 'sim-bob',   name: 'Bob 🤖' },
  ];

  const sessions: { apiKey: string; name: string; agentId: string }[] = [];

  for (const a of agents) {
    const r = await post({ action: 'register', agent_id: a.agentId, name: a.name });
    if (!r.success) {
      // Already registered — re-login
      const r2 = await post({ action: 'register', agent_id: a.agentId, name: a.name });
      sessions.push({ apiKey: r2.apiKey ?? r.apiKey, name: a.name, agentId: a.agentId });
    } else {
      sessions.push({ apiKey: r.apiKey, name: a.name, agentId: a.agentId });
    }
    log(`Registered ${colorize(a.name, 'cyan')} — chips: ${colorize(String(r.chips ?? '?'), 'yellow')}`);
  }

  // 2. Get lowest stakes table
  const roomsRes = await get({ action: 'rooms' });
  const room = roomsRes.rooms[0];
  if (!room) { console.error('No rooms found'); process.exit(1); }

  log(`Table: ${colorize(room.name, 'bold')} (blinds ${room.smallBlind}/${room.bigBlind}, min buy-in ${room.minBuyIn ?? 20000})`);
  sep();

  const roomId: string = room.id;
  const minBuyIn = room.minBuyIn ?? 20_000;

  // 3. Game loop
  let handNumber = 0;

  while (true) {
    // Check balances and (re-)join
    for (const s of sessions) {
      // Check if already seated with chips
      const gs = await get({ action: 'game_state', room_id: roomId }, s.apiKey);
      const seated = gs?.players?.find((p: any) => p.agentId === s.agentId);
      if (seated && seated.chips > 0) continue; // still in the game

      // Not seated (or bust at table) — check bank balance
      const status = await get({ action: 'status', agent_id: s.agentId });
      const bankBalance = status.chips ?? 0;

      if (bankBalance < minBuyIn) {
        // Try to claim chips
        const claim = await post({ action: 'claim', agent_id: s.agentId }, s.apiKey);
        if (claim.success) {
          log(`${colorize(s.name, 'cyan')} claimed chips → ${colorize(String(claim.chips), 'yellow')}`);
        } else {
          console.log(colorize(`\n  💀  ${s.name} is out of chips and can't claim right now.`, 'red'));
          console.log(colorize(`     Bank: ${bankBalance}  (need ${minBuyIn} to play)`, 'dim'));
          console.log(colorize(`     ${claim.message}`, 'dim'));
          console.log(colorize(`\n  Final score after ${handNumber - 1} hands:`, 'bold'));
          for (const sess of sessions) {
            const st = await get({ action: 'status', agent_id: sess.agentId });
            const g2 = await get({ action: 'game_state', room_id: roomId }, sess.apiKey);
            const tableC = g2?.players?.find((p: any) => p.agentId === sess.agentId)?.chips ?? 0;
            console.log(`  ${colorize(sess.name, 'cyan')}: bank ${st.chips ?? 0} + table ${tableC} = ${(st.chips ?? 0) + tableC}`);
          }
          process.exit(0);
        }
      }

      // Re-fetch balance after claiming (bank may have changed)
      const freshStatus = await get({ action: 'status', agent_id: s.agentId });
      const buyIn = Math.min(freshStatus.chips ?? 0, minBuyIn * 5);
      const joinRes = await post({ action: 'join', room_id: roomId, buy_in: buyIn }, s.apiKey);
      if (!joinRes.success) {
        log(`${colorize(s.name, 'red')} failed to join: ${joinRes.error}`);
      } else {
        log(`${colorize(s.name, 'cyan')} re-joined with ${colorize(String(buyIn), 'yellow')} chips`);
      }
    }

    await sleep(300);

    // 4. Play a hand
    handNumber++;
    sep('─');
    log(colorize(`  Hand #${handNumber}`, 'bold'));

    let phase = 'waiting';
    let stuckCounter = 0;
    let showdownStuck = 0;
    const maxTurns = 80;

    for (let turn = 0; turn < maxTurns; turn++) {
      await sleep(DELAY_MS);

      // Get game state from alice's POV (to see her cards)
      const state = await get({ action: 'game_state', room_id: roomId }, sessions[0].apiKey);

      if (!state || state.error) {
        log(`Game state error: ${state?.error ?? 'null'}`);
        break;
      }

      if (state.phase === 'waiting') {
        if (stuckCounter++ > 5) { log('Still waiting for players...'); break; }
        await sleep(800);
        continue;
      }

      // If stuck in showdown (stale state from previous session), force leave+rejoin
      if (state.phase === 'showdown' && !state.winners?.length) {
        if (++showdownStuck > 3) {
          log(colorize('Stale showdown detected — force-leaving table to reset...', 'yellow'));
          for (const s of sessions) {
            await post({ action: 'leave', room_id: roomId }, s.apiKey);
          }
          break;
        }
        await sleep(600);
        continue;
      }

      stuckCounter = 0;

      // Print state when phase changes
      if (state.phase !== phase) {
        phase = state.phase;
        sep('·', 40);
        log(`Phase: ${colorize(phase.toUpperCase(), 'magenta')}  Pot: ${colorize(String(state.pot), 'yellow')}`);

        if (state.communityCards?.length) {
          log(`Board: ${colorize(cards(state.communityCards), 'bold')}`);
        }

        // Print each player's view
        for (const p of state.players ?? []) {
          const isMe = p.agentId === sessions[0].agentId;
          const hc = p.holeCards ? cards(p.holeCards) : (isMe ? '?' : '🂠 🂠');
          const status = p.hasFolded ? colorize(' (folded)', 'dim') : p.isAllIn ? colorize(' ALL-IN', 'red') : '';
          log(`  ${isMe ? '👉' : '  '} ${colorize(p.name, 'cyan')}: ${hc}  chips: ${colorize(String(p.chips), 'yellow')}  bet: ${p.currentBet}${status}`);
        }
      }

      // Showdown — print result and break
      if (state.phase === 'showdown') {
        if (state.winners?.length) {
          sep('·', 40);
          log(colorize('🏆  SHOWDOWN', 'bold'));
          for (const p of state.players ?? []) {
            if (p.holeCards?.length) {
              log(`  ${colorize(p.name, 'cyan')}: ${colorize(cards(p.holeCards), 'bold')}`);
            }
          }
          for (const w of state.winners) {
            log(`  🥇 ${colorize(w.name, 'green')} wins ${colorize(String(w.amount), 'yellow')}  (${w.hand?.description ?? ''})`);
          }
        }
        await sleep(1500);
        break;
      }

      // Find whose turn it is
      const currentPlayer = state.players?.[state.currentPlayerIndex];
      if (!currentPlayer) { await sleep(300); continue; }

      // Find which session owns this seat
      const actor = sessions.find(s => s.agentId === currentPlayer.agentId);
      if (!actor) { await sleep(300); continue; }

      // Get valid actions
      const vaRes = await get({ action: 'valid_actions', room_id: roomId }, actor.apiKey);
      const validActions = vaRes.valid_actions ?? [];

      const { move, amount } = pickAction(validActions);

      const result = await post(
        { action: 'play', room_id: roomId, move, amount },
        actor.apiKey,
      );

      const amtStr = amount ? ` ${colorize(String(amount), 'yellow')}` : '';
      if (result.success) {
        log(`  ${colorize(actor.name, 'cyan')} → ${colorize(move, 'green')}${amtStr}`);
      } else {
        log(`  ${colorize(actor.name, 'cyan')} → ${move} failed: ${result.error}`);
      }

      // If showdown in play response, print winners
      if (result.result === 'showdown' && result.winners) {
        sep('·', 40);
        log(colorize('🏆  SHOWDOWN', 'bold'));
        for (const w of result.winners) {
          log(`  🥇 ${colorize(w.name, 'green')} wins ${colorize(String(w.amount), 'yellow')}  (${w.hand?.description ?? ''})`);
        }
        phase = 'showdown';
        await sleep(1500);
        break;
      }
    }

    // Print final balances after each hand
    sep('─');
    for (const s of sessions) {
      const st = await get({ action: 'status', agent_id: s.agentId });
      const gs2 = await get({ action: 'game_state', room_id: roomId, agent_id: s.agentId });
      const tableChips = gs2?.players?.find((p: any) => p.agentId === s.agentId)?.chips ?? 0;
      log(`${colorize(s.name, 'cyan')} — table: ${colorize(String(tableChips), 'yellow')}  bank: ${colorize(String(st.chips ?? 0), 'dim')}`);
    }

    await sleep(1000);
  }
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
