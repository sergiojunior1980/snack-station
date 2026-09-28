import { ModuleNav } from "@/components/module-nav";
import { PageHero, Stat } from "@/components/page-hero";
import { ReportControls } from "@/components/report-controls";
import { RevenueChart } from "@/components/revenue-chart";
import { formatBucket } from "@/lib/dates";
import { formatBRL } from "@/lib/money";
import { reportLinks } from "@/lib/report-nav";
import { reportPeriods, resolveReportSearch } from "@/lib/report-search";
import { revenueSeries } from "@/server/queries";

const base = "/relatorios/financeiro/faturamento";

export default async function RevenueReportPage({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string; visao?: string; inicio?: string; fim?: string }>;
}) {
  const report = resolveReportSearch(await searchParams);
  const chartSeries = await revenueSeries(report.selected.from, report.selected.to, report.grain);
  const total = chartSeries.reduce((sum, row) => sum + Number(row.total_cents), 0);
  const count = chartSeries.reduce((sum, row) => sum + Number(row.sale_count), 0);
  const chart = chartSeries.map((row) => ({
    label: formatBucket(String(row.bucket).slice(0, 10), report.grain),
    total: Number(row.total_cents),
  }));

  return (
    <div className="space-y-3">
      <PageHero eyebrow="Financeiro" title="Faturamento" description={report.description} />
      <ModuleNav items={reportLinks} />
      <ReportControls base={base} report={report} grain />
      <section className="grid gap-2 sm:grid-cols-3">
        <Stat label="Faturamento" value={formatBRL(total)} hint={report.custom ? "Período escolhido" : reportPeriods.find((item) => item.id === report.period)?.label} />
        <Stat label="Vendas" value={String(count)} hint="Pedidos no período" />
        <Stat label="Ticket médio" value={count ? formatBRL(Math.round(total / count)) : formatBRL(0)} />
      </section>
      <section className="rounded-xl border bg-card p-3">
        <RevenueChart data={chart} />
      </section>
    </div>
  );
}
