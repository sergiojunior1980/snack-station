"use client";

import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatBRL } from "@/lib/money";

export function RevenueChart({ data }: { data: { label: string; total: number }[] }) {
  if (data.length === 0) {
    return <p className="px-2 py-10 text-center text-sm text-muted-foreground">Sem vendas neste recorte.</p>;
  }

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data}>
          <XAxis dataKey="label" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
          <YAxis hide />
          <Tooltip
            formatter={(value) => formatBRL(Number(value ?? 0))}
            cursor={{ fill: "rgba(184,0,46,0.08)" }}
          />
          <Bar dataKey="total" fill="#b8002e" radius={[8, 8, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
