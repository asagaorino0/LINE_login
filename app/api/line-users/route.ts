export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getLineUsersContainer } from '@/lib/cosmos';

type LineUserDoc = {
  id: string;              // ← lineUserId をそのまま採用
  lineUserId: string;
  userId: string;          // 互換のため保持（PK が /userId の場合に使われる）
  displayName?: string;
  pictureUrl?: string;
  createdAt: string;
  updatedAt: string;
  // …必要なフィールド
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const lineUserId: string | undefined =
      (body.lineUserId ?? body.userId)?.trim();
    if (!lineUserId) {
      return NextResponse.json(
        { ok: false, error: 'lineUserId (or userId) is required' },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();

    // ★ id に lineUserId を採用。PK が /userId の既存コンテナでも動くよう userId も同値で入れる
    const doc: LineUserDoc = {
      ...body,
      id: lineUserId,
      lineUserId,
      userId: lineUserId,
      createdAt: body?.createdAt ?? now,
      updatedAt: now,
    };

    const container = getLineUsersContainer();

    // ❌ { partitionKey: ... } は不要（渡すと型エラー）
    const { resource } = await container.items.upsert<LineUserDoc>(doc);

    return NextResponse.json({ ok: true, id: resource?.id ?? lineUserId });
  } catch (err: any) {
    console.error('line-users upsert failed', err);
    return NextResponse.json(
      { ok: false, error: err?.message ?? 'unknown error' },
      { status: 500 }
    );
  }
}
