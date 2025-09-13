export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getLineSecretsByIdContainer, getLinksByIdContainer } from "@/lib/cosmos";
import { open } from "@/lib/crypto/seal";
import type { EncPack } from "@/lib/crypto/seal";
import { verify } from "@/lib/linkSign";

/* ========= types ========= */
type SecretsDoc = { id: string; enc: EncPack };
type Secrets = { channelSecret: string; channelAccessToken: string; liffId?: string | null };

type Body = {
  // 署名パラメータ（任意）
  aid?: string;
  formId?: string;
  exp?: number;
  sig?: string;
  // 短縮リンク（任意）
  lid?: string;
  // 管理者指定（任意）
  adminId?: string;
  basicId?: string | null;
};

/* ========= CORS ========= */
function cors(req: NextRequest) {
  const origin = req.headers.get("origin");
  const host = req.headers.get("host") || "";
  // 信頼できるオリジンのみ許可
  const allowedOrigins = [
    `https://${host}`,
    `http://${host}`, // 開発環境用
    process.env.NEXT_PUBLIC_BASE_URL,
    process.env.APP_ORIGIN,
  ].filter(Boolean);
  const isAllowed = origin && allowedOrigins.some(allowed =>
    allowed && (allowed === origin || origin.startsWith(allowed))
  );
  return {
    "Access-Control-Allow-Origin": isAllowed ? origin : "none",
    "Access-Control-Allow-Credentials": isAllowed ? "true" : "false",
    Vary: "Origin",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "content-type",
  } as const;
}

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: cors(req) });
}

const ok = (req: NextRequest, body: any, status = 200) => NextResponse.json(body, { status, headers: cors(req) });
const fail = (req: NextRequest, body: any, status = 500) => NextResponse.json(body, { status, headers: cors(req) });

/* ========= adminKey 解決 ========= */
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

/* ========= GET/POST ハンドラー ========= */
async function handleRequest(req: NextRequest): Promise<NextResponse> {
  try {
    let body: Body = {};

    if (req.method === "POST") {
      body = await req.json();
    } else {
      // GET の場合、URL パラメータから取得
      const url = new URL(req.url);
      body = {
        lid: url.searchParams.get("lid") || undefined,
        aid: url.searchParams.get("aid") || undefined,
        formId: url.searchParams.get("formId") || undefined,
        exp: url.searchParams.get("exp") ? Number(url.searchParams.get("exp")) : undefined,
        sig: url.searchParams.get("sig") || undefined,
        adminId: url.searchParams.get("adminId") || undefined,
        basicId: url.searchParams.get("basicId") || undefined,
      };
    }
    const { aid, formId, exp, sig, lid, adminId, basicId } = body;
    // 管理者キーを解決
    const adminKey = await resolveAdminKey(
      req,
      adminId,
      { aid, formId, exp, sig },
      lid,
      basicId
    );
    // シークレットを取得
    const secrets = await loadSecretsByAdminKey(adminKey);
    // LIFF ID が存在しない場合は404
    if (!secrets.liffId) {
      return fail(req, { success: false, code: "NO_LIFF_ID" }, 404);
    }
    // LIFF ID のみを返す（セキュリティのため他の情報は返さない）
    return ok(req, { success: true, liffId: secrets.liffId });
  } catch (e: any) {
    console.error("❌ /api/line-config error:", e);
    const status = e?.status ?? 500;
    const code = e?.message ?? "CONFIG_FETCH_FAILED";
    return fail(req, { success: false, code }, status);
  }
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  return handleRequest(req);
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  return handleRequest(req);
}