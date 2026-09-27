import { getStrategyMeta } from "@/lib/strategies/registry";
import RunBacktestForm from "@/components/RunBacktestForm";
import { notFound } from "next/navigation";

export default async function StrategyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const strategy = getStrategyMeta(id);
  if (!strategy) notFound();

  return (
    <div>
      <h2 className="text-lg font-medium">{strategy.name}</h2>
      <p className="mt-2 text-sm text-slate-400">{strategy.description}</p>

      <h3 className="mt-6 text-sm font-medium text-slate-300">Default parameters</h3>
      <pre className="mt-2 rounded border border-slate-800 bg-slate-950 p-3 text-xs text-slate-400">
        {JSON.stringify(strategy.defaultParams, null, 2)}
      </pre>

      <RunBacktestForm strategyKey={strategy.key} isPairs={strategy.kind === "pairs"} />
    </div>
  );
}
