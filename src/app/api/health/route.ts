import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await db.execute(sql`select 1`);
    return Response.json({ status: "ok", database: "ok", timestamp: new Date().toISOString() });
  } catch (err) {
    return Response.json(
      { status: "degraded", database: "unreachable", error: String(err), timestamp: new Date().toISOString() },
      { status: 503 },
    );
  }
}
