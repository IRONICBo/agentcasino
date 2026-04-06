import { NextRequest, NextResponse } from 'next/server';
import { autoScaleDown, evictStalePlayers } from '@/lib/room-manager';
import { loadAllRoomStates } from '@/lib/casino-db';

/**
 * Vercel Cron Job — runs every 10 minutes.
 * 1. Evicts stale (ghost) players from all rooms.
 * 2. Scales down empty tables.
 */
export async function GET(req: NextRequest) {
  // Vercel Cron sends Authorization: Bearer <CRON_SECRET> automatically.
  // If CRON_SECRET is set, enforce it. If not, allow Vercel's own cron calls through.
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get('authorization');
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
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
