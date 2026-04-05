import { NextRequest, NextResponse } from 'next/server';
import { cleanStaleRoomPlayers } from '@/lib/casino-db';
import { autoScaleDown } from '@/lib/room-manager';

/**
 * Vercel Cron Job — runs every 10 minutes.
 * Cleans up stale casino_room_players rows and scales down empty tables.
 *
 * Protected by CRON_SECRET env var (set in Vercel dashboard).
 * Vercel automatically sends Authorization: Bearer <CRON_SECRET> for cron routes.
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

  const dbRemoved = await cleanStaleRoomPlayers();
  const tablesRemoved = await autoScaleDown();

  console.log(`[cron] cleanup — DB rows: ${dbRemoved}, tables scaled down: ${tablesRemoved}`);

  return NextResponse.json({
    ok: true,
    db_rows_removed: dbRemoved,
    tables_scaled_down: tablesRemoved,
    ran_at: new Date().toISOString(),
  });
}
