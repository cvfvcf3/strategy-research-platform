import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

declare global {
  // eslint-disable-next-line no-var
  var __srp_pg_client: ReturnType<typeof postgres> | undefined;
}

function getClient() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set");
  }
  // Reuse the connection across hot-reloads / serverless warm invocations
  // instead of opening a new pool on every import.
  if (!global.__srp_pg_client) {
    global.__srp_pg_client = postgres(process.env.DATABASE_URL, { max: 5 });
  }
  return global.__srp_pg_client;
}

export const db = drizzle(getClient(), { schema });
