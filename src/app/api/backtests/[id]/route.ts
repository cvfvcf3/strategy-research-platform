import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { backtests } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const backtestId = Number(id);
  if (!Number.isInteger(backtestId)) return Response.json({ error: "invalid id" }, { status: 400 });

  const [row] = await db.select().from(backtests).where(eq(backtests.id, backtestId));
  if (!row) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json(row);
}
