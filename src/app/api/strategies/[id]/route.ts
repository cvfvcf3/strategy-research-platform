import { getStrategyMeta } from "@/lib/strategies/registry";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const meta = getStrategyMeta(id);
  if (!meta) return Response.json({ error: `unknown strategy: ${id}` }, { status: 404 });
  return Response.json(meta);
}
