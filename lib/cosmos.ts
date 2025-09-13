// lib/cosmos.ts
import { CosmosClient, type Database, type Container } from "@azure/cosmos";

const CS =
  process.env.AZURE_COSMOS_CONNECTION_STRING ??
  process.env.COSMOS_CONNECTION_STRING ?? null;

const ENDPOINT =
  process.env.AZURE_COSMOS_ENDPOINT ??
  process.env.COSMOS_ENDPOINT ?? null;

const KEY =
  process.env.AZURE_COSMOS_KEY ??
  process.env.COSMOS_KEY ?? null;

const DBID =
  process.env.AZURE_COSMOS_DATABASE ??
  process.env.COSMOS_DATABASE_NAME ?? "linebot-app";

if (!CS && (!ENDPOINT || !KEY)) {
  throw new Error(
    "Cosmos env missing: set AZURE_COSMOS_CONNECTION_STRING or (AZURE_COSMOS_ENDPOINT + AZURE_COSMOS_KEY)"
  );
}

const client = CS
  ? new CosmosClient({ connectionString: CS })
  : new CosmosClient({ endpoint: ENDPOINT!, key: KEY! });

const db = client.database(DBID);

/** ★ 追加：既存の db を返すだけのヘルパ */
export const getCosmosDatabase = (): Database => db;

/** 共通のコンテナ取得ヘルパ（任意） */
const getContainer = (name: string): Container =>
  getCosmosDatabase().container(name);

/** ここから用途別アクセサ */
export function getLineUsersByIdContainer() {
  // パーティションキー "/id" を想定
  return getContainer(process.env.COSMOS_LINE_USERS_CONTAINER ?? "lineUsersById");
}

export const getLineUsersContainer = () => getContainer("lineUsers");
export const getLineSecretsByIdContainer = () => getContainer("lineSecretsById");
export const getLinksByIdContainer = () => getContainer("linksById");
