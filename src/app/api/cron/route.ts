import { NextRequest, NextResponse } from 'next/server';
import { autoScaleDown, evictStalePlayers } from '@/lib/room-manager';
import { loadAllRoomStates } from '@/lib/casino-db';

/**
 * Vercel Cron Job — runs every 10 minutes.
 * 1. Evicts stale (ghost) players from all rooms.
 * 2. Scales down empty tables.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 });
  }
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Sweep stale players from all rooms
  const allStates = await loadAllRoomStates();
  let totalEvicted = 0;
  for (const [roomId] of allStates) {
    const evicted = await evictStalePlayers(roomId);
    totalEvicted += evicted.length;
  }

  const tablesRemoved = await autoScaleDown();

  console.log(`[cron] cleanup — stale players evicted: ${totalEvicted}, tables scaled down: ${tablesRemoved}`);

  return NextResponse.json({
    ok: true,
    stale_players_evicted: totalEvicted,
    tables_scaled_down: tablesRemoved,
    ran_at: new Date().toISOString(),
  });
}
