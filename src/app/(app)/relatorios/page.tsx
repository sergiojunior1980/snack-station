import Link from "next/link";
import { EmptyState, PageHero, Stat } from "@/components/page-hero";
import { RevenueChart } from "@/components/revenue-chart";
import { categoryLabel } from "@/lib/catalog";
import { addDays, formatBucket, formatDay, periodRange, seriesRange, type ReportGrain, type ReportPeriod } from "@/lib/dates";
import { formatBRL } from "@/lib/money";
import { revenueSeries, topProducts, unsoldProducts } from "@/server/queries";

const periods: { id: ReportPeriod; label: string }[] = [
  { id: "hoje", label: "Hoje" },
  { id: "semana", label: "Esta semana" },
  { id: "mes", label: "Este mês" },
  { id: "30d", label: "30 dias" },
];

const grains: { id: ReportGrain; label: string }[] = [
  { id: "day", label: "Por dia" },
  { id: "week", label: "Por semana" },
  { id: "month", label: "Por mês" },
];

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string; visao?: string }>;
}) {
  const params = await searchParams;
  const period = periods.some((item) => item.id === params.periodo) ? (params.periodo as ReportPeriod) : "mes";
  const grain = grains.some((item) => item.id === params.visao) ? (params.visao as ReportGrain) : "day";
  const selected = periodRange(period);
  const seriesWindow = seriesRange(grain);

  const [selectedSeries, chartSeries, ranking, quiet] = await Promise.all([
    revenueSeries(selected.from, selected.to, "day"),
    revenueSeries(seriesWindow.from, seriesWindow.to, grain),
    topProducts(selected.from, selected.to),
    unsoldProducts(selected.from, selected.to),
  ]);

  const total = selectedSeries.reduce((sum, row) => sum + Number(row.total_cents), 0);
  const count = selectedSeries.reduce((sum, row) => sum + Number(row.sale_count), 0);
  const chart = chartSeries.map((row) => ({
    label: formatBucket(String(row.bucket).slice(0, 10), grain),
    total: Number(row.total_cents),
  }));

  return (
    <div className="space-y-4">
      <PageHero
        eyebrow="Faturamento"
        title="O que vendeu e o que ficou parado"
        description={
          period === "30d"
            ? `De ${formatDay(selected.from)} a ${formatDay(addDays(selected.to, -1))}. São 30 dias: o dia de hoje e os 29 anteriores.`
            : `De ${formatDay(selected.from)} a ${formatDay(addDays(selected.to, -1))}, no horário de São Paulo.`
        }
      />
      <div className="flex flex-wrap gap-2">
        {periods.map((item) => (
          <Link
            key={item.id}
            href={`/relatorios?periodo=${item.id}&visao=${grain}`}
            className={`rounded-full px-3 py-1.5 text-sm ${item.id === period ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground"}`}
          >
            {item.label}
          </Link>
        ))}
      </div>
      <section className="grid gap-3 sm:grid-cols-3">
        <Stat label="Faturamento" value={formatBRL(total)} hint={periods.find((item) => item.id === period)?.label} />
        <Stat label="Vendas" value={String(count)} hint="Pedidos no período" />
        <Stat label="Ticket médio" value={count ? formatBRL(Math.round(total / count)) : formatBRL(0)} />
      </section>
      <section className="rounded-2xl border bg-card p-5">
        <div className="mb-4 flex flex-wrap gap-2">
          {grains.map((item) => (
            <Link
              key={item.id}
              href={`/relatorios?periodo=${period}&visao=${item.id}`}
              className={`rounded-full px-3 py-1.5 text-sm ${item.id === grain ? "bg-secondary text-secondary-foreground" : "text-muted-foreground"}`}
            >
              {item.label}
            </Link>
          ))}
        </div>
        <RevenueChart data={chart} />
      </section>
      <section className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-3">
          <h2 className="font-heading text-2xl">10 mais vendidos</h2>
          {ranking.length === 0 ? (
            <EmptyState title="Sem ranking ainda" description="Quando houver venda no período, os produtos mais pedidos aparecem aqui." />
          ) : (
            <ol className="space-y-2">
              {ranking.map((item, index) => (
                <li key={item.product_id} className="flex items-center justify-between rounded-2xl border bg-card px-4 py-3">
                  <div className="flex items-center gap-3">
                    <span className="font-heading text-lg text-primary">{index + 1}</span>
                    <div>
                      <p className="font-medium">{item.product_name}</p>
                      <p className="text-xs text-muted-foreground">{item.quantity} unidades</p>
                    </div>
                  </div>
                  <p className="text-sm font-medium">{formatBRL(Number(item.total_cents))}</p>
                </li>
              ))}
            </ol>
          )}
        </div>
        <div className="space-y-3">
          <h2 className="font-heading text-2xl">Não venderam</h2>
          {quiet.length === 0 ? (
            <EmptyState title="Tudo girou" description="Todo produto ativo teve pelo menos uma venda neste período." />
          ) : (
            <ul className="space-y-2">
              {quiet.map((item) => (
                <li key={item.product_id} className="flex items-center justify-between rounded-2xl border bg-card px-4 py-3">
                  <div>
                    <p className="font-medium">{item.product_name}</p>
                    <p className="text-xs text-muted-foreground">{categoryLabel(item.category)}</p>
                  </div>
                  <p className="text-sm text-muted-foreground">{item.stock_quantity} em estoque</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
