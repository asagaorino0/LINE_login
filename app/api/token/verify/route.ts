import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/token';

export async function POST(req: NextRequest) {
  try {
    const { token } = await req.json();
    const secret = process.env.TOKEN_SECRET || '';
    if (!secret) return NextResponse.json({ ok: false, error: 'NO_SERVER_SECRET' }, { status: 500 });

    const payload = verifyToken(String(token || ''), secret);
    return NextResponse.json({ ok: true, payload });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 400 });
  }
}
