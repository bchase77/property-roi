import { NextResponse } from "next/server";
import { sql } from "@vercel/postgres";

export async function GET() {
  await sql`ALTER TABLE properties
            ADD COLUMN IF NOT EXISTS initial_investment NUMERIC NOT NULL DEFAULT 0;`;
  return NextResponse.json({ ok: true });
}

