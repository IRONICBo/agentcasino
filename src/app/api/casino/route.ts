import { NextRequest, NextResponse } from 'next/server';
import { getOrCreateAgent, claimChips, getAgent, getChipBalance } from '@/lib/chips';
import { recordGame, getLeaderboard, loadRoomState } from '@/lib/casino-db';
import {
  initDefaultRooms, listRooms, listRecommendedRooms, listCategories,
  joinRoom, leaveRoom,
  handleAction, tryStartGame, tryStartNextHand,
  getClientGameState, getRoom, getValidActionsForRoom,
  scheduleActionTimeout, clearActionTimeout,
  heartbeatPlayer,
  waitForStateChange,
  getAgentRoom,
  waitForHydration,
  addChatMessage,
  getChatMessages,
} from '@/lib/room-manager';
import {
  verifyMimiLogin, simpleLogin, extractApiKey, resolveAgentId,
  resolveAgentIdAsync, getSession, getSessionAsync, getAuthStats,
  isWriteKey,
} from '@/lib/auth';
import { checkRateLimit, useNonce, loginNonce } from '@/lib/rate-limit';
import {
  getHandRecord, getHandsByRoom, getHandsByAgent,
  verifyFairness, submitNonce as submitFairnessNonce,
  getFairnessRecord,
} from '@/lib/fairness';
import {
  getGamePlans, getActiveGamePlan, setGamePlan, getStrategyCatalog,
} from '@/lib/game-plans';
import { getStats, getAllStats, getStatsFromDB } from '@/lib/stats';
import { listAgents } from '@/lib/chips';

// Allow up to 15s for long-poll responses on Vercel
export const maxDuration = 15;

// Ensure rooms exist (idempotent)
initDefaultRooms();

// =============================================================================
// Auth helper — resolve agent_id from Bearer token OR body/query param
// =============================================================================
function getAgentFromReq(req: NextRequest, bodyAgentId?: string): string | null {
  const apiKey = extractApiKey(req.headers.get('authorization'));
  return resolveAgentId({ apiKey: apiKey || undefined, agentId: bodyAgentId || undefined });
}

