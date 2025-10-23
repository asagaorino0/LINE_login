// app/api/entry-mappings/route.ts
import { NextRequest, NextResponse } from "next/server";
import { SqlQuerySpec } from "@azure/cosmos";
import { getEntryMappingsContainer } from "@/lib/cosmos";

export const runtime = "nodejs";

type MappingDoc = {
  id: string;        // `${liffId}__${formId}`
  liffId: string;
  formId: string;
  entry: string;     // "entry.XXXXXXXXX"
  formUrl?: string;
  createdAt: string; // ISO
  updatedAt: string; // ISO
};

// GoogleフォームURL等から formId を抽出
function extractFormId(input: string | undefined | null): string | null {
  if (!input) return null;
  const s = String(input);
  const m1 = s.match(/\/forms\/d\/e\/([a-zA-Z0-9_-]+)\//);
  if (m1?.[1]) return m1[1];
  const m2 = s.match(/\/forms\/d\/([a-zA-Z0-9_-]+)\//);
  if (m2?.[1]) return m2[1];
  if (/^[A-Za-z0-9_-]{20,}$/.test(s)) return s;
  return null;
}

// "entry.123456789" に統一
function ensureEntryFormat(s: string): string {
  const t = (s || "").trim();
  if (!t) return t;
  if (/^entry\.\d+$/i.test(t)) return t;
  if (/^\d+$/.test(t)) return `entry.${t}`;
  const m = t.match(/(\d{5,})/);
  return m ? `entry.${m[1]}` : t;
}

function badRequest(message: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ ok: false, code: "BAD_REQUEST", message, ...extra }, { status: 400 });
}
function notFound(message = "mapping not found") {
  return NextResponse.json({ ok: false, code: "NOT_FOUND", message }, { status: 404 });
}
function serverError(e: unknown) {
  const msg = e instanceof Error ? e.message : String(e);
  return NextResponse.json({ ok: false, code: "SERVER_ERROR", message: msg }, { status: 500 });
}

// GET /api/entry-mappings?liffId=...&formId=... | or &formUrl=...
export async function GET(req: NextRequest) {
  try {
    const container = getEntryMappingsContainer();
    const sp = req.nextUrl.searchParams;

    const liffId = sp.get("liffId")?.trim();
    const formId = (sp.get("formId") || extractFormId(sp.get("formUrl")))?.trim() || "";

    if (!liffId) return badRequest("liffId is required");
    if (!formId) return badRequest("formId or formUrl is required");

    const query: SqlQuerySpec = {
      query: "SELECT TOP 1 * FROM c WHERE c.liffId = @liffId AND c.formId = @formId",
      parameters: [
        { name: "@liffId", value: liffId },
        { name: "@formId", value: formId },
      ],
    };

    // FeedOptions.partitionKey は OK（SDK v3）
    const { resources } = await container.items.query<MappingDoc>(query, { partitionKey: liffId }).fetchAll();
    const doc = resources?.[0];
    if (!doc) return notFound();

    return NextResponse.json({
      ok: true,
      data: {
        liffId: doc.liffId,
        formId: doc.formId,
        entry: doc.entry,
        formUrl: doc.formUrl ?? null,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      },
    });
  } catch (e) {
    return serverError(e);
  }
}

// POST /api/entry-mappings
// body: { liffId: string; formId?: string; formUrl?: string; entry: string; }
export async function POST(req: NextRequest) {
  try {
    const container = getEntryMappingsContainer();
    const body = await req.json().catch(() => ({}));

    const liffId = String(body?.liffId || "").trim();
    let formId = String(body?.formId || "").trim();
    const formUrl = body?.formUrl ? String(body.formUrl) : undefined;
    const entryRaw = String(body?.entry || "").trim();

    if (!liffId) return badRequest("liffId is required");
    if (!entryRaw) return badRequest("entry is required");
    if (!formId) {
      const extracted = extractFormId(formUrl);
      if (extracted) formId = extracted;
    }
    if (!formId) return badRequest("formId or formUrl is required");

    const entry = ensureEntryFormat(entryRaw);
    const id = `${liffId}__${formId}`;
    const now = new Date().toISOString();

    const doc: MappingDoc = {
      id,
      liffId,
      formId,
      entry,
      formUrl,
      createdAt: now,
      updatedAt: now,
    };

    // 既存の createdAt を維持
    try {
      const { resource: existing } = await container.item(id, liffId).read<MappingDoc>();
      if (existing?.createdAt) doc.createdAt = existing.createdAt;
    } catch { /* not found → 新規 */ }

    // upsert に partitionKey オプションは渡さない（ドキュメントから自動解決）
    const upsertRes = await container.items.upsert<MappingDoc>(doc);
    const saved = upsertRes.resource;
    if (!saved) throw new Error("Cosmos upsert failed: no resource returned");

    return NextResponse.json({
      ok: true,
      data: {
        liffId: saved.liffId,
        formId: saved.formId,
        entry: saved.entry,
        formUrl: saved.formUrl ?? null,
        createdAt: saved.createdAt,
        updatedAt: saved.updatedAt,
      },
      message: "saved",
    });
  } catch (e) {
    return serverError(e);
  }
}

export async function OPTIONS() {
  return NextResponse.json({}, { status: 200 });
}
