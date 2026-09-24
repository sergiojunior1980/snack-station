"use client";

import { Bar, BarChart, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatBRL } from "@/lib/money";

export function FinanceChart({
  data,
}: {
  data: { label: string; faturamento: number; despesa: number }[];
}) {
  const empty = data.every((row) => row.faturamento === 0 && row.despesa === 0);
  if (data.length === 0 || empty) {
    return <p className="px-2 py-10 text-center text-sm text-muted-foreground">Sem movimento neste recorte.</p>;
  }

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data}>
          <XAxis dataKey="label" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
          <YAxis hide />
          <Tooltip
            formatter={(value, name) => [formatBRL(Number(value ?? 0)), name === "despesa" ? "Despesa" : "Faturamento"]}
            cursor={{ fill: "rgba(184,0,46,0.08)" }}
          />
          <Legend formatter={(value) => (value === "despesa" ? "Despesa" : "Faturamento")} />
          <Bar dataKey="faturamento" fill="#b8002e" radius={[8, 8, 0, 0]} />
          <Bar dataKey="despesa" fill="#07071e" radius={[8, 8, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
