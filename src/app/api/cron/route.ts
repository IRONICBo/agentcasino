import { NextRequest, NextResponse } from 'next/server';
import { autoScaleDown } from '@/lib/room-manager';

/**
 * Vercel Cron Job — runs every 10 minutes.
 * Scales down empty tables.
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

  const tablesRemoved = await autoScaleDown();

  console.log(`[cron] cleanup — tables scaled down: ${tablesRemoved}`);

  return NextResponse.json({
    ok: true,
    tables_scaled_down: tablesRemoved,
    ran_at: new Date().toISOString(),
  });
}
