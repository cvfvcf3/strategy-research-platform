import { PAIRS_STRATEGIES, SINGLE_SYMBOL_STRATEGIES } from "@/lib/strategies/registry";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const single = (SINGLE_SYMBOL_STRATEGIES as Record<string, (typeof SINGLE_SYMBOL_STRATEGIES)["donchian_breakout"]>)[id];
  if (single) {
    return Response.json({ key: single.key, name: single.name, description: single.description, defaultParams: single.defaultParams, kind: "single_symbol" });
  }
  const pair = (PAIRS_STRATEGIES as Record<string, (typeof PAIRS_STRATEGIES)["pairs_trading"]>)[id];
  if (pair) {
    return Response.json({ key: pair.key, name: pair.name, description: pair.description, defaultParams: pair.defaultParams, kind: "pairs" });
  }
  return Response.json({ error: `unknown strategy: ${id}` }, { status: 404 });
}
