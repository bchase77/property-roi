import { NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { init } from '@/lib/db';

export async function GET() {
  await init();
  const { rows } = await sql`
    SELECT id, message, created_at
    FROM scout_activity_log
    ORDER BY created_at DESC
    LIMIT 200;
  `;
  return NextResponse.json(rows);
}

export async function POST(req) {
  await init();
  const { message } = await req.json();
  if (!message) return NextResponse.json({ error: 'message required' }, { status: 400 });
  await sql`INSERT INTO scout_activity_log (message) VALUES (${message})`;
  return NextResponse.json({ ok: true });
}
