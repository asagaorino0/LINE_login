// app/api/line/route.ts
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { Client, type FlexMessage } from "@line/bot-sdk";
import { getLineSecretsByIdContainer, getLinksByIdContainer } from "@/lib/cosmos";
import { open } from "@/lib/crypto/seal";
import type { EncPack } from "@/lib/crypto/seal";
import { verify } from "@/lib/linkSign";

/* ========= types ========= */
type SecretsDoc = { id: string; enc: EncPack };
type Secrets = { channelSecret: string; channelAccessToken: string; liffId?: string };

type Body = {
  userId?: string;
  message?: string;
  type?: "text" | "card";
  formUrl?: string;
  title?: string;
  desc?: string;        // ★ 追加
  adminId?: string;
  // 署名方式
  aid?: string;
  formId?: string;
  exp?: number;
  sig?: string;

  // ✅ 短縮リンク方式
  lid?: string;
};

const UID_RE = /^U[0-9a-f]{32,}$/i;

/* ========= CORS ========= */
function cors(req: NextRequest) {
  const origin = req.headers.get("origin") ?? "*";
  return {
    "Access-Control-Allow-Origin": origin,
    Vary: "Origin",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
    "Access-Control-Allow-Headers": "content-type",
  } as const;
}
export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: cors(req) });
}
const ok = (req: NextRequest, body: any, status = 200) => NextResponse.json(body, { status, headers: cors(req) });
const fail = (req: NextRequest, body: any, status = 500) => NextResponse.json(body, { status, headers: cors(req) });

/* ========= aid の解決: lid → 署名 → allowlist → cookie.uid ========= */
async function resolveAdminId(
  req: NextRequest,
  bodyAdminId?: string,
  signed?: { aid?: string; formId?: string; exp?: number; sig?: string },
  lid?: string,
): Promise<string> {
  // 0) ✅ lid 最優先（Cosmos の linksById から参照）
  if (lid) {
    const c = getLinksByIdContainer();
    const { resource } = await c.item(lid, lid).read<any>();
    if (!resource) { const e = new Error("LID_NOT_FOUND"); (e as any).status = 404; throw e; }
    if (resource.disabled) { const e = new Error("LID_DISABLED"); (e as any).status = 403; throw e; }
    const now = Math.floor(Date.now() / 1000);
    if (resource.expiresAt && resource.expiresAt > 0 && resource.expiresAt < now) {
      const e = new Error("LID_EXPIRED"); (e as any).status = 410; throw e;
    }
    return resource.aid as string;
  }

  // 1) 署名方式
  if (signed?.aid && signed?.formId && signed?.exp && signed?.sig) {
    const v = verify(signed.aid, signed.formId, Number(signed.exp), signed.sig);
    if (!v) { const e = new Error("SIG_INVALID"); (e as any).status = 401; throw e; }
    return signed.aid;
  }

  // 2) allowlist
  const allow = (process.env.LINE_ADMIN_IDS ?? "").split(",").map(s => s.trim()).filter(Boolean);
  if (bodyAdminId && allow.length && allow.includes(bodyAdminId)) return bodyAdminId;

  // 3) cookie.uid
  const jar = await cookies();
  const uid = jar.get("uid")?.value ?? null;
  if (uid) return uid;

  const e = new Error("NO_ADMIN_ID"); (e as any).status = 401; throw e;
}

/* ========= Cosmos から資格復号 ========= */
async function loadSecretsByAdminId(adminId: string): Promise<Secrets> {
  const c = getLineSecretsByIdContainer();
  const { resource } = await c.item(adminId, adminId).read<SecretsDoc>();
  if (!resource) { const e = new Error("NO_SECRETS_DOC"); (e as any).status = 404; throw e; }
  const obj = open(resource.enc) as Secrets;
  if (!obj?.channelAccessToken || !obj?.channelSecret) {
    const e = new Error("INVALID_SECRETS_DOC"); (e as any).status = 422; throw e;
  }
  return obj;
}

