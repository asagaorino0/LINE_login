// app/r/[token]/route.ts
import { NextResponse } from 'next/server';
import { verifyToken } from '../../../lib/token'; // ← あなたのパスに合わせて

export async function GET(_req: Request, { params }: any) {
  const token = params?.token;
  if (!token) {
    return NextResponse.json({ ok: false, code: 'NO_TOKEN' }, { status: 400 });
  }

  const secret = process.env.JWT_SECRET; // ← サーバー専用の環境変数
  if (!secret) {
    return NextResponse.json({ ok: false, code: 'NO_JWT_SECRET' }, { status: 500 });
  }

  try {
    const payload = await verifyToken(token, secret);
    return NextResponse.json({ ok: true, payload });
  } catch {
    return NextResponse.json({ ok: false, code: 'INVALID_TOKEN' }, { status: 400 });
  }
}
