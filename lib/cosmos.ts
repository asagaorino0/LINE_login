// lib/cosmos.ts
import { CosmosClient } from "@azure/cosmos";

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

// コンテナ取得
export const getLineUsersContainer = () => db.container("lineUsers");
export const getLineSecretsByIdContainer = () => db.container("lineSecretsById");
export const getLinksByIdContainer = () => db.container("linksById");
