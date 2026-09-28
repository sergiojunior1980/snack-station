import { ModuleNav } from "@/components/module-nav";
import { EmptyState, PageHero } from "@/components/page-hero";
import { ReportControls } from "@/components/report-controls";
import { formatBRL } from "@/lib/money";
import { reportLinks } from "@/lib/report-nav";
import { resolveReportSearch } from "@/lib/report-search";
import { topProducts } from "@/server/queries";

const base = "/relatorios/financeiro/vendidos";

export default async function TopProductsReportPage({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string; visao?: string; inicio?: string; fim?: string }>;
}) {
  const report = resolveReportSearch(await searchParams);
  const ranking = await topProducts(report.selected.from, report.selected.to);

  return (
    <div className="space-y-3">
      <PageHero eyebrow="Financeiro" title="Mais vendidos" description={report.description} />
      <ModuleNav items={reportLinks} />
      <ReportControls base={base} report={report} />
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
  );
}
