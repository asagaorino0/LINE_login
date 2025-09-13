///app/api/liff-settings/route.ts
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getLineSecretsByIdContainer } from "@/lib/cosmos";
import { open, seal } from "@/lib/crypto/seal";
import type { EncPack } from "@/lib/crypto/seal";
import { storage } from "@/server/storage";

// 管理者のみアクセス可能（LINE登録ユーザーのみ）
async function checkAdminAccess(req: NextRequest): Promise<boolean> {
  const cookieStore = await cookies();
  const uid = cookieStore.get("uid")?.value;
  console.log("🔍 Debug - uid from cookie:", uid);
  if (!uid) {
    console.log("❌ No uid cookie found");
    return false;
  }
  // ストレージでLINEユーザーの存在確認
  try {
    const lineUser = await storage.getLineUser(uid);
    console.log("🔍 Debug - lineUser found:", !!lineUser, lineUser ? { id: lineUser.id, lineUserId: lineUser.lineUserId } : null);
    return !!lineUser; // LINE登録済みユーザーなら管理者として認証
  } catch (error) {
    console.error("❌ Admin access check error:", error);
    return false;
  }
}

// CSRF保護
function validateCSRF(req: NextRequest): boolean {
  const origin = req.headers.get("origin");
  const host = req.headers.get("host");
  if (origin && host && !origin.includes(host)) {
    return false;
  }
  return true;
}

// 現在のユーザーIDを取得
async function getCurrentUserId(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get("uid")?.value || null;
}
// LIFF IDフォーマット検証
function validateLiffId(liffId: string): boolean {
  return /^\d{6,}-[A-Za-z0-9_-]+$/.test(liffId);
}
// GET: 現在ユーザーのLIFF ID設定を取得
export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    // 管理者チェック
    if (!await checkAdminAccess(req)) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    const userId = await getCurrentUserId();
    if (!userId) {
      return NextResponse.json({ success: false, error: "User not found" }, { status: 401 });
    }
    const container = getLineSecretsByIdContainer();
    try {
      // ユーザーのドキュメントを取得
      const { resource } = await container.item(userId, userId).read<{
        id: string;
        enc: EncPack;
      }>();
      if (!resource) {
        return NextResponse.json({
          success: true,
          hasLiffId: false
        });
      }
      // 暗号化データを復号
      const secrets = open(resource.enc) as {
        channelSecret?: string;
        channelAccessToken?: string;
        liffId?: string | null;
      };
      return NextResponse.json({
        success: true,
        hasLiffId: !!secrets?.liffId,
        liffId: secrets?.liffId || undefined
      });
    } catch (error: any) {
      // ドキュメントが存在しない場合
      if (error?.code === 404) {
        return NextResponse.json({
          success: true,
          hasLiffId: false
        });
      }
      throw error;
    }
  } catch (error: any) {
    console.error("LIFF settings GET error:", error);
    return NextResponse.json({
      success: false,
      error: error?.message || "Failed to get LIFF settings"
    }, { status: 500 });
  }
}

// POST: LIFF ID設定を保存/更新
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    // 管理者チェック
    if (!await checkAdminAccess(req)) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    // CSRF保護
    if (!validateCSRF(req)) {
      return NextResponse.json({ success: false, error: "Cross-origin request not allowed" }, { status: 403 });
    }
    const userId = await getCurrentUserId();
    if (!userId) {
      return NextResponse.json({ success: false, error: "User not found" }, { status: 401 });
    }
    const body = await req.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 });
    }
    const { liffId } = body as { liffId?: string };
    if (!liffId) {
      return NextResponse.json({
        success: false,
        error: "liffId is required"
      }, { status: 400 });
    }
    // LIFF ID フォーマット検証
    if (!validateLiffId(liffId)) {
      return NextResponse.json({
        success: false,
        error: "Invalid LIFF ID format. Expected format: ######-xxxxxxxxx"
      }, { status: 400 });
    }
    const container = getLineSecretsByIdContainer();
    let resource: any = null;
    try {
      // 既存のドキュメントを取得
      const result = await container.item(userId, userId).read<{
        id: string;
        enc: EncPack;
      }>();
      resource = result.resource;
    } catch (error: any) {
      // 404の場合は新しいドキュメントを作成する
      if (error?.code === 404) {
        resource = null;
      } else {
        throw error;
      }
    }
    let updatedSecrets;
    if (resource) {
      // 既存ドキュメントがある場合は更新
      const existingSecrets = open(resource.enc) as {
        channelSecret?: string;
        channelAccessToken?: string;
        liffId?: string | null;
      };
      updatedSecrets = {
        ...existingSecrets,
        liffId: liffId
      };
      // 再暗号化して更新
      const newEncPack = seal(updatedSecrets);
      await container.item(userId, userId).replace({
        ...resource,
        enc: newEncPack
      });
    } else {
      // 新しいドキュメントを作成（LIFF IDのみ）
      updatedSecrets = {
        liffId: liffId
      };

      const newEncPack = seal(updatedSecrets);
      await container.items.create({
        id: userId,
        enc: newEncPack
      });
    }
    return NextResponse.json({
      success: true,
      message: "LIFF ID settings saved successfully"
    });
  } catch (error: any) {
    console.error("LIFF settings POST error:", error);
    return NextResponse.json({
      success: false,
      error: error?.message || "Failed to save LIFF settings"
    }, { status: 500 });
  }
}