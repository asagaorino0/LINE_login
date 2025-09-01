// app/api/line-secrets/route.ts
import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import {
  getLineSecretsByIdContainer,
  ensureLineSecretsByIdContainer,
} from "@/lib/cosmos";
import { seal, open, fingerprint } from "@/lib/crypto/seal";
import type { EncPack } from "@/lib/crypto/seal";

export const runtime = "nodejs";

// 送信ペイロード（lineUserId や shopId は不要）
type Payload = {
  liffId?: string;
  channelSecret: string;
  channelAccessToken: string;
};

type Doc = {
  id: string;             // = 管理者の UID（cookieの uid）
  enc: EncPack;           // 暗号化済みブロブ
  rotation: number;
  createdAt: string;
  updatedAt: string;
  createdBy?: string | null;
  updatedBy?: string | null;
};

const requireAdmin = async () => {
  const store = await cookies();
  const isAdmin = store.get("admin")?.value === "1";
  if (!isAdmin) throw new Response("Forbidden", { status: 403 });
};

const originCheck = (req: NextRequest) => {
  const allowed = process.env.ALLOWED_ORIGIN;
  if (!allowed) return;
  const origin = req.headers.get("origin");
  if (origin && origin !== allowed) throw new Response("Bad Origin", { status: 403 });
};

const json = (body: any, init?: ResponseInit) => Response.json(body, init);

/* CORS が必要なら */
export async function OPTIONS(req: NextRequest) {
  const origin = req.headers.get("origin") ?? "*";
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Credentials": "true",
    },
  });
}

export async function GET(req: NextRequest) {
  await requireAdmin();
  originCheck(req);

  if (process.env.NODE_ENV !== "production") {
    await ensureLineSecretsByIdContainer().catch(() => { });
  }

  const store = await cookies();
  const uid = store.get("uid")?.value ?? "";     // ★ id は管理者のUID
  if (!uid) return json({ exists: false });

  const c = getLineSecretsByIdContainer();
  try {
    const { resource } = await c.item(uid, uid).read<Doc>();
    if (!resource) return json({ exists: false });

    let fp = null;
    try {
      const obj = open(resource.enc) as {
        liffId?: string;
        channelSecret: string;
        channelAccessToken: string;
      };
      fp = {
        liffId: obj.liffId ? fingerprint(obj.liffId) : undefined,
        channelSecret: fingerprint(obj.channelSecret),
        channelAccessToken: fingerprint(obj.channelAccessToken),
      };
    } catch { }

    return json({
      exists: true,
      updatedAt: resource.updatedAt,
      rotation: resource.rotation,
      fingerprints: fp,
    });
  } catch (e: any) {
    if (e?.code === 404) return json({ exists: false });
    console.error("[line-secrets][GET]", e);
    return json({ ok: false }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  await requireAdmin();
  originCheck(req);

  if (process.env.NODE_ENV !== "production") {
    await ensureLineSecretsByIdContainer().catch(() => { });
  }

  let body: Payload;
  try {
    body = await req.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const channelSecret = (body.channelSecret || "").trim();
  const channelAccessToken = (body.channelAccessToken || "").trim();
  const liffId = (body.liffId || "").trim() || undefined;

  if (!channelSecret || !channelAccessToken) {
    return new Response("channelSecret and channelAccessToken are required", { status: 400 });
  }

  const store = await cookies();
  const uid = store.get("uid")?.value ?? null;   // ★ これを id に使う
  if (!uid) return new Response("No admin uid", { status: 401 });

  const pack = seal({
    liffId,
    channelSecret,
    channelAccessToken,
  });

  const id = uid;
  const now = new Date().toISOString();
  const c = getLineSecretsByIdContainer();

  // rotation 継承
  let rotation = 0;
  try {
    const { resource } = await c.item(id, id).read<Doc>();
    if (resource) rotation = (resource.rotation ?? 0) + 1;
  } catch { }

  const doc: Doc = {
    id,                 // = 管理者UID
    enc: pack,
    rotation,
    createdAt: now,
    updatedAt: now,
    createdBy: rotation === 0 ? uid : undefined,
    updatedBy: uid,
  };

  await c.items.upsert(doc);

  return json({
    ok: true,
    updatedAt: now,
    rotation,
    fingerprints: {
      liffId: liffId ? fingerprint(liffId) : undefined,
      channelSecret: fingerprint(channelSecret),
      channelAccessToken: fingerprint(channelAccessToken),
    },
  });
}
