import { NextResponse } from 'next/server';

import { query } from '@core/db/pool';

export const dynamic = 'force-dynamic';

/** Load balancer probe. Checks the database round trip, not just that the process is up. */
export async function GET() {
  try {
    await query('SELECT 1');
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ ok: false, error: (error as Error).message }, { status: 503 });
  }
}
