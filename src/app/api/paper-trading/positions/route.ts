import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { paperTrades } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await db.select().from(paperTrades).where(eq(paperTrades.status, "OPEN"));
  return Response.json({ positions: rows });
}
