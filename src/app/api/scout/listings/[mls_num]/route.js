import { NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { init } from '@/lib/db';

export async function PATCH(req, { params }) {
  await init();
  const { mls_num } = await params;
  if (!mls_num) return NextResponse.json({ error: 'missing mls_num' }, { status: 400 });

  const body = await req.json();
  const { price, address } = body;

  if (price != null) {
    await sql`UPDATE scout_listings SET price = ${Number(price)} WHERE mls_num = ${mls_num}`;
  }
  if (address != null) {
    await sql`UPDATE scout_listings SET address = ${address} WHERE mls_num = ${mls_num}`;
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(req, { params }) {
  await init();
  const { mls_num } = await params;
  if (!mls_num) return NextResponse.json({ error: 'missing mls_num' }, { status: 400 });

  // Only allow deleting manually-added entries
  const { rows } = await sql`SELECT source FROM scout_listings WHERE mls_num = ${mls_num}`;
  if (!rows.length) return NextResponse.json({ error: 'not found' }, { status: 404 });
  if (rows[0].source !== 'manual') {
    return NextResponse.json({ error: 'only manual entries can be deleted' }, { status: 403 });
  }

  await sql`DELETE FROM scout_marks WHERE mls_num = ${mls_num}`;
  await sql`DELETE FROM scout_listings WHERE mls_num = ${mls_num}`;
  return NextResponse.json({ ok: true });
}