/* ========= Flexメッセージ（安全版：余計なプロパティ無し） ========= */
function buildFlexCard(formUrl: string, title?: string, desc?: string): FlexMessage {
  return {
    type: "flex",
    altText: title ? `【フォーム】${title}` : "Googleフォーム",
    contents: {
      type: "bubble",
      header: {
        type: "box", layout: "vertical",
        contents: [{ type: "text", text: title ?? "Googleフォーム", weight: "bold", size: "md", wrap: true }]
      },
      body: {
        type: "box", layout: "vertical", spacing: "sm",
        contents: [
          { type: "text", text: desc ?? "フォームに回答してください。", wrap: true, size: "sm", color: "#555" }
        ]
      },
      footer: {
        type: "box", layout: "vertical", spacing: "sm",
        contents: [
          { // フォームを開く
            type: "button", style: "primary",
            action: { type: "uri", label: "フォームを開く", uri: formUrl }
          },
          { // 回答済み通知
            type: "button", style: "secondary",
            action: { type: "message", label: "回答済を通知", text: "申し込みフォーム回答済み" }
          }
        ]
      }
    }
  };
}


/* ========= メイン ========= */
export async function POST(req: NextRequest) {
  try {
    const { userId, message, type, formUrl, title, desc, adminId, aid, formId, exp, sig, lid } =
      (await req.json()) as Body;

    // 受信ログ（機微は伏せる）
    console.log("[/api/line] recv", {
      type,
      hasMsg: Boolean(message),
      hasFormUrl: Boolean(formUrl),
      userId: userId ? userId.slice(0, 6) + "…" : null,
      via: lid ? "lid" : (aid && formId && exp && sig ? "signed" : (adminId ? "allowlist" : "cookie")),
    });

    // バリデーション
    if (!userId) return fail(req, { success: false, code: "NO_USER_ID", message: "userId is required" }, 400);
    if (!UID_RE.test(userId)) return fail(req, { success: false, code: "BAD_UID", message: "Invalid LINE user ID format" }, 400);

    // aid 解決
    const resolvedAdminId = await resolveAdminId(req, adminId, { aid, formId, exp, sig }, lid);
    console.log("[/api/line] resolved admin:", resolvedAdminId.slice(0, 6) + "…");

    // 資格ロード
    const { channelAccessToken, channelSecret } = await loadSecretsByAdminId(resolvedAdminId);
    const client = new Client({ channelAccessToken, channelSecret });

    // 送信
    if (type === "card" && formUrl) {
      const flex = buildFlexCard(formUrl, title, desc);
      try {
        await client.pushMessage(userId, flex);
        return ok(req, { success: true });
      } catch (err: any) {
        // LINEのエラー本文をそのまま返す（デバッグしやすく）
        const detail =
          err?.originalError?.response?.data ??
          err?.response?.data ??
          err?.data ??
          err?.message ??
          String(err);
        console.error("LINE push error detail:", detail);

        // フォールバック（到達確認用）
        try { await client.pushMessage(userId, { type: "text", text: `${title ?? "フォーム"}\n${formUrl}` }); } catch { /* noop */ }

        return fail(req, { success: false, code: "LINE_400", detail }, 400);
      }
    }

    if (!message) return fail(req, { success: false, code: "NO_MESSAGE", message: "message is required (for text type)" }, 400);
    await client.pushMessage(userId, { type: "text", text: message });
    return ok(req, { success: true });
  } catch (error: any) {
    const status = error?.status ?? error?.statusCode ?? 500;
    const map = {
      NO_ADMIN_ID: "NO_ADMIN_ID",
      NO_SECRETS_DOC: "NO_SECRETS_DOC",
      INVALID_SECRETS_DOC: "INVALID_SECRETS_DOC",
      LID_NOT_FOUND: "LID_NOT_FOUND",
      LID_DISABLED: "LID_DISABLED",
      LID_EXPIRED: "LID_EXPIRED",
      SIG_INVALID: "SIG_INVALID",
    } as const;
    const code = map[error?.message as keyof typeof map] ?? "SEND_FAILED";
    console.error("❌ /api/line failed:", { code, status, detail: String(error?.message ?? error) });
    return fail(
      req,
      {
        success: false,
        code,
        message:
          code === "NO_ADMIN_ID"
            ? "Admin not specified (signed params, lid, or login cookie required)"
            : code === "NO_SECRETS_DOC"
              ? "No LINE credentials registered for the admin."
              : code === "INVALID_SECRETS_DOC"
                ? "Broken LINE credentials document."
                : code === "LID_NOT_FOUND"
                  ? "Short link not found."
                  : code === "LID_DISABLED"
                    ? "Short link disabled."
                    : code === "LID_EXPIRED"
                      ? "Short link expired."
                      : code === "SIG_INVALID"
                        ? "Signed params invalid."
                        : "Failed to send message",
      },
      status,
    );
  }
}
