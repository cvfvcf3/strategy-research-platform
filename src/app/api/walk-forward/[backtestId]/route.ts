import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { walkForwardRuns } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ backtestId: string }> }) {
  const { backtestId } = await params;
  const id = Number(backtestId);
  if (!Number.isInteger(id)) return Response.json({ error: "invalid backtestId" }, { status: 400 });

  const rows = await db.select().from(walkForwardRuns).where(eq(walkForwardRuns.backtestId, id)).orderBy(desc(walkForwardRuns.createdAt));
  if (rows.length === 0) return Response.json({ error: "no walk-forward run for this backtest" }, { status: 404 });
  return Response.json(rows[0]);
}
