// src/app/api/actuals/bulk/route.js
import { NextResponse } from 'next/server';
import { init, addActualsBulk } from '@/lib/db';

export async function POST(req) {
  await init();
  const { rows } = await req.json(); // validate in real code
  await addActualsBulk(rows);
  return NextResponse.json({ ok: true, count: rows.length });
}

