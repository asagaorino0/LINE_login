// Node.js ランタイム専用
import { randomBytes, createCipheriv, createDecipheriv, pbkdf2Sync, createHmac } from "crypto";

export type EncPack = {
  v: "v1";
  alg: "aes-256-gcm";
  salt: string; // base64url
  iv: string;   // base64url
  ct: string;   // base64url
  tag: string;  // base64url
};

const ALG = "aes-256-gcm" as const;
const ITER = 310_000; // PBKDF2反復回数（CPUコスト）
const KEYLEN = 32;

function b64u(buf: Buffer) { return buf.toString("base64url"); }
function ub64u(s: string) { return Buffer.from(s, "base64url"); }

function deriveKey(salt: Buffer): Buffer {
  const mk = process.env.SECRETS_MASTER_KEY;
  if (!mk) throw new Error("SECRETS_MASTER_KEY is not set");
  return pbkdf2Sync(mk, salt, ITER, KEYLEN, "sha256");
}

export function seal(obj: unknown): EncPack {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = deriveKey(salt);
  const cipher = createCipheriv(ALG, key, iv);
  const pt = Buffer.from(JSON.stringify(obj), "utf8");
  const ct = Buffer.concat([cipher.update(pt), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { v: "v1", alg: ALG, salt: b64u(salt), iv: b64u(iv), ct: b64u(ct), tag: b64u(tag) };
}

export function open(enc: EncPack): any {
  const salt = ub64u(enc.salt);
  const iv = ub64u(enc.iv);
  const tag = ub64u(enc.tag);
  const ct = ub64u(enc.ct);
  const key = deriveKey(salt);
  const decipher = createDecipheriv(ALG, key, iv);
  decipher.setAuthTag(tag);
  const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
  return JSON.parse(pt.toString("utf8"));
}

// 平文を晒さずにユーザー用「指紋」を出す（同値判定用）
export function fingerprint(value: string): string {
  const mk = process.env.SECRETS_MASTER_KEY ?? "fallback";
  const h = createHmac("sha256", mk).update(value, "utf8").digest("hex");
  return `sha256:${h.slice(0, 12)}`; // 12桁表示
}

// キーヒント：shopIdごとにHMAC先頭を保存しておくと回転時の追跡に便利
export function keyHint(shopId: string): string {
  const mk = process.env.SECRETS_MASTER_KEY ?? "fallback";
  return createHmac("sha256", mk).update(shopId, "utf8").digest("hex").slice(0, 16);
}
