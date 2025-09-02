// lib/linkSign.ts
import { createHmac, timingSafeEqual } from "crypto";

function getSecret() {
  const s = process.env.LINK_SIGN_SECRET;
  if (!s) throw new Error("LINK_SIGN_SECRET is not set");
  return s;
}
const b64u = (buf: Buffer) => buf.toString("base64url");

/** 署名を作る（HMAC-SHA256, base64url） */
export function sign(aid: string, formId: string, expSec: number): string {
  const data = `${aid}.${formId}.${expSec}`;
  const mac = createHmac("sha256", getSecret()).update(data).digest();
  return b64u(mac);
}

/** 署名を検証する（有効期限も検証） */
export function verify(aid: string, formId: string, expSec: number, sig: string): boolean {
  if (!aid || !formId || !expSec || !sig) return false;
  if (Math.floor(Date.now() / 1000) > Number(expSec)) return false;
  const data = `${aid}.${formId}.${expSec}`;
  const expected = createHmac("sha256", getSecret()).update(data).digest();
  const got = Buffer.from(sig, "base64url");
  return got.length === expected.length && timingSafeEqual(got, expected);
}
