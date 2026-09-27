const STYLES: Record<string, string> = {
  DONE: "bg-emerald-950 text-emerald-400 border-emerald-800",
  PASS: "bg-emerald-950 text-emerald-400 border-emerald-800",
  RUNNING: "bg-amber-950 text-amber-400 border-amber-800",
  PENDING: "bg-amber-950 text-amber-400 border-amber-800",
  REJECTED: "bg-rose-950 text-rose-400 border-rose-800",
  FAILED: "bg-rose-950 text-rose-400 border-rose-800",
  FAIL: "bg-rose-950 text-rose-400 border-rose-800",
  OPEN: "bg-sky-950 text-sky-400 border-sky-800",
  CLOSED: "bg-slate-800 text-slate-400 border-slate-700",
};

export default function StatusBadge({ status }: { status: string }) {
  const style = STYLES[status] ?? "bg-slate-800 text-slate-400 border-slate-700";
  return <span className={`rounded border px-2 py-0.5 text-xs font-medium ${style}`}>{status}</span>;
}
