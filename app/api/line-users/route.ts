//app/api/line-users/route.ts

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { storage } from '@/server/storage';

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
    // 既存ユーザーをチェックして、upsert操作を実行
    const existingUser = await storage.getLineUser(lineUserId);
    let lineUser;
    if (existingUser) {
      // ユーザーが存在する場合は更新
      lineUser = await storage.updateLineUser(lineUserId, {
        displayName: body.displayName || existingUser.displayName,
        pictureUrl: body.pictureUrl || existingUser.pictureUrl
      });
    } else {
      // ユーザーが存在しない場合は作成
      lineUser = await storage.createLineUser({
        lineUserId,
        displayName: body.displayName || '',
        pictureUrl: body.pictureUrl
      });
    }
    return NextResponse.json({ ok: true, id: lineUser?.lineUserId ?? lineUserId });
  } catch (err: any) {
    console.error('line-users upsert failed', err);
    return NextResponse.json(
      { ok: false, error: err?.message ?? 'unknown error' },
      { status: 500 }
    );
  }
}