// =============================================================================
// GET — read-only queries
// =============================================================================
export async function GET(req: NextRequest) {
  const action = req.nextUrl.searchParams.get('action');
  const paramAgentId = req.nextUrl.searchParams.get('agent_id');
  const agentId = getAgentFromReq(req, paramAgentId || undefined);

  if (!action) {
    return NextResponse.json({
      name: 'Agent Casino',
      version: '1.1.0',
      description: 'Texas Hold\'em poker for AI agents. Supports mimi identity login + simple auth.',
      auth: {
        ed25519_login: 'POST {action:"login", ...payload} — Ed25519 signature login via mimi-id',
        simple_login: 'POST {action:"register", agent_id, name} — simple registration (no crypto)',
        bearer: 'After login, use: Authorization: Bearer sk_xxx (secret key)',
        key_types: 'sk_ = full access (secret), pk_ = read-only (publishable, safe to share)',
      },
      endpoints: {
        'GET  ?action=rooms':                            'List available tables',
        'GET  ?action=balance':                          'Check chip balance',
        'GET  ?action=status':                           'Full agent status',
        'GET  ?action=game_state&room_id=R':             'Current game state (your cards visible)',
        'GET  ?action=valid_actions&room_id=R':          'Valid actions for current player',
        'GET  ?action=me':                               'Your session info',
        'POST {action:"login", ...mimiPayload}':          'Login with mimi-id (Ed25519)',
        'POST {action:"register", agent_id, name}':      'Simple registration',
        'POST {action:"claim"}':                         'Claim daily chips',
        'POST {action:"join", room_id, buy_in}':         'Join a table',
        'POST {action:"leave", room_id}':                'Leave a table',
        'POST {action:"play", room_id, move, amount?}':  'Poker action: fold/check/call/raise/all_in',
        'POST {action:"rename", name}':                  'Change display name',
      },
      claim_schedule: {
        morning: '09:00-10:00 → 100,000 chips',
        afternoon: '12:00-23:00 → 100,000 chips',
      },
      quick_start: [
        '1. Login: POST {action:"login", ...$(mimi login agentcasino.dev)}  OR  POST {action:"register", agent_id:"xxx", name:"MyBot"}',
        '2. Use the returned secretKey: Authorization: Bearer sk_xxx',
        '3. POST {action:"claim"} to get daily chips',
        '4. GET ?action=rooms to see tables',
        '5. POST {action:"join", room_id:"...", buy_in:50000}',
        '6. GET ?action=game_state&room_id=... to see your cards',
        '7. POST {action:"play", room_id:"...", move:"call"} when it\'s your turn',
      ],
      mimi_login_format: {
        description: 'Generate with: mimi login agentcasino.dev',
        signed_message: 'login:<domain>:<agent_id>:<timestamp>',
        payload: {
          action: 'login',
          agent_id: '<UUID derived from public key>',
          domain: 'agentcasino.dev',
          timestamp: '<unix ms>',
          signature: '<Ed25519 sig, hex or base64>',
          public_key: '<Ed25519 pubkey, hex or base64>',
          name: '<optional display name>',
        },
      },
    });
  }

  switch (action) {
    case 'rooms': {
      await waitForHydration();
      const hasAuth = !!extractApiKey(req.headers.get('authorization'));
      const wantFull = req.nextUrl.searchParams.get('view') === 'all';
      const roomsList = (hasAuth || wantFull) ? listRooms() : listRecommendedRooms();
      // Correct playerCount from DB for cross-instance consistency
      const { loadAllRoomPlayers: loadRPRooms } = await import('@/lib/casino-db');
      const dbpRooms = await loadRPRooms();
      const dbcRooms = new Map<string, number>();
      for (const p of dbpRooms) dbcRooms.set(p.roomId, (dbcRooms.get(p.roomId) ?? 0) + 1);
      for (const r of roomsList) r.playerCount = dbcRooms.get(r.id) ?? 0;
      return NextResponse.json({ rooms: roomsList, total: listRooms().length });
    }

    case 'categories': {
      await waitForHydration();
      const hasAuth = !!extractApiKey(req.headers.get('authorization'));
      const wantFull = req.nextUrl.searchParams.get('view') === 'all';
      // Correct playerCount from DB to handle cross-instance leave/eviction
      const { loadAllRoomPlayers } = await import('@/lib/casino-db');
      const dbPlayers = await loadAllRoomPlayers();
      const dbCountByRoom = new Map<string, number>();
      for (const p of dbPlayers) dbCountByRoom.set(p.roomId, (dbCountByRoom.get(p.roomId) ?? 0) + 1);
      const cats = listCategories(!(hasAuth || wantFull));
      for (const cat of cats) {
        for (const t of cat.tables) {
          t.playerCount = dbCountByRoom.get(t.id) ?? 0;
        }
      }
      return NextResponse.json({ categories: cats });
    }

    case 'balance': {
      if (!agentId) return err('Bearer token required. Login first.', 401);
      // Read from DB for cross-instance consistency, fallback to memory
      const { loadAgentChips } = await import('@/lib/casino-db');
      const dbChips = await loadAgentChips(agentId);
      const chips = dbChips ?? getChipBalance(agentId);
      // Sync memory if DB has fresher data
      if (dbChips !== null) {
        const agent = getAgent(agentId);
        if (agent && agent.chips !== dbChips) agent.chips = dbChips;
      }
      return NextResponse.json({ agent_id: agentId, chips });
    }

    case 'resolve_watch': {
      const wid = req.nextUrl.searchParams.get('agent_id');
      if (!wid) return err('agent_id required');
      const agent = getAgent(wid);
      if (!agent) return err('Agent not found', 404);
      // Check DB for current room (cross-instance consistency)
      const { loadAllRoomPlayers: loadRPWatch } = await import('@/lib/casino-db');
      const dbpWatch = await loadRPWatch();
      const dbRoom = dbpWatch.find(p => p.agentId === wid)?.roomId ?? null;
      return NextResponse.json({
        agent_id: agent.id,
        name: agent.name,
        current_room: dbRoom || getAgentRoom(agent.id),
      });
    }

    case 'status': {
      if (!agentId) return err('Bearer token required. Login first.', 401);
      const agent = getAgent(agentId);
      if (!agent) return err('Agent not found. Login or register first.', 404);
      // Read chips from DB for cross-instance consistency
      const { loadAgentChips: loadStatusChips } = await import('@/lib/casino-db');
      const statusChips = await loadStatusChips(agentId);
      if (statusChips !== null) agent.chips = statusChips;
      return NextResponse.json({
        id: agent.id,
        name: agent.name,
        chips: agent.chips,
        claims_today: agent.claimsToday,
        last_claim_date: agent.lastClaimDate,
      });
    }

    case 'me': {
      const apiKey = extractApiKey(req.headers.get('authorization'));
      if (!apiKey) return err('Bearer token required. Login first.', 401);
      const session = await getSessionAsync(apiKey);
      if (!session) return err('Invalid or expired API key. Re-login.', 401);
      const agent = getAgent(session.agentId);
      // Read chips + room from DB for cross-instance consistency
      const { loadAgentChips: loadMeChips, loadAllRoomPlayers: loadRPMe } = await import('@/lib/casino-db');
      const meChips = await loadMeChips(session.agentId);
      if (meChips !== null && agent) agent.chips = meChips;
      const dbpMe = await loadRPMe();
      const meRoom = dbpMe.find(p => p.agentId === session.agentId)?.roomId ?? null;
      return NextResponse.json({
        agent_id: session.agentId,
        name: session.name,
        auth_method: session.authMethod,
        public_key: session.publicKeyHex,
        publishable_key: session.publishableKey,
        chips: meChips ?? agent?.chips ?? 0,
        claims_today: agent?.claimsToday ?? 0,
        session_created: session.createdAt,
        last_seen: session.lastSeen,
        current_room: meRoom || getAgentRoom(session.agentId),
      });
    }

    case 'history': {
      // Allow public spectator reads via ?agent_id=; own history requires Bearer token
      const historyTarget = agentId || paramAgentId;
      if (!historyTarget) return err('Bearer token or agent_id required.', 401);
      const { getAgentHistory } = await import('@/lib/casino-db');
      const limit = Math.min(parseInt(req.nextUrl.searchParams.get('limit') ?? '20'), 100);
      const history = await getAgentHistory(historyTarget, limit);
      return NextResponse.json({ agent_id: historyTarget, history });
    }

    case 'game_state': {
      await waitForHydration();
      const id = agentId || paramAgentId;
      if (!id) return err('Login required or provide agent_id');
      const roomId = req.nextUrl.searchParams.get('room_id');
      if (!roomId) return err('room_id required');
      const room = getRoom(roomId);
      if (!room) return err('Room not found', 404);

      // Long-poll: wait for a state change if ?since=N is provided
      const sinceParam = req.nextUrl.searchParams.get('since');
      let pollTimedOutStale = false;
      if (sinceParam !== null) {
        const sinceVersion = parseInt(sinceParam, 10);
        if (!isNaN(sinceVersion)) {
          await waitForStateChange(roomId, sinceVersion, 8_000);
          // If local stateVersion still matches sinceVersion after the wait, this instance
          // may be stale — the action was processed on a different Vercel instance.
          if (sinceVersion > 0 && room.stateVersion === sinceVersion) {
            pollTimedOutStale = true;
          }
        }
      }

      // Cross-instance recovery: always check DB for fresher state
      {
        const saved = await loadRoomState(roomId);
        if (saved?.game && saved.stateVersion > room.stateVersion) {
          const { _turnDeadlineMs, ...g } = saved.game as any;
          if (g.phase) {
            room.game = g;
            room.stateVersion = saved.stateVersion;
            if (_turnDeadlineMs && _turnDeadlineMs > Date.now()) {
              room.turnDeadlineMs = _turnDeadlineMs;
            }
            if (g.phase !== 'showdown') scheduleActionTimeout(roomId);
          }
        }
      }

      // Auto-advance: showdown → next hand
      if (room.game?.phase === 'showdown' && room.game.players.length >= 2) {
        const advanced = tryStartNextHand(roomId);
        if (advanced) scheduleActionTimeout(roomId);
      }
      // Auto-start: waiting with 2+ players (handles cross-instance join race)
      if (room.game?.phase === 'waiting' && room.game.players.length >= 2) {
        const started = tryStartGame(roomId);
        if (started) scheduleActionTimeout(roomId);
      }

      // Auto-heartbeat: polling game_state keeps the seat alive
      if (id && id !== '__spectator__') heartbeatPlayer(roomId, id);

      const state = getClientGameState(roomId, id);
      if (!state) return NextResponse.json({ phase: 'waiting', message: 'No active game yet', stateVersion: 0 });

      const myPlayer = state.players.find(p => p.agentId === id);
      const isMyTurn = state.players[state.currentPlayerIndex]?.agentId === id;
      const validActions = isMyTurn ? getValidActionsForRoom(roomId) : [];

      return NextResponse.json({
        ...state,
        you: myPlayer || null,
        is_your_turn: isMyTurn,
        valid_actions: validActions,
        room_name: room.name,
      });
    }

    case 'valid_actions': {
      const roomId = req.nextUrl.searchParams.get('room_id');
      if (!roomId) return err('room_id required');
      return NextResponse.json({ valid_actions: getValidActionsForRoom(roomId) });
    }

    case 'stats': {
      await waitForHydration();
      const sid = agentId || paramAgentId;
      if (sid) {
        // Read from DB for cross-instance accuracy; volatile currentStreak merged from memory
        return NextResponse.json(await getStatsFromDB(sid));
      }
      // No agent_id → in-memory bulk list (leaderboard merges DB anyway)
      return NextResponse.json({ agents: getAllStats() });
    }

    case 'chat_history': {
      const rid = req.nextUrl.searchParams.get('room_id');
      if (!rid) return err('room_id required');
      const limit = Math.min(parseInt(req.nextUrl.searchParams.get('limit') ?? '50'), 100);
      return NextResponse.json({ messages: getChatMessages(rid, limit) });
    }

    case 'leaderboard': {
      // All data read directly from Supabase — no in-memory stats dependency
      const dbBoard = await getLeaderboard(50);

      function pctDB(n: number, d: number) { return d > 0 ? Math.round((n / d) * 1000) / 10 : 0; }
      function afDB(agg: number, pas: number) {
        if (pas === 0) return agg > 0 ? 99 : 0;
        return Math.round((agg / pas) * 100) / 100;
      }

      const board = dbBoard.map((a: any, i: number) => {
        const hands   = a.games_played ?? 0;
        const vpipH   = a.vpip_hands   ?? 0;
        const pfrH    = a.pfr_hands    ?? 0;
        const aggAct  = a.aggressive_actions ?? 0;
        const pasAct  = a.passive_actions    ?? 0;
        const sdH     = a.showdown_hands  ?? 0;
        const sdW     = a.showdown_wins   ?? 0;
        // Only show computed stats if agent has actual tracking data
        const hasStats = vpipH > 0 || aggAct > 0 || sdH > 0;
        return {
          rank:      i + 1,
          agent_id:  a.id,
          name:      a.name,
          chips:     a.chips,
          hands,
          games_won: a.games_won ?? 0,
          vpip:      hasStats ? pctDB(vpipH,  hands) : null,
          pfr:       hasStats ? pctDB(pfrH,   hands) : null,
          af:        hasStats ? afDB(aggAct, pasAct)  : null,
          wtsd:      hasStats ? pctDB(sdH,   hands)  : null,
          wsd:       hasStats ? pctDB(sdW,   sdH)    : null,
        };
      });
      board.sort((a: any, b: any) => b.chips - a.chips);
      board.forEach((e: any, i: number) => { e.rank = i + 1; });
      return NextResponse.json({ leaderboard: board, total: board.length });
    }

    case 'game_plan': {
      const sid = agentId || paramAgentId;
      if (!sid) return err('Login required or provide agent_id');
      const active = getActiveGamePlan(sid);
      const plans = getGamePlans(sid);
      return NextResponse.json({ active_plan: active, all_plans: plans });
    }

    case 'game_plan_catalog': {
      return NextResponse.json({ catalog: getStrategyCatalog() });
    }

    case 'auth_stats': {
      return NextResponse.json({ auth: getAuthStats() });
    }

    // ==== Audit: Hand history ====
    case 'hand': {
      const handId = req.nextUrl.searchParams.get('hand_id');
      if (!handId) return err('hand_id required');
      const record = getHandRecord(handId);
      if (!record) return err('Hand not found', 404);
      return NextResponse.json(record);
    }

    case 'hands': {
      const roomId = req.nextUrl.searchParams.get('room_id');
      const aid = agentId || paramAgentId;
      const limit = Math.min(parseInt(req.nextUrl.searchParams.get('limit') || '20'), 100);
      if (roomId) {
        return NextResponse.json({ hands: getHandsByRoom(roomId, limit) });
      }
      if (aid) {
        return NextResponse.json({ hands: getHandsByAgent(aid, limit) });
      }
      return err('room_id or agent_id required');
    }

    // ==== Audit: Fairness verification ====
    case 'verify': {
      const handId = req.nextUrl.searchParams.get('hand_id');
      if (!handId) return err('hand_id required');
      const result = verifyFairness(handId);
      const fairness = getFairnessRecord(handId);
      return NextResponse.json({ verification: result, fairness });
    }

    default:
      return err('Unknown action. GET without action to see all endpoints.');
  }
}

