// lib/cosmos.ts
import { CosmosClient, type Database, type Container } from "@azure/cosmos";

let _db: Database | null = null;

/** DB を 1 度だけ初期化して再利用 */
export function getDb(): Database {
  if (_db) return _db;
  const conn = process.env.COSMOS_CONNECTION_STRING!;
  const dbName = process.env.COSMOS_DATABASE_NAME!;
  const client = new CosmosClient(conn);
  _db = client.database(dbName);
  return _db;
}

// ここをシンプルに
export function getLinksByIdContainer(): Container {
  const name = process.env.COSMOS_LINKS_BYID_CONTAINER || "linksById";
  return getDb().container(name);
}

/** 既存：lineUsers */
export function getLineUsersContainer(): Container {
  const name = process.env.COSMOS_LINE_USERS_CONTAINER || "lineUsers";
  return getDb().container(name);
}

/** 既存：/shopId の lineSecrets（必要なら残す） */
let _lineSecrets: Container | null = null;
export function getLineSecretsContainer(): Container {
  if (_lineSecrets) return _lineSecrets;
  const name = process.env.COSMOS_LINE_SECRETS_CONTAINER || "lineSecrets";
  _lineSecrets = getDb().container(name);
  return _lineSecrets;
}

/** 既存：/id の lineSecretsById（今回も使う） */
let _lineSecretsById: Container | null = null;
export function getLineSecretsByIdContainer(): Container {
  if (_lineSecretsById) return _lineSecretsById;
  const name = process.env.COSMOS_LINE_SECRETS_BYID_CONTAINER || "lineSecretsById";
  _lineSecretsById = getDb().container(name);
  return _lineSecretsById;
}

/** 開発用：存在しなければ /id で linksById を作成（本番では実行しない） */
// lib/cosmos.ts に追加（開発用）
export async function ensureLinksByIdContainer(): Promise<void> {
  if (process.env.NODE_ENV === "production") return;
  const db = getDb();
  const id = process.env.COSMOS_LINKS_BYID_CONTAINER || "linksById";
  await db.containers.createIfNotExists({ id, partitionKey: { paths: ["/id"] } });
}


/** 既存：lineSecretsById も dev で自動作成したい場合 */
export async function ensureLineSecretsByIdContainer(): Promise<void> {
  if (process.env.NODE_ENV === "production") return;
  const db = getDb();
  const id = process.env.COSMOS_LINE_SECRETS_BYID_CONTAINER || "lineSecretsById";
  await db.containers.createIfNotExists({
    id,
    partitionKey: { paths: ["/id"] },
  });
}



