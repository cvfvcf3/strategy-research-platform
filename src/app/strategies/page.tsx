import { PAIRS_STRATEGIES, SINGLE_SYMBOL_STRATEGIES } from "@/lib/strategies/registry";

export default function StrategiesPage() {
  const all = [...Object.values(SINGLE_SYMBOL_STRATEGIES), ...Object.values(PAIRS_STRATEGIES)];
  return (
    <div>
      <h2 className="mb-4 text-lg font-medium">Strategies</h2>
      <div className="space-y-3">
        {all.map((s) => (
          <a key={s.key} href={`/strategies/${s.key}`} className="block rounded border border-slate-800 bg-slate-900/40 px-4 py-3 hover:border-slate-700">
            <div className="font-medium">{s.name}</div>
            <div className="mt-1 text-sm text-slate-400">{s.description}</div>
          </a>
        ))}
      </div>
    </div>
  );
}