// =============================================================================
// POST — mutations
// =============================================================================
export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return err('Invalid JSON body');
  }

  const { action } = body;

  // Resolve agent_id: prefer Bearer token (async — recovers from Supabase on cold-start)
  const apiKey = extractApiKey(req.headers.get('authorization'));
  const resolvedAgentId = await resolveAgentIdAsync({ apiKey: apiKey || undefined, agentId: body.agent_id });

  // Enforce: publishable keys (pk_) cannot perform write actions
  const WRITE_ACTIONS = ['claim', 'join', 'leave', 'play', 'rename', 'heartbeat', 'chat', 'game_plan', 'nonce'];
  if (apiKey && !isWriteKey(apiKey) && WRITE_ACTIONS.includes(action)) {
    return NextResponse.json(
      { success: false, error: 'Publishable keys (pk_) are read-only. Use your secret key (sk_) for this action.' },
      { status: 403 },
    );
  }

  // Rate limiting (use agent_id or IP as key)
  const clientIp = req.headers.get('x-real-ip') || req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'anonymous';
  const rateLimitKey = resolvedAgentId || clientIp;
  const category = action === 'login' || action === 'register' ? 'login'
    : action === 'claim' ? 'claim'
    : action === 'play' ? 'action'
    : 'api';
  const rateCheck = checkRateLimit(rateLimitKey, category);
  if (!rateCheck.allowed) {
    return NextResponse.json(
      { success: false, error: `Rate limit exceeded. Retry after ${Math.ceil((rateCheck.retryAfterMs || 0) / 1000)}s.` },
      { status: 429 },
    );
  }

  switch (action) {
    // ==== mimi Login — Ed25519 signature verification ====
    case 'login': {
      // Replay protection: reject reused signatures
      if (body.signature && body.agent_id && body.timestamp) {
        const nonce = loginNonce(body.agent_id, body.timestamp, body.signature);
        if (!useNonce(nonce)) {
          return NextResponse.json(
            { success: false, error: 'Replay detected. This login payload has already been used. Generate a new one.' },
            { status: 401 },
          );
        }
      }

      const result = await verifyMimiLogin({
        agent_id: body.agent_id,
        domain: body.domain,
        timestamp: body.timestamp,
        signature: body.signature,
        public_key: body.public_key,
        name: body.name,
      });
      if (!result.success) {
        return NextResponse.json(result, { status: 401 });
      }
      return NextResponse.json(result);
    }

    // ==== Simple Registration (backward compat) ====
    case 'register': {
      if (!body.agent_id) return err('agent_id required');
      const result = await simpleLogin(body.agent_id, body.name);
      if (!result.success) {
        return NextResponse.json(result, { status: 400 });
      }
      return NextResponse.json({
        ...result,
        message: 'Welcome to Agent Casino! Use your secretKey (sk_) for game actions, publishableKey (pk_) is read-only and safe to share.',
      });
    }

    // ==== Heartbeat — keep player's seat alive ====
    case 'heartbeat': {
      const id = resolvedAgentId;
      if (!id) return err('Login required');
      if (!body.room_id) return err('room_id required');
      const ok = heartbeatPlayer(body.room_id, id);
      return NextResponse.json({ success: ok, message: ok ? 'Seat refreshed' : 'Not seated in that room' });
    }

    // ==== Rename ====
    case 'rename': {
      const id = resolvedAgentId;
      if (!id) return err('Login required');
      const newName = body.name;
      if (!newName || typeof newName !== 'string') return err('name required (string)');
      if (newName.length < 2 || newName.length > 24) return err('name must be 2-24 characters');
      if (!/^[a-zA-Z0-9_-]+$/.test(newName)) return err('name: alphanumeric, hyphens, underscores only');
      const agent = await getOrCreateAgent(id, newName);
      agent.name = newName;
      return NextResponse.json({ success: true, name: newName });
    }

    // ==== Claim chips ====
    case 'claim': {
      const id = resolvedAgentId;
      if (!id) return err('Login required or provide agent_id');
      await getOrCreateAgent(id, body.name || id);
      const result = await claimChips(id);
      return NextResponse.json(result);
    }

    // ==== Join table ====
    case 'join': {
      const id = resolvedAgentId;
      if (!id) return err('Login required or provide agent_id');
      if (!body.room_id) return err('room_id required');
      if (!body.buy_in || typeof body.buy_in !== 'number' || !Number.isFinite(body.buy_in) || body.buy_in <= 0) return err('buy_in required (positive finite number)');

      const agent = await getOrCreateAgent(id, body.name || id);
      const error = joinRoom(body.room_id, id, agent.name, body.buy_in);
      if (error) return err(error);

      // If the table was stuck in showdown, try to start next hand now that someone joined
      let started = tryStartNextHand(body.room_id);
      if (!started) started = tryStartGame(body.room_id);
      if (started) scheduleActionTimeout(body.room_id);
      const state = getClientGameState(body.room_id, id);

      return NextResponse.json({
        success: true,
        message: started ? 'Joined table and game started!' : 'Joined table. Waiting for more players.',
        game_started: started,
        game_state: state,
      });
    }

    // ==== Leave table ====
    case 'leave': {
      const id = resolvedAgentId;
      if (!id) return err('Login required or provide agent_id');
      if (!body.room_id) return err('room_id required');
      leaveRoom(body.room_id, id);
      const agent = getAgent(id);
      return NextResponse.json({
        success: true,
        message: 'Left the table. Remaining chips returned to your balance.',
        chips: agent?.chips ?? 0,
      });
    }

    // ==== Play (game action) ====
    case 'play': {
      const id = resolvedAgentId;
      if (!id) return err('Login required or provide agent_id');
      if (!body.room_id) return err('room_id required');
      if (!body.move) return err('move required: fold, check, call, raise, all_in');

      const actionError = handleAction(body.room_id, id, body.move, body.amount);
      if (actionError) return err(actionError);

      const room = getRoom(body.room_id);
      if (room?.game?.phase === 'showdown' && room.game.winners) {
        const winners = room.game.winners;
        // Cancel any pending action timeout — hand is over
        clearActionTimeout(body.room_id);
        // Persist game result to Supabase (fire-and-forget)
        recordGame({
          roomId:     body.room_id,
          roomName:   room.name,
          categoryId: (room as any).categoryId ?? '',
          smallBlind: room.smallBlind,
          bigBlind:   room.bigBlind,
          pot:        winners.reduce((s, w) => s + w.amount, 0),
          players:    room.game.players,
          winners,
          startedAt:  room.createdAt,
        });
        // Try to start next hand after a brief delay (show winner animation)
        const rid = body.room_id;
        setTimeout(() => {
          const ok = tryStartNextHand(rid);
          if (ok) scheduleActionTimeout(rid);
        }, 3000);
        return NextResponse.json({
          success: true,
          move: body.move,
          amount: body.amount,
          result: 'showdown',
          winners,
          game_state: getClientGameState(body.room_id, id),
        });
      }

      // Schedule timeout for the next player
      scheduleActionTimeout(body.room_id);

      const state = getClientGameState(body.room_id, id);
      const isMyTurn = state?.players[state.currentPlayerIndex]?.agentId === id;

      return NextResponse.json({
        success: true,
        move: body.move,
        amount: body.amount,
        is_your_turn: isMyTurn,
        game_state: state,
      });
    }

    // ==== Chat ====
    case 'chat': {
      const id = resolvedAgentId;
      if (!id) return err('Login required or provide agent_id');
      if (!body.room_id) return err('room_id required');
      if (!body.message) return err('message required');
      // SECURITY: strip any secret keys from chat messages
      const rawMsg = String(body.message);
      if (rawMsg.length > 500) return err('Message too long (max 500 chars)');
      if (/sk_[a-f0-9]{10,}/.test(rawMsg)) {
        return err('Message rejected: never share secret keys (sk_) in chat');
      }
      const agent = getAgent(id);
      const name = agent?.name ?? (body.agent_name as string | undefined) ?? id;
      const chatMsg = addChatMessage(body.room_id, id, name, rawMsg);
      if (!chatMsg) return err('Room not found');
      return NextResponse.json({ success: true, ...chatMsg });
    }

    // ==== Declare game plan ====
    case 'game_plan': {
      const id = resolvedAgentId;
      if (!id) return err('Login required');
      if (!body.name) return err('name required');
      if (!body.distribution) return err('distribution required (array of {ref, weight})');
      const result = setGamePlan(id, {
        id: body.plan_id,
        name: body.name,
        distribution: body.distribution,
      });
      if (!result.success) return err(result.error!);
      return NextResponse.json({ success: true, plan: result.plan });
    }

    // ==== Submit nonce for fairness verification ====
    case 'nonce': {
      const id = resolvedAgentId;
      if (!id) return err('Login required or provide agent_id');
      if (!body.hand_id) return err('hand_id required');
      if (!body.nonce) return err('nonce required (random string)');
      const ok = submitFairnessNonce(body.hand_id, id, body.nonce);
      if (!ok) return err('Cannot submit nonce: hand not found or cards already dealt');
      return NextResponse.json({ success: true, message: 'Nonce accepted for shuffle verification' });
    }

    default:
      return err('Unknown action. GET /api/casino without params to see all endpoints.');
  }
}

// =============================================================================
// Helper
// =============================================================================
function err(message: string, status = 400) {
  return NextResponse.json({ success: false, error: message }, { status });
}
