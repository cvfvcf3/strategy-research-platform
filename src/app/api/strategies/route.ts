import { PAIRS_STRATEGIES, SINGLE_SYMBOL_STRATEGIES, SUGGESTED_PAIRS } from "@/lib/strategies/registry";

export const dynamic = "force-dynamic";

export async function GET() {
  const single = Object.values(SINGLE_SYMBOL_STRATEGIES).map((s) => ({
    key: s.key,
    name: s.name,
    description: s.description,
    defaultParams: s.defaultParams,
    kind: "single_symbol",
  }));
  const pairs = Object.values(PAIRS_STRATEGIES).map((s) => ({
    key: s.key,
    name: s.name,
    description: s.description,
    defaultParams: s.defaultParams,
    kind: "pairs",
    suggestedPairs: SUGGESTED_PAIRS,
  }));
  return Response.json({ strategies: [...single, ...pairs] });
}
