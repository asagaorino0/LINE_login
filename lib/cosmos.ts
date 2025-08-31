// lib/cosmos.ts
import { CosmosClient, Database, Container } from "@azure/cosmos";

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
