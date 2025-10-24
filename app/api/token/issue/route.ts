import { NextRequest, NextResponse } from 'next/server';
import { makePayload, signToken } from '@/lib/token';
import { getBaseUrl } from '@/lib/getBaseUrl';

// ★ 既存の links 取得に合わせて実装。
//   ここでは /api/links/{lid} を叩いて存在/有効性確認だけ行う想定。
async function fetchLinkByLid(lid: string) {
  const r = await fetch(`${process.env.BASE_URL}/api/links/${encodeURIComponent(lid)}`, {
    cache: 'no-store',
    // 認証が必要なら Cookie/ヘッダを付与する
  });
  if (!r.ok) return null;
  const j = await r.json();
  return j?.ok ? j : null;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const uid = String(body?.uid || '');
    const lid = String(body?.lid || '');

    if (!uid || !lid) {
      return NextResponse.json({ ok: false, error: 'MISSING_PARAMS' }, { status: 400 });
    }

    // lid が正しい/有効か簡易チェック
    const link = await fetchLinkByLid(lid);
    if (!link) {
      return NextResponse.json({ ok: false, error: 'LID_NOT_FOUND' }, { status: 404 });
    }

    const secret = process.env.TOKEN_SECRET || '';
    if (!secret) {
      return NextResponse.json({ ok: false, error: 'NO_SERVER_SECRET' }, { status: 500 });
    }

    const ttl = Number(process.env.TOKEN_TTL_SECONDS || '300'); // 既定5分
    const payload = makePayload(uid, lid, ttl);
    const token = signToken(payload, secret);

    // const base = process.env.BASE_URL?.replace(/\/+$/, '') || '';
    const base = getBaseUrl();
    const redirectUrl = `${base}/r/${encodeURIComponent(token)}`;

    return NextResponse.json({ ok: true, token, redirectUrl, exp: payload.exp });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 });
  }
}
