import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { monteCarloRuns } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ backtestId: string }> }) {
  const { backtestId } = await params;
  const id = Number(backtestId);
  if (!Number.isInteger(id)) return Response.json({ error: "invalid backtestId" }, { status: 400 });

  const rows = await db.select().from(monteCarloRuns).where(eq(monteCarloRuns.backtestId, id)).orderBy(desc(monteCarloRuns.createdAt));
  if (rows.length === 0) return Response.json({ error: "no monte-carlo run for this backtest" }, { status: 404 });
  return Response.json({ runs: rows });
}
