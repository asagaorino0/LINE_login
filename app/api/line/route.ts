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
type Secrets = { channelSecret: string; channelAccessToken: string; liffId?: string | null };

type Body = {
  userId?: string;
  message?: string;
  type?: "text" | "card";
  formUrl?: string;
  title?: string;
  desc?: string;
  // （任意）管理者の明示指定/補助
  adminId?: string;        // allowlist 用
  basicId?: string | null; // allowlist / cookie 経由時に使う
  // 署名パラメータ（任意）
  aid?: string;
  formId?: string;
  exp?: number;
  sig?: string;
  // 短縮リンク（任意）
  lid?: string;
};

type AdminCtx = { aid: string; basicId?: string | null };

const UID_RE = /^U[0-9a-f]{32,}$/i;

/* ========= CORS ========= */
function cors(req: NextRequest) {
  const origin = req.headers.get("origin") ?? "*";
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Credentials": "true",
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

/* ========= adminKey 解決: lid → 署名 → allowlist → cookie ========= */
async function resolveAdminKey(
  req: NextRequest,
  bodyAdminId?: string,
  signed?: { aid?: string; formId?: string; exp?: number; sig?: string },
  lid?: string,
  bodyBasicId?: string | null,
): Promise<string> {
  // 0) lid 最優先（linksById から取得）
  if (lid) {
    const { resource } = await getLinksByIdContainer()
      .item(lid, lid)
      .read<{ aid: string; basicId?: string | null; expiresAt?: number; disabled?: boolean }>();
    if (!resource) { const e = new Error("LID_NOT_FOUND"); (e as any).status = 404; throw e; }
    if (resource.disabled) { const e = new Error("LID_DISABLED"); (e as any).status = 403; throw e; }
    const now = Math.floor(Date.now() / 1000);
    if (resource.expiresAt && resource.expiresAt > 0 && resource.expiresAt < now) {
      const e = new Error("LID_EXPIRED"); (e as any).status = 410; throw e;
    }
    return resource.basicId ? `${resource.aid}|${resource.basicId}` : resource.aid;
  }
  // 1) 署名方式（aid, formId, exp, sig）
  if (signed?.aid && signed?.formId && signed?.exp && signed?.sig) {
    const v = verify(signed.aid, signed.formId, Number(signed.exp), signed.sig);
    if (!v) { const e = new Error("SIG_INVALID"); (e as any).status = 401; throw e; }
    // a) body.basicId が来ていればそれを使う
    const b1 = normalizeBasicId(bodyBasicId);
    if (b1) return `${signed.aid}|${b1}`;
    // b) linksById から aid+formId で basicId を補完（一番新しいものを採用）
    const { resources } = await getLinksByIdContainer().items.query<{ basicId?: string | null }>(
      {
        query: "SELECT TOP 1 c.basicId FROM c WHERE c.aid = @aid AND c.formId = @formId ORDER BY c.createdAt DESC",
        parameters: [{ name: "@aid", value: signed.aid }, { name: "@formId", value: signed.formId }],
      }
    ).fetchAll();
    const b2 = normalizeBasicId(resources?.[0]?.basicId ?? null);
    return b2 ? `${signed.aid}|${b2}` : signed.aid;
  }
  // 2) allowlist
  const allow = (process.env.LINE_ADMIN_IDS ?? "")
    .split(",").map(s => s.trim()).filter(Boolean);
  if (bodyAdminId && allow.length && allow.includes(bodyAdminId)) {
    const b = normalizeBasicId(bodyBasicId);
    return b ? `${bodyAdminId}|${b}` : bodyAdminId;
  }
  // 3) cookie.uid
  const uid = (await cookies()).get("uid")?.value ?? null;
  if (uid) {
    const b = normalizeBasicId(bodyBasicId);
    return b ? `${uid}|${b}` : uid;
  }
  const e = new Error("NO_ADMIN_ID"); (e as any).status = 401; throw e;
}

/** "@xxx" を保証。Cosmos id の NG 文字（/ \ ? #）を弾く */
function normalizeBasicId(b: string | null | undefined): string | null {
  const x = (b ?? "").trim();
  if (!x) return null;
  const at = x.startsWith("@") ? x : `@${x}`;
  if (/[\/\\?#]/.test(at)) { const e = new Error("BAD_BASIC_ID"); (e as any).status = 400; throw e; }
  return at;
}

/* ========= Secrets 取得 ========= */
async function loadSecretsByAdminKey(adminKey: string): Promise<Secrets> {
  const c = getLineSecretsByIdContainer();
  // まずはそのまま read
  const tryId = async (id: string) => {
    const { resource } = await c.item(id, id).read<SecretsDoc>();
    if (!resource) return null;
    const dec = open(resource.enc) as Secrets;
    if (!dec?.channelAccessToken || !dec?.channelSecret) {
      const e = new Error("INVALID_SECRETS_DOC"); (e as any).status = 422; throw e;
    }
    return dec;
  };
  if (adminKey.includes("|")) {
    const got = await tryId(adminKey);
    if (got) return got;
  } else {
    const got = await tryId(adminKey);
    if (got) return got;
    // aid しか無い → aid|@xxxx が 1 件だけならそれを使う
    const { resources } = await c.items
      .query<{ id: string; enc: EncPack }>(
        { query: "SELECT c.id, c.enc FROM c WHERE STARTSWITH(c.id, @p)", parameters: [{ name: "@p", value: `${adminKey}|` }] }
      )
      .fetchAll();
    if ((resources?.length ?? 0) === 1) {
      const dec = open(resources![0].enc) as Secrets;
      if (!dec?.channelAccessToken || !dec?.channelSecret) {
        const e = new Error("INVALID_SECRETS_DOC"); (e as any).status = 422; throw e;
      }
      return dec;
    }
    if ((resources?.length ?? 0) > 1) {
      const e = new Error("AMBIGUOUS_ADMIN"); (e as any).status = 409; throw e;
    }
  }
  const e = new Error("NO_SECRETS_DOC"); (e as any).status = 404; throw e;
}

/* ========= Flexメッセージ ========= */
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
          { type: "text", text: desc ?? "フォームに回答してください。", wrap: true, size: "sm", color: "#555555" } // ← 6桁
        ]
      },
      footer: {
        type: "box", layout: "vertical", spacing: "sm",
        contents: [
          // { type: "button", style: "primary", action: { type: "uri", label: "フォームを開く", uri: formUrl } },
          { type: "button", style: "secondary", action: { type: "message", label: "回答済を通知", text: "申し込みフォーム回答済み" } }
        ]
      }
    }
  };
}

