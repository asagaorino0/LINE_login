export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getLineSecretsByIdContainer } from "@/lib/cosmos";
import { open, seal } from "@/lib/crypto/seal";
import type { EncPack } from "@/lib/crypto/seal";

// 管理者のみアクセス可能
async function checkAdminAccess(req: NextRequest): Promise<boolean> {
  const cookieStore = await cookies();
  const uid = cookieStore.get("uid")?.value;
  if (!uid) return false;
  // 環境変数で管理者リストをチェック
  const adminIds = (process.env.LINE_ADMIN_IDS ?? "")
    .split(",").map(s => s.trim()).filter(Boolean);
  return adminIds.includes(uid);
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    // 管理者チェック
    if (!await checkAdminAccess(req)) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    // CSRF保護：同一オリジンチェック
    const origin = req.headers.get("origin");
    const host = req.headers.get("host");
    if (origin && host && !origin.includes(host)) {
      return NextResponse.json({ success: false, error: "Cross-origin request not allowed" }, { status: 403 });
    }
    const body = await req.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 });
    }
    const { adminKey, liffId } = body as { adminKey?: string; liffId?: string };
    if (!adminKey || !liffId) {
      return NextResponse.json({
        success: false,
        error: "adminKey and liffId are required"
      }, { status: 400 });
    }
    // adminKey バリデーション（Cosmos NG文字チェック）
    if (/[\/\\?#]/.test(adminKey)) {
      return NextResponse.json({
        success: false,
        error: "Invalid adminKey format"
      }, { status: 400 });
    }
    // LIFF ID フォーマット検証（LINE公式フォーマットに準拠）
    if (!liffId.match(/^\d{6,}-[A-Za-z0-9_-]+$/)) {
      return NextResponse.json({
        success: false,
        error: "Invalid LIFF ID format"
      }, { status: 400 });
    }
    const container = getLineSecretsByIdContainer();
    // 既存のドキュメントを取得
    const { resource } = await container.item(adminKey, adminKey).read<{
      id: string;
      enc: EncPack;
    }>();
    if (!resource) {
      return NextResponse.json({
        success: false,
        error: "Secrets document not found"
      }, { status: 404 });
    }
    // 既存の暗号化データを復号
    const existingSecrets = open(resource.enc) as {
      channelSecret: string;
      channelAccessToken: string;
      liffId?: string | null;
    };
    if (!existingSecrets?.channelSecret || !existingSecrets?.channelAccessToken) {
      return NextResponse.json({
        success: false,
        error: "Invalid existing secrets document"
      }, { status: 422 });
    }
    // liffId を追加/更新
    const updatedSecrets = {
      ...existingSecrets,
      liffId: liffId
    };
    // 再暗号化
    const newEncPack = seal(updatedSecrets);
    // ドキュメント更新（既存フィールドを保持）
    await container.item(adminKey, adminKey).replace({
      ...resource,
      enc: newEncPack
    });
    return NextResponse.json({
      success: true,
      message: `LIFF ID updated for adminKey: ${adminKey}`
    });
  } catch (error: any) {
    console.error("Migration error:", error);
    return NextResponse.json({
      success: false,
      error: error?.message || "Migration failed"
    }, { status: 500 });
  }
}

// 既存のドキュメント一覧を取得（管理用）
export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    // 管理者チェック
    if (!await checkAdminAccess(req)) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    const container = getLineSecretsByIdContainer();
    // 全ドキュメントのIDとliffIdの有無を取得
    const { resources } = await container.items.query<{
      id: string;
      enc: EncPack;
    }>({
      query: "SELECT c.id, c.enc FROM c"
    }).fetchAll();
    const documentStatus = resources.map(doc => {
      try {
        const secrets = open(doc.enc) as { liffId?: string | null };
        return {
          id: doc.id,
          hasLiffId: !!secrets?.liffId,
          liffId: secrets?.liffId ? `${secrets.liffId.slice(0, 10)}...` : null
        };
      } catch (e) {
        return {
          id: doc.id,
          hasLiffId: false,
          error: "Decryption failed"
        };
      }
    });
    return NextResponse.json({
      success: true,
      documents: documentStatus,
      total: documentStatus.length,
      withLiffId: documentStatus.filter(doc => doc.hasLiffId).length
    });
  } catch (error: any) {
    console.error("Status check error:", error);
    return NextResponse.json({
      success: false,
      error: error?.message || "Status check failed"
    }, { status: 500 });
  }
}