"use client";

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

export default function EquityCurveChart({ data }: { data: { t: number; equity: number }[] }) {
  const points = data.map((d) => ({ date: new Date(d.t).toISOString().slice(0, 10), equity: d.equity }));
  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={points}>
        <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
        <XAxis dataKey="date" tick={{ fill: "#64748b", fontSize: 11 }} minTickGap={40} />
        <YAxis tick={{ fill: "#64748b", fontSize: 11 }} domain={["auto", "auto"]} />
        <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #1e293b", fontSize: 12 }} />
        <Line type="monotone" dataKey="equity" stroke="#fbbf24" dot={false} strokeWidth={1.5} />
      </LineChart>
    </ResponsiveContainer>
  );
}
