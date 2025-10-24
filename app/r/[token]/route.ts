import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/token';

// 既存のリンク取得（entry と formUrl にアクセスしたい）
async function fetchLinkByLid(lid: string) {
  const r = await fetch(`${process.env.BASE_URL}/api/links/${encodeURIComponent(lid)}`, {
    cache: 'no-store',
  });
  if (!r.ok) return null;
  const j = await r.json();
  return j?.ok ? j : null;
}

// Google Forms の view URL に整形（あなたの GoogleFormsManager に合わせて調整）
function toViewUrl(u: string) {
  try {
    const url = new URL(u);
    // もし already view ならそのまま
    return url.toString();
  } catch {
    return u;
  }
}

function ensureEntryFormat(s: string) {
  if (!s) return '';
  if (s.startsWith('entry.')) return s;
  return `entry.${s}`;
}

export async function GET(
  req: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
    const token = params.token || '';
    const secret = process.env.TOKEN_SECRET || '';
    if (!secret) {
      return NextResponse.json({ ok: false, error: 'NO_SERVER_SECRET' }, { status: 500 });
    }

    const payload = verifyToken(token, secret);
    const { uid, lid } = payload;

    const link = await fetchLinkByLid(lid);
    if (!link) {
      return NextResponse.json({ ok: false, error: 'LID_NOT_FOUND' }, { status: 404 });
    }

    const entry = ensureEntryFormat(String(link.entry || ''));
    const formUrl = String(link.formUrl || '');
    if (!entry || !formUrl) {
      return NextResponse.json({ ok: false, error: 'LINK_MISSING_ENTRY_OR_FORM' }, { status: 400 });
    }

    const base = toViewUrl(formUrl).split('?')[0];
    const sp = new URLSearchParams();
    sp.set('usp', 'pp_url');
    sp.set(entry, uid);

    const prefill = `${base}?${sp.toString()}`;
    // 302 で Google フォームへ
    return NextResponse.redirect(prefill, 302);
  } catch (e: any) {
    const msg = String(e?.message || e);
    const status =
      msg === 'TOKEN_SIGNATURE' ? 401 :
        msg === 'TOKEN_EXPIRED' ? 401 :
          msg === 'TOKEN_NOT_BEFORE' ? 401 :
            400;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
