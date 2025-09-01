// lib/cosmos.ts
import {
  CosmosClient,
  Database,
  Container,
  PartitionKeyKind,
  PartitionKeyDefinitionVersion,
} from "@azure/cosmos";

let _db: Database | null = null;

export function getDb(): Database {
  if (_db) return _db;
  const conn = process.env.COSMOS_CONNECTION_STRING;
  const dbName = process.env.COSMOS_DATABASE_NAME;
  if (!conn) throw new Error("COSMOS_CONNECTION_STRING is not set");
  if (!dbName) throw new Error("COSMOS_DATABASE_NAME is not set");
  const client = new CosmosClient(conn);
  _db = client.database(dbName);
  return _db;
}

export function getLineUsersContainer(): Container {
  const name = process.env.COSMOS_LINE_USERS_CONTAINER || "lineUsers";
  return getDb().container(name);
}

/* 既存: /shopId の lineSecrets（必要なら残す） */
let _lineSecrets: Container | null = null;
export function getLineSecretsContainer(): Container {
  if (_lineSecrets) return _lineSecrets;
  const name = process.env.COSMOS_LINE_SECRETS_CONTAINER || "lineSecrets";
  _lineSecrets = getDb().container(name);
  return _lineSecrets;
}

/* 新規: /id パーティションの lineSecretsById（今回の保存先） */
let _lineSecretsById: Container | null = null;
export function getLineSecretsByIdContainer(): Container {
  if (_lineSecretsById) return _lineSecretsById;
  const name = process.env.COSMOS_LINE_SECRETS_BYID_CONTAINER || "lineSecretsById";
  _lineSecretsById = getDb().container(name);
  return _lineSecretsById;
}

/* 開発用: 存在しなければ /id で作成 */
export async function ensureLineSecretsByIdContainer(): Promise<void> {
  if (process.env.NODE_ENV === "production") return;
  const db = getDb();
  const id = process.env.COSMOS_LINE_SECRETS_BYID_CONTAINER || "lineSecretsById";
  await db.containers.createIfNotExists({
    id,
    partitionKey: { paths: ["/id"] }, // ← /id パーティション
  });
}



