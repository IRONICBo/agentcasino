import { NextRequest, NextResponse } from 'next/server';
import { cleanStaleRoomPlayers } from '@/lib/casino-db';
import { evictGhostPlayers } from '@/lib/room-manager';

/**
 * Vercel Cron Job — runs every 10 minutes.
 * Cleans up stale casino_room_players rows and evicts ghost players from memory.
 *
 * Protected by CRON_SECRET env var (set in Vercel dashboard).
 * Vercel automatically sends Authorization: Bearer <CRON_SECRET> for cron routes.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get('authorization');
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const dbRemoved = await cleanStaleRoomPlayers();
  const memEvicted = await evictGhostPlayers();

  console.log(`[cron] cleanup — DB rows removed: ${dbRemoved}, in-memory evicted: ${memEvicted}`);

  return NextResponse.json({
    ok: true,
    db_rows_removed: dbRemoved,
    memory_evicted: memEvicted,
    ran_at: new Date().toISOString(),
  });
}
