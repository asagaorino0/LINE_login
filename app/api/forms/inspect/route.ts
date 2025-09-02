// app/api/forms/inspect/route.ts
export const runtime = "nodejs";
import { NextRequest, NextResponse } from "next/server";

function cors(req: NextRequest) {
  const origin = req.headers.get("origin") ?? "*";
  return {
    "Access-Control-Allow-Origin": origin,
    Vary: "Origin",
    "Access-Control-Allow-Methods": "GET,OPTIONS",
    "Access-Control-Allow-Headers": "content-type",
  } as const;
}
export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: cors(req) });
}
export async function GET(req: NextRequest) {
  const u = new URL(req.url);
  const form = u.searchParams.get("form");
  if (!form) return NextResponse.json({ ok: false, code: "NO_FORM" }, { status: 400, headers: cors(req) });

  const r = await fetch(form, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
    },
    cache: "no-store",
  });
  if (!r.ok) return NextResponse.json({ ok: false, code: "FETCH_FAILED", status: r.status }, { status: 502, headers: cors(req) });

  const html = await r.text();
  return new NextResponse(html, { status: 200, headers: { ...cors(req), "content-type": "text/html; charset=utf-8" } });
}