/* ========= メイン ========= */
export async function POST(req: NextRequest) {
  try {
    const { userId, message, type, formUrl, title, desc, lid, adminId, basicId, aid, formId, exp, sig } =
      (await req.json()) as Body;
    // console.log(
    //   "lid********************************************************************", lid
    // )
    // // ログ（機微は伏せる）
    // console.log("[/api/line] recv", {
    //   type,
    //   hasMsg: Boolean(message),
    //   hasFormUrl: Boolean(formUrl),
    //   userId: userId ? userId.slice(0, 6) + "…" : null,
    //   via: lid ? "lid" : (aid && formId && exp && sig ? "signed" : (adminId ? "allowlist" : "cookie")),
    //   basicId: basicId
    // });
    // 入力チェック
    if (!userId) return fail(req, { success: false, code: "NO_USER_ID" }, 400);
    if (!UID_RE.test(userId)) return fail(req, { success: false, code: "BAD_UID" }, 400);

    // adminKey ＝ “aid” or “aid|@basicId”
    const adminKey = await resolveAdminKey(req, adminId, { aid, formId, exp, sig }, lid, basicId ?? null);
    console.log("[/api/line] adminKey:", adminKey.includes("|")
      ? adminKey.split("|")[0].slice(0, 6) + "…|…"
      : adminKey.slice(0, 6) + "…", adminKey, basicId);
    // 認証情報読込
    const { channelAccessToken, channelSecret } = await loadSecretsByAdminKey(adminKey);
    const client = new Client({ channelAccessToken, channelSecret });

    // push の前で
    try {
      await client.getProfile(userId);
    } catch (e: any) {
      console.error("getProfile failed (not friend / wrong channel):",
        e?.originalError?.response?.data || e?.message);
      return fail(req, { success: false, code: "NOT_FRIEND_OR_WRONG_UID" }, 409);
    }
    // 送信
    if (type === "card" && formUrl) {
      const flex = buildFlexCard(formUrl, title, desc);
      try {
        await client.pushMessage(userId, flex);
        return ok(req, { success: true });
      } catch (err: any) {
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
    if (!message) return fail(req, { success: false, code: "NO_MESSAGE" }, 400);
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
      BAD_BASIC_ID: "BAD_BASIC_ID",
    } as const;
    const code = map[error?.message as keyof typeof map] ?? "SEND_FAILED";
    console.error("❌ /api/line failed:", { code, status, detail: String(error?.message ?? error) });
    return fail(req, { success: false, code }, status);
  }
}
