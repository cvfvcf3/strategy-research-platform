import { z } from "zod";
import { getPaperEquityCurve } from "@/lib/paper-trading/journal";

export const dynamic = "force-dynamic";

const querySchema = z.object({ strategyKey: z.string().min(1) });

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) return Response.json({ error: "strategyKey query param required" }, { status: 400 });
  const rows = await getPaperEquityCurve(parsed.data.strategyKey);
  return Response.json({ equity: rows });
}
