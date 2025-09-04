export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getLineSecretsByIdContainer } from "@/lib/cosmos";
import { seal, open } from "@/lib/crypto/seal";
import type { EncPack } from "@/lib/crypto/seal";

/** ====== types ====== */
type SecretsDoc = {
  id: string;            // 主キー (例: "Uxxxx#@basic_id" / 旧: "Uxxxx")
  aid: string;           // 管理者のLINE UID
  basicId?: string | null;
  channelName?: string | null;
  enc: EncPack;          // { channelSecret, channelAccessToken, liffId } を暗号化
  createdAt: number;
  updatedAt: number;
};

type SaveBody = {
  // 既存変更: 基本的には basicId と channelName で識別しやすく
  basicId?: string | null;           // 例: "@abcd1234"（ボットのベーシックID）
  channelName?: string | null;       // 例: 管理画面表示用の任意名
  channelSecret: string;
  channelAccessToken: string;
  liffId?: string | null;
  // 既存アイテム更新用（省略時は aid + basicId で新規Upsert）
  id?: string;
};

/** ====== helpers ====== */
function unauthorized() {
  return NextResponse.json({ ok: false, code: "NO_ADMIN_ID" }, { status: 401 });
}
const ok = (body: any, init?: number) => NextResponse.json(body, { status: init ?? 200 });

/** aid は cookie(uid) から取得（管理UIは /api/line-admin で先にセット） */
async function getAidFromCookie(): Promise<string | null> {
  const jar = await cookies();
  return jar.get("uid")?.value ?? null;
}

/** ====== GET ======
 *  - /api/line-secrets?mine=1  … 自分(aid)のチャンネル一覧（機微は返さない）
 *  - /api/line-secrets?id=...  … 1件取得（復号して返す：管理UIの編集フォーム用）
 */
// app/api/line-secrets/route.ts
export async function GET(req: NextRequest) {
  try {
    const jar = await cookies();
    const uid = jar.get("uid")?.value || "";
    if (!uid) return NextResponse.json({ ok: false, code: "NO_ADMIN_ID" }, { status: 401 });

    const sp = new URL(req.url).searchParams;
    const idParam = sp.get("id");

    const c = getLineSecretsByIdContainer();

    // ① id指定 → 復号して1件返す
    if (idParam) {
      const { resource } = await c.item(idParam, idParam).read<SecretsDoc>();
      if (!resource) return NextResponse.json({ ok: false, code: "NOT_FOUND" }, { status: 404 });
      const sec = open(resource.enc) as { channelSecret: string; channelAccessToken: string; liffId?: string | null };
      return NextResponse.json({
        ok: true,
        doc: {
          id: resource.id,
          aid: resource.aid,
          basicId: resource.basicId ?? null,
          channelName: resource.channelName ?? null,
          ...sec,
        },
      });
    }

    // ② 一覧（mine=1 が無くても cookie があれば返す）
    const query = {
      query: `
        SELECT c.id, c.aid, c.basicId, c.channelName, c.createdAt, c.updatedAt
        FROM c
        WHERE c.aid = @aid                  -- 新ドキュメント
           OR c.id = @aid                   -- 旧: id=aid だけのもの
           OR STARTSWITH(c.id, @prefix)     -- 旧/新: id="aid#@basicId"
      `,
      parameters: [
        { name: "@aid", value: uid },
        { name: "@prefix", value: `${uid}#` },
      ],
    };

    const { resources } = await c.items
      .query<SecretsDoc>(query)
      .fetchAll();
    return NextResponse.json({ ok: true, items: resources ?? [] });
  } catch (e) {
    console.error("GET /api/line-secrets failed:", e);
    return NextResponse.json({ ok: false, code: "LINE_SECRETS_GET_FAILED" }, { status: 500 });
  }
}


/** ====== POST ======
 * 新規/更新（id が無い場合は aid + basicId で新規 upsert）
 */
export async function POST(req: NextRequest) {
  try {
    const aid = await getAidFromCookie();
    if (!aid) return unauthorized();
    const body = (await req.json()) as SaveBody;
    if (!body.channelAccessToken || !body.channelSecret) {
      return NextResponse.json({ ok: false, code: "MISSING_FIELDS" }, { status: 400 });
    }
    // ▼ 正規化（"xxxx" → "@xxxx"）
    console.log(body.liffId)
    let basicId =
      body.liffId && body.liffId.trim()
        ? (body.liffId.trim().startsWith("@") ? body.liffId.trim() : `@${body.liffId.trim()}`)
        : null;

    // 複数公式LINEに対応するなら basicId は必須にする方が安全
    if (!basicId) {
      return NextResponse.json({ ok: false, code: "BASIC_ID_REQUIRED" }, { status: 400 });
    }
    const now = Date.now();
    const id = body.id ?? `${aid}|${basicId}`;   // ← id を aid#@basicId に固定
    const enc = seal({
      channelAccessToken: body.channelAccessToken,
      channelSecret: body.channelSecret,
      liffId: body.liffId ?? null,
    });
    const doc: SecretsDoc = {
      id,
      aid,
      basicId,                                  // ← ここに確実に @付きで入る
      channelName: body.channelName ?? null,
      enc,
      createdAt: now,
      updatedAt: now,
    };
    await getLineSecretsByIdContainer().items.upsert(doc);
    return NextResponse.json({ ok: true, id });
  } catch (e) {
    console.error("❌ POST /api/line-secrets failed:", e);
    return NextResponse.json({ ok: false, code: "LINE_SECRETS_SAVE_FAILED" }, { status: 500 });
  }
}

