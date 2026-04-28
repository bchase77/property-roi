import { NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { init } from '@/lib/db';

// GET /api/scout/relisting-log?mls_num=XXX
export async function GET(req) {
  await init();
  const { searchParams } = new URL(req.url);
  const mls_num = searchParams.get('mls_num');
  if (!mls_num) return NextResponse.json({ error: 'mls_num required' }, { status: 400 });

  const { rows } = await sql`
    SELECT event, event_at, absence_days
    FROM scout_relisting_log
    WHERE mls_num = ${mls_num}
    ORDER BY event_at ASC
  `;
  return NextResponse.json(rows);
}
