// // app/api/form-submissions/[lineUserId]/route.ts
// import { NextResponse } from 'next/server';
// export const runtime = 'nodejs';

// type Params = { lineUserId: string };

// export async function GET(
//   _req: Request,
//   { params }: { params: Params }  // ← 第2引数は { params: ... } の形にする
// ) {
//   const { lineUserId } = params;

//   // ここでDB読むなどの処理
//   // const data = await getSomething(lineUserId);

//   return NextResponse.json({ ok: true, lineUserId });
// }

// // （必要なら）POSTも同様に
// export async function POST(
//   req: Request,
//   { params }: { params: Params }
// ) {
//   const body = await req.json();
//   // 保存処理など
//   return NextResponse.json({ ok: true, received: body, params });
// }

// app/api/form-submissions/[lineUserId]/route.ts
import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  req: NextRequest,
  context: { params: { lineUserId: string } }
) {
  const { lineUserId } = context.params;
  return NextResponse.json({ ok: true, lineUserId });
}


export async function POST(
  req: NextRequest,
  context: { params: { lineUserId: string } }
) {
  const body = await req.json();
  return NextResponse.json({
    ok: true,
    lineUserId: context.params.lineUserId,
    body
  });
}
