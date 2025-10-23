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

export const getCosmosDatabase = (): Database => db;
const getContainer = (name: string): Container =>
  getCosmosDatabase().container(name);

/** 既存：他用途 */
export function getLineUsersByIdContainer() {
  return getContainer(process.env.COSMOS_LINE_USERS_CONTAINER ?? "lineUsersById");
}
export const getLineUsersContainer = () => getContainer("lineUsers");
export const getLineSecretsByIdContainer = () => getContainer("lineSecretsById");
export const getLinksByIdContainer = () => getContainer("linksById");

/** ★ 追加：entryMappings コンテナ */
export const getEntryMappingsContainer = () =>
  getContainer(process.env.COSMOS_ENTRY_MAPPINGS_CONTAINER ?? "entryMappings");
