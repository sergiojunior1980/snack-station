import Link from "next/link";
import { EmptyState, PageHero, Stat } from "@/components/page-hero";
import { RevenueChart } from "@/components/revenue-chart";
import { ReportRange } from "@/components/report-range";
import { categoryLabel } from "@/lib/catalog";
import { addDays, dayStamp, formatBucket, formatDay, inclusiveRange, periodRange, type ReportGrain, type ReportPeriod } from "@/lib/dates";
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

function reportHref(query: Record<string, string>) {
  return `/relatorios?${new URLSearchParams(query).toString()}`;
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string; visao?: string; inicio?: string; fim?: string }>;
}) {
  const params = await searchParams;
  const period = periods.some((item) => item.id === params.periodo) ? (params.periodo as ReportPeriod) : "mes";
  const grain = grains.some((item) => item.id === params.visao) ? (params.visao as ReportGrain) : "day";
  const askedCustom = Boolean(params.inicio || params.fim);
  const custom = askedCustom ? inclusiveRange(params.inicio ?? "", params.fim ?? "") : null;
  const selected = custom ?? periodRange(period);
  const startValue = params.inicio || dayStamp(selected.from);
  const endValue = params.fim || dayStamp(addDays(selected.to, -1));

  const [chartSeries, ranking, quiet] = await Promise.all([
    revenueSeries(selected.from, selected.to, grain),
    topProducts(selected.from, selected.to),
    unsoldProducts(selected.from, selected.to),
  ]);

  const total = chartSeries.reduce((sum, row) => sum + Number(row.total_cents), 0);
  const count = chartSeries.reduce((sum, row) => sum + Number(row.sale_count), 0);
  const chart = chartSeries.map((row) => ({
    label: formatBucket(String(row.bucket).slice(0, 10), grain),
    total: Number(row.total_cents),
  }));

  return (
    <div className="space-y-3">
      <PageHero
        eyebrow="Faturamento"
        title="O que vendeu e o que ficou parado"
        description={
          askedCustom && !custom
            ? "A data fim precisa ser igual ou posterior à data início."
            : custom
              ? `De ${formatDay(selected.from)} a ${formatDay(addDays(selected.to, -1))}, incluindo os dois dias.`
              : period === "30d"
                ? `De ${formatDay(selected.from)} a ${formatDay(addDays(selected.to, -1))}. São 30 dias: o dia de hoje e os 29 anteriores.`
                : `De ${formatDay(selected.from)} a ${formatDay(addDays(selected.to, -1))}, no horário de São Paulo.`
        }
      />
      <div className="flex flex-wrap items-center gap-2">
        {periods.map((item) => (
          <Link
            key={item.id}
            href={reportHref({ periodo: item.id, visao: grain })}
            className={`rounded-full px-3 py-1 text-sm ${!custom && item.id === period ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground"}`}
          >
            {item.label}
          </Link>
        ))}
      </div>
      <ReportRange key={`${startValue}-${endValue}-${grain}`} inicio={startValue} fim={endValue} visao={grain} />
      <section className="grid gap-2 sm:grid-cols-3">
        <Stat label="Faturamento" value={formatBRL(total)} hint={custom ? "Período escolhido" : periods.find((item) => item.id === period)?.label} />
        <Stat label="Vendas" value={String(count)} hint="Pedidos no período" />
        <Stat label="Ticket médio" value={count ? formatBRL(Math.round(total / count)) : formatBRL(0)} />
      </section>
      <section className="rounded-xl border bg-card p-3">
        <div className="mb-2 flex flex-wrap gap-2">
          {grains.map((item) => (
            <Link
              key={item.id}
              href={reportHref(custom ? { inicio: startValue, fim: endValue, visao: item.id } : { periodo: period, visao: item.id })}
              className={`rounded-full px-3 py-1 text-sm ${item.id === grain ? "bg-secondary text-secondary-foreground" : "text-muted-foreground"}`}
            >
              {item.label}
            </Link>
          ))}
        </div>
        <RevenueChart data={chart} />
      </section>
      <section className="grid gap-3 lg:grid-cols-2">
        <div className="space-y-2">
          <h2 className="font-heading text-lg">10 mais vendidos</h2>
          {ranking.length === 0 ? (
            <EmptyState title="Sem ranking ainda" description="Quando houver venda no período, os produtos mais pedidos aparecem aqui." />
          ) : (
            <ol className="space-y-1.5">
              {ranking.map((item, index) => (
                <li key={item.product_id} className="flex items-center justify-between rounded-xl border bg-card px-3 py-2">
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
        <div className="space-y-2">
          <h2 className="font-heading text-lg">Não venderam</h2>
          {quiet.length === 0 ? (
            <EmptyState title="Tudo girou" description="Todo produto ativo teve pelo menos uma venda neste período." />
          ) : (
            <ul className="space-y-1.5">
              {quiet.map((item) => (
                <li key={item.product_id} className="flex items-center justify-between rounded-xl border bg-card px-3 py-2">
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
